import { SubscriptionDuration, SubscriptionTier } from '@/types';
import { calculateSubscriptionPrice } from '@/backend/lib/pricing';

type BrowserDetails = {
  acceptHeaders?: string;
  colorDepth?: number;
  javaEnabled?: boolean;
  language?: string;
  screenHeight?: number;
  screenWidth?: number;
  timeZone?: number;
  '3DSecureChallengeWindowSize'?: 'FULL_SCREEN' | 'WINDOWED_600x400' | 'WINDOWED_500x600' | 'WINDOWED_390x400';
};

type CardDetails = {
  number: string;
  expiryMonth?: string;
  expiryYear?: string;
  nameOnCard?: string;
};

type AmountInput = {
  tier: SubscriptionTier;
  duration: SubscriptionDuration;
  currency?: string;
};

type GatewayConfig = {
  host: string;
  merchantId: string;
  apiUsername: string;
  apiPassword: string;
  apiVersion: string;
};

const defaultBrowserDetails: BrowserDetails = {
  acceptHeaders: 'application/json',
  colorDepth: 24,
  javaEnabled: false,
  language: 'en-US',
  screenHeight: 800,
  screenWidth: 600,
  timeZone: 0,
  '3DSecureChallengeWindowSize': 'FULL_SCREEN',
};

function getGatewayConfig(): GatewayConfig {
  const isProd = process.env['NODE_ENV'] === 'production';

  const host = process.env['MPG_HOST'];
  const merchantId = process.env['MPG_MERCHANT_ID'] || process.env['MPG_MERCHANT'];
  const apiUsername = process.env['MPG_API_USERNAME'] || (merchantId ? `merchant.${merchantId}` : undefined);
  const apiPassword = process.env['MPG_API_PASSWORD'];

  const apiVersion = process.env['MPG_API_VERSION'] || '100';

  if (!host || !merchantId || !apiUsername || !apiPassword) {
    const errorMsg =
      '[Mastercard] Missing configuration. Set MPG_HOST, MPG_MERCHANT_ID (or MPG_MERCHANT), MPG_API_USERNAME and MPG_API_PASSWORD environment variables.';
    console.error(errorMsg, {
      isProd,
      hasHost: !!host,
      hasMerchantId: !!merchantId,
      hasApiUsername: !!apiUsername,
      hasApiPassword: !!apiPassword,
      apiVersion,
    });
    throw new Error(
      'Payment gateway is not configured. Please contact support or check server configuration.'
    );
  }

  return { host, merchantId, apiUsername, apiPassword, apiVersion };
}

function buildUrl(orderId: string, transactionId: string, cfg: GatewayConfig): string {
  return `https://${cfg.host}/api/rest/version/${cfg.apiVersion}/merchant/${cfg.merchantId}/order/${orderId}/transaction/${transactionId}`;
}

function buildAuthHeader(cfg: GatewayConfig): string {
  // Use API username for authentication (format: merchant.merchantId)
  return `Basic ${Buffer.from(`${cfg.apiUsername}:${cfg.apiPassword}`).toString('base64')}`;
}

async function putToGateway(
  orderId: string,
  transactionId: string,
  payload: Record<string, any>
) {
  const cfg = getGatewayConfig();
  const url = buildUrl(orderId, transactionId, cfg);
  const apiOperation = payload?.apiOperation;
  const debug =
    process.env['MPG_DEBUG'] === '1' || process.env['NODE_ENV'] !== 'production';

  const safePayload = JSON.parse(JSON.stringify(payload));
  try {
    const cardNum =
      safePayload?.sourceOfFunds?.provided?.card?.number ||
      safePayload?.sourceOfFunds?.provided?.card?.number;
    if (typeof cardNum === 'string' && cardNum.length >= 10) {
      const first6 = cardNum.slice(0, 6);
      const last4 = cardNum.slice(-4);
      safePayload.sourceOfFunds.provided.card.number = `${first6}******${last4}`;
    }
  } catch {
    // no-op: best-effort masking
  }

  if (debug) {
    console.log('[Mastercard] Making request to:', url);
    console.log('[Mastercard] Payload (masked):', JSON.stringify(safePayload, null, 2));
  } else {
    console.log('[Mastercard] Request:', { apiOperation, orderId, transactionId });
  }

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildAuthHeader(cfg),
      },
      body: JSON.stringify(payload),
    });

    if (debug) {
      console.log(
        '[Mastercard] Request payload (before sending, masked):',
        JSON.stringify(safePayload, null, 2)
      );
    }

    const text = await response.text();
    console.log('[Mastercard] Response status:', response.status);
    if (debug) {
      console.log('[Mastercard] Response text:', text);
    }

    let json: any = null;
    try {
      json = text ? JSON.parse(text) : {};
    } catch (err) {
      console.error('[Mastercard] Failed to parse response JSON', err, text);
      throw new Error(`Invalid response from payment gateway: ${text.substring(0, 200)}`);
    }

    if (!response.ok) {
      const errorMsg = json.error?.explanation || json.error?.message || text || 'Unknown error from gateway';
      const authObj = safePayload?.authentication;
      const authKeys = authObj && typeof authObj === 'object' ? Object.keys(authObj) : [];
      const authHas3ds2 = !!authObj?.['3ds2'];
      const debugSummary = `op=${apiOperation || 'UNKNOWN'} urlTxn=${transactionId} authKeys=[${authKeys.join(
        ','
      )}] authHas3ds2=${authHas3ds2}`;
      console.error('[Mastercard] Gateway error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorMsg,
        debugSummary,
        fullResponse: json,
      });
      throw new Error(
        `Payment gateway error (${response.status}): ${errorMsg} (${debugSummary})`
      );
    }

    return json;
  } catch (error: any) {
    if (error.message && error.message.includes('Missing configuration')) {
      throw error;
    }
    console.error('[Mastercard] Request failed:', error);
    throw new Error(
      `Failed to connect to payment gateway: ${error.message || 'Network error'}`
    );
  }
}

