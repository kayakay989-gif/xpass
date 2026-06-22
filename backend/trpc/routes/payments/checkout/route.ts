import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { TRPCError } from '@trpc/server';
import { computeAmount, MastercardGatewayError } from '@/backend/lib/mastercard';
import { Subscription } from '@/types';
import { 
  firestorePayments, 
  firestoreSubscriptions, 
  firestoreCoupons, 
  firestoreUsers, 
  firestoreWalletTransactions 
} from '@/backend/lib/firestore-admin';
import { runReferralRewardAfterSubscriptionSuccess } from '@/backend/lib/referrals';
import { payWithToken, payWithCard, payWithAuthentication, initiateAuthentication, authenticatePayer } from '@/backend/lib/mastercard';
import { sendSubscriptionSuccessEmail } from '@/backend/lib/subscription-email';
import { getTotalPassesForDuration } from '@/backend/lib/pricing';
import { notifySubscriptionActivated } from '@/backend/lib/push-notifications';

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
      // 3DS Authentication (for completing payment after challenge)
      orderId: z.string().optional(), // Original orderId from 3DS initiation (required when finalizing auth)
      authenticationTransactionId: z.string().optional(), // Transaction ID from 3DS authentication
      authenticationStatus: z.string().optional(), // 3DS authentication status (Y, N, U, I, A)
      redirectUrl: z.string().url().optional(), // Redirect URL for 3DS callback (dev only)
      // Optional coupon
      couponCode: z.string().optional(),
      currency: z.string().optional().default('JOD'),
    })
  )
  .mutation(async ({ input, ctx }) => {
    // #region agent log
    fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6c801d'},body:JSON.stringify({sessionId:'6c801d',runId:'pre-fix',hypothesisId:'H1',location:'backend/trpc/routes/payments/checkout/route.ts:mutation-entry',message:'checkout mutation entry',data:{userId:input.userId,tier:input.tier,duration:input.duration,paymentMethod:input.paymentMethod,useWallet:input.useWallet,hasAuthTxn:!!input.authenticationTransactionId,currency:input.currency || 'JOD'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (ctx.user?.uid !== input.userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    const currency = input.currency || 'JOD';

    const declined = {
      success: false,
      error: {
        type: 'payment_declined',
        message:
          'Your bank declined the payment. Try another card or contact your bank.',
        code: 'ISSUER_DECLINED',
      },
    };

    const isIssuerDeclinedFromRaw = (raw: any): boolean => {
      const asText = JSON.stringify(raw ?? {}).toUpperCase();
      if (asText.includes('PAYMENT BLOCKED BY ISSUER')) return true;
      if (asText.includes('BLOCKED BY ISSUER')) return true;
      if (asText.includes('DO_NOT_HONOR')) return true;
      if (asText.includes('CARD_DECLINED')) return true;
      if (asText.includes('EXPIRED_CARD')) return true;
      if (asText.includes('INSUFFICIENT_FUNDS')) return true;
      if (asText.includes('"DECLINED"')) return true;
      if (asText.includes('"BLOCKED"')) return true;

      const result = String(raw?.result ?? raw?.transaction?.result ?? '').toUpperCase();
      if (['DECLINED', 'BLOCKED'].includes(result)) return true;

      const gatewayCode = String(
        raw?.response?.gatewayCode ?? raw?.gatewayCode ?? ''
      ).toUpperCase();
      if (
        ['DO_NOT_HONOR', 'CARD_DECLINED', 'EXPIRED_CARD', 'INSUFFICIENT_FUNDS'].includes(
          gatewayCode
        )
      ) {
        return true;
      }

      return false;
    };

    // VERSION 1: Restrict to card payments only - Apple Pay and Google Pay disabled
    if (input.paymentMethod !== 'card') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only card payments are supported in Version 1. Apple Pay and Google Pay will be available in Version 2.',
      });
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
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid coupon code' });
      }

      if (!coupon.isActive) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This coupon is not active' });
      }

      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This coupon has expired' });
      }

      if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This coupon has reached its usage limit' });
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
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You already have an active subscription',
        });
      }
    }

    // 4. Get user wallet balance and calculate wallet usage
    const user = await firestoreUsers.getById(input.userId);
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const walletBalance = user.walletBalance || 0;
    const walletUsed = input.useWallet ? Math.min(walletBalance, finalAmount) : 0;
    const remainingAmount = Math.max(0, finalAmount - walletUsed);

    // Validate wallet usage
    if (input.useWallet && walletUsed > walletBalance) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Insufficient wallet balance' });
    }
    if (walletUsed < 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Wallet amount cannot be negative' });
    }
    // #region agent log
    fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6c801d'},body:JSON.stringify({sessionId:'6c801d',runId:'pre-fix',hypothesisId:'H2',location:'backend/trpc/routes/payments/checkout/route.ts:amounts',message:'computed charge amounts',data:{originalAmount,finalAmount,walletUsed,remainingAmount,currency:String(currency || 'JOD').toUpperCase()},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // 5. Resolve order ID:
    // - Initial card checkout creates a new order ID
    // - Post-3DS finalize should reuse the same original order ID
    //   (and can recover it from pending payment records if client payload is stale)
    const isFinalizingAuthenticatedPayment = !!input.authenticationTransactionId;
    let resolvedFinalizeOrderId: string | undefined = input.orderId;
    if (isFinalizingAuthenticatedPayment && !resolvedFinalizeOrderId) {
      const recentPayments = await firestorePayments.listByUser(input.userId);
      const matchingPendingPayment = recentPayments.find((payment: any) => {
        const status = String(payment?.status || '').toUpperCase();
        const hasPendingAuthStatus =
          status === 'AUTHENTICATION_REQUIRED' || status === 'PROCESSING_PAYMENT';
        const sameAuthTxn =
          !!input.authenticationTransactionId &&
          String(payment?.authenticationTransactionId || '') ===
            String(input.authenticationTransactionId);
        return hasPendingAuthStatus && !!payment?.orderId && sameAuthTxn;
      });

      const latestPendingPayment = recentPayments.find((payment: any) => {
        const status = String(payment?.status || '').toUpperCase();
        return (
          (status === 'AUTHENTICATION_REQUIRED' || status === 'PROCESSING_PAYMENT') &&
          !!payment?.orderId
        );
      });

      resolvedFinalizeOrderId =
        matchingPendingPayment?.orderId || latestPendingPayment?.orderId;
    }

    const orderId = isFinalizingAuthenticatedPayment
      ? resolvedFinalizeOrderId
      : `ord-${Date.now()}-${input.userId.substring(0, 10)}`;

    if (!orderId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Missing order ID for authenticated payment finalization.',
      });
    }

    // MPGS Direct REST best-practice for mandatory 3DS2 (see MPGS_GO_LIVE.md):
    // - INITIATE_AUTHENTICATION + AUTHENTICATE_PAYER => transactionId "1"
    // - PAY => transactionId "2" referencing authentication.transactionId "1"
    const authTransactionId = '1';
    const paymentTransactionId = '2';

    // 6. Upsert payment record:
    // - First call creates the payment shell
    // - Finalize call updates the same payment record for the original order
    const paymentRecordId = `${orderId}-${paymentTransactionId}`;
    if (isFinalizingAuthenticatedPayment) {
      await firestorePayments.update(paymentRecordId, {
        status: 'PROCESSING_PAYMENT',
        authenticationTransactionId: input.authenticationTransactionId,
        authenticationStatus: input.authenticationStatus || 'Y',
      });
    } else {
      await firestorePayments.create({
        id: paymentRecordId,
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
    }

    // 7. Process external payment if remaining amount > 0
    let gatewayResponse = null;
    let paymentSuccess = false;

    if (remainingAmount > 0) {
      // VERSION 1: Only card payments are supported
      // Apple Pay and Google Pay code preserved for Version 2
      // After the check on line 49, TypeScript knows paymentMethod can only be 'card'
      if (input.paymentMethod === 'card') {
        try {
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
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'CVV is required for card payment',
          });
        }

        const cvvValue = input.cvv.trim();
        // #region agent log
        fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6c801d'},body:JSON.stringify({sessionId:'6c801d',runId:'pre-fix',hypothesisId:'H3',location:'backend/trpc/routes/payments/checkout/route.ts:before-gateway',message:'about to call gateway',data:{orderId,paymentTransactionId,isProd:process.env['NODE_ENV']==='production',hasSavedCardId:!!input.savedCardId,hasAuthTxn:!!input.authenticationTransactionId,remainingAmount,currency,cvvLength:cvvValue.length},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        // Handle saved card or new card
        const isProd = process.env['NODE_ENV'] === 'production';
        const ua = ctx.req.headers.get('user-agent') || '';
        // This implementation uses browser/webview redirect for 3DS, so PAYER_BROWSER is required.
        const authenticationChannel: 'PAYER_BROWSER' = 'PAYER_BROWSER';

        const savedCard =
          input.savedCardId && user.savedCards
            ? user.savedCards.find((card) => card.id === input.savedCardId)
            : undefined;

        const cardBase: any = input.savedCardId
          ? {
              token: savedCard?.token,
              expiryMonth: savedCard?.expiryMonth ? String(savedCard.expiryMonth) : undefined,
              expiryYear: savedCard?.expiryYear ? String(savedCard.expiryYear) : undefined,
              nameOnCard: savedCard?.cardholderName,
            }
          : {
              number: input.cardNumber,
              expiryMonth: input.expiryMonth,
              expiryYear: input.expiryYear,
              nameOnCard: input.cardholderName,
            };

        if (input.savedCardId && (!savedCard || !savedCard.token)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Saved card not found or invalid',
          });
        }

        if (!input.savedCardId && (!input.cardNumber || !input.expiryMonth || !input.expiryYear)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Card details are required for card payment',
          });
        }

        // Production merchant: enforce mandatory 3DS2 (txn "1" auth, txn "2" PAY referencing auth.transactionId="1").
        // - If 3DS is not completed yet, initiate authentication and return challenge HTML (when needed).
        // - If frictionless auth is possible, complete PAY server-side and continue normally.
        if (isProd) {
          const clientRedirectUrl = input.redirectUrl?.trim();
          const envBaseUrlRaw =
            process.env['RORK_API_BASE_URL'] ||
            process.env['EXPO_PUBLIC_RORK_API_BASE_URL'];
          const envBaseUrl = envBaseUrlRaw ? envBaseUrlRaw.replace(/\/+$/, '') : undefined;
          const forwardedProto = ctx.req.headers.get('x-forwarded-proto');
          const forwardedHost = ctx.req.headers.get('x-forwarded-host');
          const inferredBaseUrl =
            forwardedProto && forwardedHost
              ? `${forwardedProto}://${forwardedHost}`
              : (() => {
                  try {
                    const reqUrl = new URL(ctx.req.url);
                    return `${reqUrl.protocol}//${reqUrl.host}`;
                  } catch {
                    return undefined;
                  }
                })();
          const resolvedBaseUrl = envBaseUrl || inferredBaseUrl;
          const redirectResponseUrl = clientRedirectUrl
            ? clientRedirectUrl
            : resolvedBaseUrl
              ? `${resolvedBaseUrl.replace(/\/+$/, '')}/api/3ds/callback`
              : undefined;

          if (!redirectResponseUrl) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Payment authentication callback URL is not configured.',
            });
          }

          // Production 3DS redirect callback must be HTTPS and publicly reachable.
          if (!/^https:\/\//i.test(redirectResponseUrl)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Payment authentication callback must use HTTPS.',
            });
          }

          // If client already has a completed authentication, finalize using PAY referencing auth transaction id.
          if (input.authenticationTransactionId) {
            gatewayResponse = await payWithAuthentication({
              orderId,
              paymentTransactionId,
              authenticationTransactionId: input.authenticationTransactionId,
              authenticationStatus: input.authenticationStatus,
              card: {
                ...cardBase,
                securityCode: cvvValue,
              },
              amount: remainingAmount,
              currency,
            });
          } else {
            // If 3DS isn't complete yet, initiate+authenticate.
            // Note: We don't currently render the INITIATE_AUTHENTICATION method HTML in the client; this may reduce
            // frictionless success rate if the gateway issues a method call. Challenge flow should still work.
            const initResp = await initiateAuthentication({
              orderId,
              transactionId: authTransactionId,
              currency,
              channel: authenticationChannel,
              card: cardBase,
            });

            const authResp = await authenticatePayer({
              orderId,
              transactionId: authTransactionId,
              card: cardBase,
              amount: remainingAmount,
              currency,
              redirectResponseUrl,
              ipAddress:
                ctx.req.headers.get('cf-connecting-ip') ||
                (ctx.req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() ||
                undefined,
              browser: ua || 'MOZILLA',
            });

            const redirectHtml = authResp.authentication?.redirect?.html;
            const gatewayRecommendation = authResp.response?.gatewayRecommendation;

            // If gateway recommends not proceeding, treat it as an issuer-declined/auth decline for user messaging.
            if (
              gatewayRecommendation &&
              gatewayRecommendation !== 'PROCEED'
            ) {
              await firestorePayments.update(`${orderId}-${paymentTransactionId}`, {
                status: 'failed',
                authentication: authResp.authentication,
                gatewayRecommendation,
                rawResponse: { authenticate: authResp },
              });

              const declined = {
                success: false,
                error: {
                  type: 'payment_declined',
                  message:
                    'Your bank declined the payment. Try another card or contact your bank.',
                  code: 'ISSUER_DECLINED',
                },
              };

              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: declined.error.message,
                cause: declined,
              });
            }

            // If challenge is required, return HTML to the frontend and wait for callback before PAY.
            if (redirectHtml) {
              await firestorePayments.update(`${orderId}-${paymentTransactionId}`, {
                status: 'AUTHENTICATION_REQUIRED',
                authenticationTransactionId: authTransactionId,
                gatewayRecommendation,
                authentication: authResp.authentication,
                rawResponse: { initiate: initResp, authenticate: authResp },
              });

              return {
                success: true,
                requires3DS: true,
                redirectHtml,
                orderId,
                authenticationTransactionId: authTransactionId,
                gatewayRecommendation,
                walletUsed,
                externalPaymentAmount: remainingAmount,
                totalAmount: finalAmount,
              };
            }

            // Frictionless auth: proceed with authenticated PAY immediately.
            gatewayResponse = await payWithAuthentication({
              orderId,
              paymentTransactionId,
              authenticationTransactionId: authTransactionId,
              card: {
                ...cardBase,
                securityCode: cvvValue,
              },
              amount: remainingAmount,
              currency,
            });
          }
        } else {
          // Non-production fallback: allow direct card PAY without 3DS.
          if (input.savedCardId) {
            gatewayResponse = await payWithToken({
              orderId,
              paymentTransactionId,
              paymentToken: savedCard!.token,
              securityCode: cvvValue,
              amount: remainingAmount,
              currency,
            });
          } else {
            gatewayResponse = await payWithCard({
              orderId,
              paymentTransactionId,
              card: {
                number: input.cardNumber,
                expiryMonth: input.expiryMonth,
                expiryYear: input.expiryYear,
                nameOnCard: input.cardholderName,
                securityCode: cvvValue,
              },
              amount: remainingAmount,
              currency,
            });
          }
        }
        } catch (err: any) {
          if (err instanceof TRPCError) {
            throw err;
          }

          if (err instanceof MastercardGatewayError) {
            console.error('[Checkout] Mastercard gateway error caught:', {
              message: err.message,
              status: err.status,
              raw: err.raw,
              isNetworkError: (err as any).isNetworkError,
            });
            // #region agent log
            fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6c801d'},body:JSON.stringify({sessionId:'6c801d',runId:'pre-fix',hypothesisId:'H4',location:'backend/trpc/routes/payments/checkout/route.ts:gateway-error-catch',message:'gateway error captured in checkout',data:{status:err.status,message:err.message,isNetworkError:(err as any).isNetworkError,result:err.raw?.result,gatewayCode:err.raw?.response?.gatewayCode,gatewayRecommendation:err.raw?.response?.gatewayRecommendation,errorCause:err.raw?.error?.cause,errorExplanation:err.raw?.error?.explanation},timestamp:Date.now()})}).catch(()=>{});
            // #endregion

            const msgText = String(err?.message ?? '').toUpperCase();
            if (isIssuerDeclinedFromRaw(err.raw) || msgText.includes('PAYMENT BLOCKED BY ISSUER') || msgText.includes('BLOCKED BY ISSUER')) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: declined.error.message,
                cause: declined,
              });
            }

            if (err.status >= 400 && err.status < 500) {
              const gatewayCode =
                String(err.raw?.response?.gatewayCode || '').toUpperCase() ||
                String(err.raw?.error?.cause || '').toUpperCase() ||
                'UNKNOWN';
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: `Payment was rejected by gateway (${gatewayCode}). Please verify card details and try again.`,
              });
            }

            const gatewayCode =
              String(err.raw?.response?.gatewayCode || '').toUpperCase() ||
              String(err.raw?.error?.cause || '').toUpperCase() ||
              'UNKNOWN';
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Gateway error (${gatewayCode}). Please try again later.`,
            });
          }

          // #region agent log
          fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6c801d'},body:JSON.stringify({sessionId:'6c801d',runId:'pre-fix',hypothesisId:'H6',location:'backend/trpc/routes/payments/checkout/route.ts:unknown-error-catch',message:'non-mastercard error in checkout',data:{name:err?.name,message:err?.message,stackTop:String(err?.stack||'').split('\n').slice(0,2).join(' | ')},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Payment processing failed',
          });
        }
      }

      // Check payment result
      if (gatewayResponse?.result !== 'SUCCESS') {
        // Payment failed - log full response for debugging
        console.error('[Checkout] Payment failed - Gateway response:', JSON.stringify(gatewayResponse, null, 2));
        
        // Extract detailed error information from various possible locations in gateway response
        const errorReason = gatewayResponse?.error?.explanation || 
                           gatewayResponse?.error?.message ||
                           gatewayResponse?.error?.cause ||
                           gatewayResponse?.response?.gatewayCode ||
                           gatewayResponse?.response?.gatewayMessage ||
                           gatewayResponse?.response?.acquirerResponse?.code ||
                           gatewayResponse?.response?.acquirerResponse?.message ||
                           gatewayResponse?.result;
        
        const errorDetails = gatewayResponse?.error?.detail || 
                             gatewayResponse?.response?.acquirerMessage ||
                             gatewayResponse?.response?.acquirerResponse?.issuerMessage ||
                             gatewayResponse?.response?.acquirerResponse?.responseCode ||
                             gatewayResponse?.response?.decision ||
                             gatewayResponse?.response?.reason ||
                             (gatewayResponse?.response?.gatewayCode ? `Gateway Code: ${gatewayResponse.response.gatewayCode}` : null) ||
                             null;

        // Update payment record and return error
        await firestorePayments.update(`${orderId}-${paymentTransactionId}`, {
          status: 'failed',
          gatewayResponse,
        });
        
        // Determine if this is an issuer-declined / blocked payment
        const result = String(gatewayResponse?.result || '').toUpperCase();
        const gatewayCode = String(gatewayResponse?.response?.gatewayCode || '').toUpperCase();

        const issuerDeclineResults = ['DECLINED', 'BLOCKED'];
        const issuerDeclineCodes = ['DO_NOT_HONOR', 'CARD_DECLINED', 'EXPIRED_CARD', 'INSUFFICIENT_FUNDS'];

        const isIssuerDeclined =
          issuerDeclineResults.includes(result) ||
          issuerDeclineCodes.includes(gatewayCode) ||
          /BLOCKED BY ISSUER/i.test(String(errorReason || ''));

        if (isIssuerDeclined) {
          const declined = {
            success: false,
            error: {
              type: 'payment_declined',
              message:
                'Your bank declined the payment. Try another card or contact your bank.',
              code: 'ISSUER_DECLINED',
            },
          };

          // Map to standardized payment_declined error
          throw new TRPCError({
            code: 'BAD_REQUEST', // HTTP 400
            message: declined.error.message,
            cause: declined,
          });
        }

        // Non-issuer failure – treat as gateway / processing error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'We could not complete the payment due to a gateway error. Please try again later.',
        });
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
        maxVisitsPerMonth: getTotalPassesForDuration(input.duration),
        isActive: true,
      };

      await firestoreSubscriptions.create(subscription);

      console.log('CALLING referral reward for:', input.userId, subscription.id);
      await runReferralRewardAfterSubscriptionSuccess({
        payerUserId: input.userId,
        subscriptionId: subscription.id,
        subscriptionIsActive: subscription.isActive === true,
        referredUserName: user.name,
      });

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

      try {
        await sendSubscriptionSuccessEmail({
          toEmail: user.email,
          userName: user.name,
          subscription,
          orderId,
          paymentId: `${orderId}-${paymentTransactionId}`,
          paidAmount: finalAmount,
          currency,
        });
      } catch (emailError) {
        console.error('[Checkout] Failed to send subscription success email:', emailError);
      }

      await notifySubscriptionActivated(input.userId, subscription);

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

    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Payment processing failed',
    });
  });
