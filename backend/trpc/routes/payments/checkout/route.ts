import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { computeAmount } from '@/backend/lib/mastercard';
import { Subscription } from '@/types';
import { 
  firestorePayments, 
  firestoreSubscriptions, 
  firestoreCoupons, 
  firestoreUsers, 
  firestoreWalletTransactions 
} from '@/backend/lib/firestore-admin';
import { payWithToken, payWithCard, payWithAuthentication } from '@/backend/lib/mastercard';

/**
 * Unified checkout endpoint for all payment methods
 * Supports: Wallet + Apple Pay / Google Pay / Card
 */
export default protectedProcedure
  .input(
    z.object({
      userId: z.string(),
      tier: z.enum(['silver', 'gold', 'diamond', 'elite']),
      duration: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
      useWallet: z.boolean().default(false),
      paymentMethod: z.enum(['card']).default('card'), // Card payments only
      // paymentToken removed - not needed for card payments
      // For Card payments
      cardNumber: z.string().optional(),
      expiryMonth: z.string().optional(),
      expiryYear: z.string().optional(),
      cardholderName: z.string().optional(),
      cvv: z.string().optional(), // Card Security Code (CVV/CVC)
      // For saved cards (VERSION 1 feature)
      savedCardId: z.string().optional(), // ID of saved card to use
      saveCard: z.boolean().optional().default(false), // Whether to save the card after payment
      // Optional coupon
      couponCode: z.string().optional(),
      currency: z.string().optional().default('JOD'),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }

    const currency = input.currency || 'JOD';

    // VERSION 1: Restrict to card payments only - Apple Pay and Google Pay disabled
    if (input.paymentMethod !== 'card') {
      throw new Error('Only card payments are supported in Version 1. Apple Pay and Google Pay will be available in Version 2.');
    }

    // 1. Calculate subscription price
    const { amount: originalAmount, monthlyPrice } = computeAmount({
      tier: input.tier,
      duration: input.duration,
      currency,
    });

    // 2. Validate and apply coupon if provided
    let finalAmount = originalAmount;
    let couponId: string | null = null;
    let discountAmount = 0;

    if (input.couponCode) {
      const upperCode = input.couponCode.toUpperCase().trim();
      const coupon = await firestoreCoupons.getByCode(upperCode);

      if (!coupon) {
        throw new Error('Invalid coupon code');
      }

      if (!coupon.isActive) {
        throw new Error('This coupon is not active');
      }

      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw new Error('This coupon has expired');
      }

      if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
        throw new Error('This coupon has reached its usage limit');
      }

      discountAmount = (originalAmount * coupon.discountPercent) / 100;
      finalAmount = Math.max(0, originalAmount - discountAmount);
      couponId = coupon.id;
    }

    // 3. Check for existing active subscription
    const existingSubscription = await firestoreSubscriptions.getByUserId(input.userId);
    if (existingSubscription) {
      const endDate = existingSubscription.endDate ? new Date(existingSubscription.endDate) : null;
      const now = new Date();
      if (existingSubscription.isActive && endDate && endDate.getTime() > now.getTime()) {
        throw new Error('You already have an active subscription');
      }
    }

    // 4. Get user wallet balance and calculate wallet usage
    const user = await firestoreUsers.getById(input.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const walletBalance = user.walletBalance || 0;
    const walletUsed = input.useWallet ? Math.min(walletBalance, finalAmount) : 0;
    const remainingAmount = Math.max(0, finalAmount - walletUsed);

    // Validate wallet usage
    if (input.useWallet && walletUsed > walletBalance) {
      throw new Error('Insufficient wallet balance');
    }
    if (walletUsed < 0) {
      throw new Error('Wallet amount cannot be negative');
    }

    // 5. Generate order ID
    const timestamp = Date.now();
    const shortUserId = input.userId.substring(0, 10);
    const orderId = `ord-${timestamp}-${shortUserId}`;
    const paymentTransactionId = '1';

    // 6. Create payment record (status: PROCESSING)
    await firestorePayments.create({
      id: `${orderId}-${paymentTransactionId}`,
      userId: input.userId,
      tier: input.tier,
      duration: input.duration,
      amount: remainingAmount,
      originalAmount,
      discountAmount,
      currency,
      orderId,
      transactionId: paymentTransactionId,
      status: 'PROCESSING_PAYMENT',
      couponCode: input.couponCode?.toUpperCase().trim() || null,
      walletUsed: walletUsed,
      externalPaymentAmount: remainingAmount,
      totalAmount: finalAmount,
      paymentMethod: input.paymentMethod,
    });

    // 7. Process external payment if remaining amount > 0
    let gatewayResponse = null;
    let paymentSuccess = false;

    if (remainingAmount > 0) {
      // VERSION 1: Only card payments are supported
      // Apple Pay and Google Pay code preserved for Version 2
      // After the check on line 49, TypeScript knows paymentMethod can only be 'card'
      if (input.paymentMethod === 'card') {
        // Debug: Log received CVV (masked for security)
        console.log('[Checkout] Received payment data:', {
          hasSavedCardId: !!input.savedCardId,
          hasCardNumber: !!input.cardNumber,
          hasCvv: !!input.cvv,
          cvvLength: input.cvv ? input.cvv.length : 0,
          cvvPreview: input.cvv ? `${input.cvv.substring(0, 1)}**` : 'missing',
        });

        // Validate CVV is provided and valid (required for all card payments)
        if (!input.cvv || typeof input.cvv !== 'string' || input.cvv.trim().length < 3) {
          console.error('[Checkout] CVV validation failed:', {
            hasCvv: !!input.cvv,
            cvvType: typeof input.cvv,
            cvvLength: input.cvv ? input.cvv.length : 0,
            cvvValue: input.cvv ? `[${input.cvv}]` : 'undefined',
          });
          throw new Error('CVV is required for card payment');
        }

        const cvvValue = input.cvv.trim();

        // Handle saved card or new card
        if (input.savedCardId) {
          // Use saved card token
          const savedCard = user.savedCards?.find(card => card.id === input.savedCardId);
          if (!savedCard || !savedCard.token) {
            throw new Error('Saved card not found or invalid');
          }

          // Charge via saved card token (CVV still required for security)
          console.log('[Checkout] Using saved card with CVV length:', cvvValue.length);
          gatewayResponse = await payWithToken({
            orderId,
            paymentTransactionId,
            paymentToken: savedCard.token,
            securityCode: cvvValue, // Map frontend 'cvv' to Mastercard 'securityCode'
            amount: remainingAmount,
            currency,
          });
        } else {
          // New card payment
          if (!input.cardNumber || !input.expiryMonth || !input.expiryYear) {
            throw new Error('Card details are required for card payment');
          }

          // Charge via card (simplified - in production, use 3DS flow)
          console.log('[Checkout] Calling payWithCard with CVV length:', cvvValue.length);
          gatewayResponse = await payWithCard({
            orderId,
            paymentTransactionId,
            card: {
              number: input.cardNumber,
              expiryMonth: input.expiryMonth,
              expiryYear: input.expiryYear,
              nameOnCard: input.cardholderName,
              securityCode: cvvValue, // Map frontend 'cvv' to Mastercard 'securityCode'
            },
            amount: remainingAmount,
            currency,
          });
        }
      }

      // Check payment result
      if (gatewayResponse?.result !== 'SUCCESS') {
        // Payment failed - log full response for debugging
        console.error('[Checkout] Payment failed - Gateway response:', JSON.stringify(gatewayResponse, null, 2));
        
        // Extract detailed error information
        const errorReason = gatewayResponse?.error?.explanation || 
                           gatewayResponse?.error?.message ||
                           gatewayResponse?.response?.gatewayCode ||
                           gatewayResponse?.response?.gatewayMessage ||
                           gatewayResponse?.result;
        
        const errorDetails = gatewayResponse?.error?.detail || 
                             gatewayResponse?.response?.acquirerMessage ||
                             'No additional details available';

        // Update payment record and return error
        await firestorePayments.update(`${orderId}-${paymentTransactionId}`, {
          status: 'failed',
          gatewayResponse,
        });
        
        // Provide more detailed error message
        const errorMessage = errorReason 
          ? `Payment failed: ${errorReason}${errorDetails && errorDetails !== errorReason ? ` (${errorDetails})` : ''}`
          : 'Payment failed: Unknown error from payment gateway';
        
        throw new Error(errorMessage);
      }

      paymentSuccess = true;
    } else {
      // Wallet covers full amount - no external payment needed
      paymentSuccess = true;
    }

    // 8. Only after successful payment: Create subscription, then deduct wallet
    if (paymentSuccess) {
      // Create subscription first
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + input.duration);

      const subscription: Subscription = {
        id: `sub-${Date.now()}`,
        userId: input.userId,
        tier: input.tier,
        duration: input.duration,
        startDate,
        endDate,
        monthlyPrice,
        totalPrice: finalAmount,
        visitsUsed: 0,
        maxVisitsPerMonth: 30,
        isActive: true,
      };

      await firestoreSubscriptions.create(subscription);

      // Deduct wallet balance (only after subscription is created)
      if (walletUsed > 0) {
        const newWalletBalance = walletBalance - walletUsed;
        await firestoreUsers.update(input.userId, {
          walletBalance: newWalletBalance,
        });

        // Create wallet transaction record
        await firestoreWalletTransactions.create({
          userId: input.userId,
          type: 'subscription_payment',
          amount: -walletUsed, // Negative for debit
          description: `Subscription payment for ${input.tier} package (${input.duration} month${input.duration > 1 ? 's' : ''})`,
          subscriptionId: subscription.id,
          createdAt: new Date(),
        });
      }

      // Update payment record with subscription ID and success status
      await firestorePayments.update(`${orderId}-${paymentTransactionId}`, {
        status: 'succeeded',
        subscriptionId: subscription.id,
        completedAt: new Date(),
        gatewayResponse: gatewayResponse,
      });

      // VERSION 1: Save card token if requested and payment was successful
      if (input.saveCard && gatewayResponse && !input.savedCardId && input.cardNumber) {
        try {
          // Extract card token from MPGS response
          // Note: MPGS may return token in sourceOfFunds.provided.card.token after PAY
          // If not present, we would need to tokenize separately (future enhancement)
          const cardToken = gatewayResponse.sourceOfFunds?.provided?.card?.token ||
                          gatewayResponse.transaction?.card?.token ||
                          gatewayResponse.card?.token;
          
          const cardNumber = input.cardNumber || '';
          const last4 = cardNumber.slice(-4);
          
          // Determine card brand from number or response
          const cardBrand = gatewayResponse.sourceOfFunds?.provided?.card?.scheme?.toUpperCase() || 
                           gatewayResponse.card?.scheme?.toUpperCase() ||
                           (cardNumber.startsWith('4') ? 'VISA' : 
                            cardNumber.startsWith('5') ? 'MASTERCARD' : 
                            cardNumber.startsWith('3') ? 'AMEX' : 'UNKNOWN');

          if (cardToken) {
            // Get current saved cards
            const currentUser = await firestoreUsers.getById(input.userId);
            const existingCards = currentUser?.savedCards || [];
            
            // Check if card already exists (by last4 and expiry)
            const cardExists = existingCards.some(
              card => card.last4 === last4 && 
                      card.expiryMonth === input.expiryMonth && 
                      card.expiryYear === input.expiryYear
            );

            if (!cardExists) {
              // Create new saved card entry
              const newCard = {
                id: `card-${Date.now()}`,
                token: cardToken,
                last4: last4,
                brand: cardBrand,
                expiryMonth: input.expiryMonth,
                expiryYear: input.expiryYear,
                cardholderName: input.cardholderName || '',
                isDefault: existingCards.length === 0, // First card is default
                createdAt: new Date(),
              };

              // Add to saved cards array
              const updatedCards = [...existingCards, newCard];
              
              // Update user with saved card
              await firestoreUsers.update(input.userId, {
                savedCards: updatedCards,
              });

              console.log('[Payment] Card saved successfully for user:', input.userId);
            } else {
              console.log('[Payment] Card already saved, skipping duplicate save');
            }
          } else {
            console.warn('[Payment] No card token in gateway response. Tokenization may need to be done separately.');
            // Note: For Version 2, we may need to implement separate tokenization API call
          }
        } catch (error: any) {
          // Non-critical error - log but don't fail the payment
          console.error('[Payment] Failed to save card token:', error);
        }
      }

      // Increment coupon usage if coupon was used
      if (couponId) {
        await firestoreCoupons.incrementUsage(couponId);
      }

      return {
        success: true,
        subscription,
        orderId,
        paymentTransactionId,
        walletUsed,
        externalPaymentAmount: remainingAmount,
        totalAmount: finalAmount,
      };
    }

    throw new Error('Payment processing failed');
  });