export function computeAmount({ tier, duration }: AmountInput) {
  const { totalPrice, monthlyPrice } = calculateSubscriptionPrice(tier, duration);
  return { amount: totalPrice, monthlyPrice };
}

export async function initiateAuthentication(params: {
  orderId: string;
  transactionId: string;
  card: CardDetails;
  currency: string;
  channel?: 'PAYER_BROWSER' | 'PAYER_APP';
  methodNotificationUrl?: string;
}) {
  const { orderId, transactionId, card, currency, channel = 'PAYER_BROWSER', methodNotificationUrl } = params;

  const payload: Record<string, any> = {
    apiOperation: 'INITIATE_AUTHENTICATION',
    authentication: {
      channel,
    },
    order: {
      currency,
    },
    sourceOfFunds: {
      provided: {
        card: {
          number: card.number,
        },
      },
    },
  };

  // Only include methodNotificationUrl if it's a valid public URL (not localhost with non-standard port)
  // Mastercard gateway only accepts standard ports (80 for HTTP, 443 for HTTPS)
  if (methodNotificationUrl) {
    try {
      const url = new URL(methodNotificationUrl);
      // Skip localhost URLs with non-standard ports for development
      if (url.hostname === 'localhost' && url.port && url.port !== '80' && url.port !== '443') {
        console.warn('[Mastercard] Skipping methodNotificationUrl - non-standard port not supported by gateway');
      } else {
        payload.authentication.methodNotificationUrl = methodNotificationUrl;
      }
    } catch (e) {
      console.warn('[Mastercard] Invalid methodNotificationUrl, skipping:', methodNotificationUrl);
    }
  }

  return putToGateway(orderId, transactionId, payload);
}

export async function authenticatePayer(params: {
  orderId: string;
  transactionId: string;
  card: CardDetails;
  amount: number;
  currency: string;
  redirectResponseUrl: string;
  ipAddress?: string;
  browser?: string;
  browserDetails?: BrowserDetails;
}) {
  const {
    orderId,
    transactionId,
    card,
    amount,
    currency,
    redirectResponseUrl,
    ipAddress = '0.0.0.0',
    browser = 'MOZILLA',
    browserDetails = defaultBrowserDetails,
  } = params;

  // Format amount as string (Mastercard API expects string for amounts)
  const amountStr = amount.toString();

  const payload = {
    apiOperation: 'AUTHENTICATE_PAYER',
    sourceOfFunds: {
      provided: {
        card: {
          number: card.number,
          expiry: {
            month: card.expiryMonth,
            year: card.expiryYear,
          },
          nameOnCard: card.nameOnCard,
        },
      },
    },
    order: {
      amount: amountStr,
      currency,
    },
    authentication: {
      redirectResponseUrl,
    },
    device: {
      browser,
      browserDetails,
      ipAddress,
    },
  };

  return putToGateway(orderId, transactionId, payload);
}

export async function payWithAuthentication(params: {
  orderId: string;
  paymentTransactionId: string;
  authenticationTransactionId: string;
  authenticationStatus?: string; // 3DS authentication status (Y, N, U, I, A)
  card: CardDetails;
  amount: number;
  currency: string;
  reference?: string;
}) {
  const {
    orderId,
    paymentTransactionId,
    authenticationTransactionId,
    authenticationStatus,
    card,
    amount,
    currency,
    reference,
  } = params;

  // Format amount as string (Mastercard API expects string for amounts)
  const amountStr = amount.toString();

  // IMPORTANT (per gateway error 400):
  // When referencing a prior AUTHENTICATION transaction via authentication.transactionId,
  // the PAY request must NOT also include additional authentication details (e.g. 3ds2 fields).
  // The gateway will reject it as “multiple sources of payer authentication details”.
  const authentication: Record<string, any> = {
    transactionId: authenticationTransactionId,
  };

  console.log('[Mastercard] PAY with authentication reference - transactionId:', authenticationTransactionId, 'statusHint:', authenticationStatus);

  const payload: Record<string, any> = {
    apiOperation: 'PAY',
    authentication,
    order: {
      amount: amountStr,
      currency,
      reference: reference || orderId,
    },
    sourceOfFunds: {
      provided: {
        card: {
          number: card.number,
          expiry: {
            month: card.expiryMonth,
            year: card.expiryYear,
          },
        },
      },
      type: 'CARD',
    },
    transaction: {
      reference: reference || orderId,
    },
  };

  return putToGateway(orderId, paymentTransactionId, payload);
}

