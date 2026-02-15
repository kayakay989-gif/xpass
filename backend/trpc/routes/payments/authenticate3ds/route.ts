import { z } from 'zod';
import { protectedProcedure } from '@/backend/trpc/create-context';
import { authenticatePayer, computeAmount } from '@/backend/lib/mastercard';
import { firestorePayments } from '@/backend/lib/firestore-admin';

export default protectedProcedure
  .input(
    z.object({
      userId: z.string(),
      tier: z.enum(['silver', 'gold', 'diamond', 'elite']),
      duration: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
      orderId: z.string(),
      transactionId: z.string(),
      cardNumber: z.string(),
      expiryMonth: z.string(),
      expiryYear: z.string(),
      currency: z.string().optional(),
      redirectUrl: z.string().url().optional(),
      browserUserAgent: z.string().optional(),
      ipAddress: z.string().optional(),
      cardholderName: z.string().optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    if (ctx.user?.uid !== input.userId) {
      throw new Error('Unauthorized');
    }
    const currency = input.currency || 'JOD';

    const { amount } = computeAmount({
      tier: input.tier,
      duration: input.duration,
      currency,
    });

    const isProd = process.env['NODE_ENV'] === 'production';
    const envBaseUrlRaw = process.env['EXPO_PUBLIC_RORK_API_BASE_URL'];
    const envBaseUrl = envBaseUrlRaw ? envBaseUrlRaw.replace(/\/+$/, '') : undefined;

    // In production, ALWAYS use the server-controlled public HTTPS callback URL.
    // Never accept a redirect URL from the client (prevents redirect injection + misconfig).
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

    if (!envBaseUrl) {
      throw new Error(
        'Missing EXPO_PUBLIC_RORK_API_BASE_URL. Set it to your public HTTPS backend URL (e.g. https://api.yourdomain.com).'
      );
    }

    const redirectResponseUrl = isProd
      ? `${envBaseUrl}/api/3ds/callback`
      : // In non-production, still require a real callback URL (no dev fallbacks).
        input.redirectUrl || `${envBaseUrl}/api/3ds/callback`;

    const gatewayResponse = await authenticatePayer({
      orderId: input.orderId,
      transactionId: input.transactionId,
      amount,
      currency,
      redirectResponseUrl,
      ipAddress:
        input.ipAddress ||
        ctx.req.headers.get('cf-connecting-ip') ||
        (ctx.req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() ||
        undefined,
      browser: input.browserUserAgent || ctx.req.headers.get('user-agent') || 'MOZILLA',
      card: {
        number: input.cardNumber,
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear,
        nameOnCard: input.cardholderName,
      },
    });

    await firestorePayments.update(`${input.orderId}-${input.transactionId}`, {
      status: gatewayResponse.result || gatewayResponse.transaction?.authenticationStatus,
      lastGatewayRecommendation: gatewayResponse.response?.gatewayRecommendation,
      authentication: gatewayResponse.authentication,
      rawResponse: gatewayResponse,
    });

    return {
      amount,
      currency,
      gatewayRecommendation: gatewayResponse.response?.gatewayRecommendation,
      result: gatewayResponse.result,
      authenticationStatus: gatewayResponse.transaction?.authenticationStatus,
      redirectHtml: gatewayResponse.authentication?.redirect?.html,
      authentication: gatewayResponse.authentication,
      rawResponse: gatewayResponse,
    };
  });

