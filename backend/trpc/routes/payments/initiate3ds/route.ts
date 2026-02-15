import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { initiateAuthentication, computeAmount } from '@/backend/lib/mastercard';
import { firestorePayments } from '@/backend/lib/firestore-admin';

export default protectedProcedure
  .input(
    z.object({
      userId: z.string(),
      tier: z.enum(['silver', 'gold', 'diamond', 'elite']),
      duration: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
      cardNumber: z.string(),
      currency: z.string().default('JOD').optional(),
      methodNotificationUrl: z.string().url().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }
    try {
      const currency = input.currency || 'JOD';
      const { amount } = computeAmount({
        tier: input.tier,
        duration: input.duration,
        currency,
      });

      // Generate unique order ID (must be < 41 characters for Mastercard gateway)
      // Format: ord-{timestamp}-{shortUserId} = max ~27 characters
      const timestamp = Date.now();
      const shortUserId = input.userId.substring(0, 10);
      const orderId = `ord-${timestamp}-${shortUserId}`;
      
      // Validate length (should be < 41, but add safety check)
      if (orderId.length >= 41) {
        throw new Error(`Generated order ID is too long: ${orderId.length} characters (max 40)`);
      }
      // Transaction ID should be "1" for INITIATE_AUTHENTICATION and AUTHENTICATE_PAYER
      // The PAY operation will use a different transaction ID
      const transactionId = '1';

      // minimal logging only (production-safe)

      const isProd = process.env['NODE_ENV'] === 'production';
      const envBaseUrlRaw = process.env['EXPO_PUBLIC_RORK_API_BASE_URL'];
      const envBaseUrl = envBaseUrlRaw ? envBaseUrlRaw.replace(/\/+$/, '') : undefined;
      if (isProd) {
        if (!envBaseUrl) {
          throw new Error(
            'Missing EXPO_PUBLIC_RORK_API_BASE_URL. Set it to your public HTTPS backend URL (e.g. https://api.yourdomain.com).'
          );
        }
        const u = new URL(envBaseUrl);
        if (u.protocol !== 'https:') {
          throw new Error('EXPO_PUBLIC_RORK_API_BASE_URL must be HTTPS in production.');
        }
      }

      // For production, derive the methodNotificationUrl from server config (don’t accept from client).
      const methodNotificationUrl = isProd
        ? `${envBaseUrl}/api/3ds/callback`
        : input.methodNotificationUrl;

      const gatewayResponse = await initiateAuthentication({
        orderId,
        transactionId,
        currency,
        card: { number: input.cardNumber },
        methodNotificationUrl,
      });

      console.log('[Initiate3DS] Gateway response received:', {
        hasAuthentication: !!gatewayResponse.authentication,
        gatewayRecommendation: gatewayResponse.response?.gatewayRecommendation,
      });

      await firestorePayments.create({
        id: `${orderId}-${transactionId}`,
        userId: input.userId,
        tier: input.tier,
        duration: input.duration,
        amount,
        currency,
        orderId,
        transactionId,
        status: 'AUTHENTICATION_INITIATED',
        gatewayRecommendation: gatewayResponse.response?.gatewayRecommendation,
      });

      return {
        orderId,
        transactionId,
        amount,
        currency,
        authentication: gatewayResponse.authentication,
        gatewayRecommendation: gatewayResponse.response?.gatewayRecommendation,
        methodHtml:
          gatewayResponse.authentication?.redirect?.html ||
          gatewayResponse.authentication?.redirect?.customizedHtml?.['3ds2']?.methodUrl,
        rawResponse: gatewayResponse,
      };
    } catch (error: any) {
      console.error('[Initiate3DS] Error:', {
        message: error?.message,
        stack: error?.stack,
      });
      throw new Error(
        error?.message || 'Failed to initiate payment authentication. Please try again.'
      );
    }
  });

