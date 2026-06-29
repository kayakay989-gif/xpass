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
  // Either `number` (PAN) or `token` (gateway token) must be provided depending on flow.
  number?: string;
  token?: string;
  expiryMonth?: string;
  expiryYear?: string;
  nameOnCard?: string;
  securityCode?: string;
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

/**
 * Lightweight error type so callers can distinguish:
 * - Network / protocol errors
 * - Gateway-declared payment failures (issuer decline, blocked, etc.)
 *
 * The raw gateway payload is attached for internal logging ONLY and must
 * never be sent directly to the client.
 */
export class MastercardGatewayError extends Error {
  status: number;
  raw: any;
  isNetworkError: boolean;

  constructor(message: string, opts: { status: number; raw: any; isNetworkError?: boolean }) {
    super(message);
    this.name = 'MastercardGatewayError';
    this.status = opts.status;
    this.raw = opts.raw;
    this.isNetworkError = !!opts.isNetworkError;
  }
}

function normalizeGatewayHost(rawHost: string): string {
  const h = rawHost.trim();
  if (!h) return h;

  if (h.startsWith('http://') || h.startsWith('https://')) {
    try {
      return new URL(h).hostname;
    } catch {}
  }

  return h.split('/')[0] || h;
}

function assertProductionGatewayHost(host: string) {
  const lower = host.toLowerCase();

  const looksSandbox =
    lower.includes('test-network') ||
    lower.includes('.mtf.') ||
    lower.includes('sandbox');

  const isKnownProd =
    lower === 'ap-gateway.mastercard.com' ||
    lower === 'gateway.mastercard.com' ||
    lower.endsWith('.mastercard.com');

  if (looksSandbox) {
    throw new Error(
      `[Mastercard] Refusing to use sandbox gateway in production: "${host}".`
    );
  }

  if (!isKnownProd) {
    throw new Error(
      `[Mastercard] MPG_HOST "${host}" doesn't look like a valid Mastercard gateway.`
    );
  }
}

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

  const hostRaw = process.env['MPG_HOST'];
  const host = hostRaw ? normalizeGatewayHost(hostRaw) : undefined;

  const merchantId =
    process.env['MPG_MERCHANT_ID'] || process.env['MPG_MERCHANT'];

  const apiUsername =
    process.env['MPG_API_USERNAME'] ||
    (merchantId ? `merchant.${merchantId}` : undefined);

  const apiPassword = process.env['MPG_API_PASSWORD'];
  const apiVersion = process.env['MPG_API_VERSION'] || '100';

  if (!host || !merchantId || !apiUsername || !apiPassword) {
    throw new Error('Payment gateway configuration missing');
  }

  if (isProd) {
    assertProductionGatewayHost(host);
  }

  return { host, merchantId, apiUsername, apiPassword, apiVersion };
}

function buildUrl(orderId: string, transactionId: string, cfg: GatewayConfig) {
  return `https://${cfg.host}/api/rest/version/${cfg.apiVersion}/merchant/${cfg.merchantId}/order/${orderId}/transaction/${transactionId}`;
}

function buildAuthHeader(cfg: GatewayConfig) {
  return `Basic ${Buffer.from(
    `${cfg.apiUsername}:${cfg.apiPassword}`
  ).toString('base64')}`;
}

async function putToGateway(
  orderId: string,
  transactionId: string,
  payload: Record<string, any>
) {
  const cfg = getGatewayConfig();

  const url = buildUrl(orderId, transactionId, cfg);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildAuthHeader(cfg),
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    // Network-level failure (DNS, TLS, timeout, etc.)
    console.error('[Mastercard] Network error while calling gateway', {
      url,
      orderId,
      transactionId,
      error: err?.message,
    });
    throw new MastercardGatewayError('Payment service is temporarily unavailable', {
      status: 0,
      raw: { error: err?.message ?? String(err) },
      isNetworkError: true,
    });
  }

  const text = await response.text();

  let json: any = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    console.error('[Mastercard] Failed to parse gateway JSON response', {
      url,
      orderId,
      transactionId,
      status: response.status,
      bodyPreview: text?.slice(0, 500),
    });
    throw new MastercardGatewayError('Invalid response from payment gateway', {
      status: response.status,
      raw: text,
    });
  }

  // #region agent log
  fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6c801d'},body:JSON.stringify({sessionId:'6c801d',runId:'pre-fix',hypothesisId:'H5',location:'backend/lib/mastercard.ts:putToGateway-response',message:'gateway HTTP response',data:{orderId,transactionId,status:response.status,ok:response.ok,apiOperation:payload?.apiOperation,result:json?.result,gatewayCode:json?.response?.gatewayCode,gatewayRecommendation:json?.response?.gatewayRecommendation,errorCause:json?.error?.cause,errorExplanation:json?.error?.explanation},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  if (!response.ok) {
    // Non-2xx from gateway – surface a structured error so callers can
    // decide whether this is an issuer decline vs. transient error.
    console.error('[Mastercard] Gateway returned non-OK HTTP status', {
      url,
      orderId,
      transactionId,
      status: response.status,
      response: json,
    });

    const message =
      json.error?.explanation ||
      json.error?.message ||
      json.result ||
      'Payment gateway error';

    throw new MastercardGatewayError(message, {
      status: response.status,
      raw: json,
    });
  }

  return json;
}

export function computeAmount({ tier, duration }: AmountInput) {
  const { totalPrice, monthlyPrice } = calculateSubscriptionPrice(
    tier,
    duration
  );

  return { amount: totalPrice, monthlyPrice };
}

/* TOKEN PAYMENT */

export async function payWithToken(params: {
  orderId: string;
  paymentTransactionId: string;
  paymentToken: string;
  amount: number;
  currency: string;
  reference?: string;
  securityCode?: string;
}) {
  const {
    orderId,
    paymentTransactionId,
    paymentToken,
    amount,
    currency,
    reference,
    securityCode,
  } = params;

  if (!securityCode) {
    throw new Error('CVV is required for tokenized payment');
  }

  const amountStr = Number.isFinite(amount)
    ? amount.toFixed(2)
    : String(amount);

  const payload = {
    apiOperation: 'PAY',
    order: {
      amount: amountStr,
      currency,
      reference: reference || orderId,
    },
    sourceOfFunds: {
      type: 'CARD',
      provided: {
        card: {
          token: paymentToken,
          securityCode,
        },
      },
    },
    transaction: {
      reference: reference || orderId,
    },
  };

  return putToGateway(orderId, paymentTransactionId, payload);
}

/* DEVICE / WALLET PAYMENT (Apple Pay / Google Pay)
 *
 * MPGS accepts a wallet payment token via sourceOfFunds.provided.card.devicePayment.
 * The token is obtained natively on-device (Apple Pay PKPaymentToken / Google Pay
 * payment token) and passed straight through to the gateway — the PAN is never
 * handled by the app, keeping tokenization consistent with the existing flows.
 */
export async function payWithDeviceToken(params: {
  orderId: string;
  paymentTransactionId: string;
  deviceToken: string;
  walletType: 'APPLE_PAY' | 'GOOGLE_PAY';
  amount: number;
  currency: string;
  reference?: string;
}) {
  const { orderId, paymentTransactionId, deviceToken, walletType, amount, currency, reference } =
    params;

  if (!deviceToken) {
    throw new Error('Wallet payment token is required');
  }

  const amountStr = Number.isFinite(amount) ? amount.toFixed(2) : String(amount);

  const payload = {
    apiOperation: 'PAY',
    order: {
      amount: amountStr,
      currency,
      reference: reference || orderId,
      walletProvider: walletType === 'APPLE_PAY' ? 'APPLE_PAY' : 'GOOGLE_PAY',
    },
    sourceOfFunds: {
      type: 'CARD',
      provided: {
        card: {
          devicePayment: {
            paymentToken: deviceToken,
          },
        },
      },
    },
    transaction: {
      reference: reference || orderId,
      source: 'INTERNET',
    },
  };

  return putToGateway(orderId, paymentTransactionId, payload);
}

/* DECRYPTED APPLE PAY PAYMENT (self-managed decryption)
 *
 * When we decrypt the Apple Pay token on our own server (because the gateway
 * does not hold the certificate's private key), we send the decrypted DPAN +
 * device cryptogram fields instead of the raw token. See the gateway's
 * "Decrypting the Payment Token" / "AUTHORIZE request example for decryption in
 * your server" flow.
 */
export async function payWithDecryptedApplePay(params: {
  orderId: string;
  paymentTransactionId: string;
  card: {
    number: string;
    expiryMonth: string;
    expiryYear: string;
    cryptogram: string;
    eci?: string;
  };
  amount: number;
  currency: string;
  reference?: string;
}) {
  const { orderId, paymentTransactionId, card, amount, currency, reference } = params;

  if (!card?.number || !card?.cryptogram) {
    throw new Error('Decrypted Apple Pay card data is incomplete');
  }

  const amountStr = Number.isFinite(amount) ? amount.toFixed(2) : String(amount);

  const payload = {
    apiOperation: 'PAY',
    order: {
      amount: amountStr,
      currency,
      reference: reference || orderId,
      walletProvider: 'APPLE_PAY',
    },
    sourceOfFunds: {
      type: 'CARD',
      provided: {
        card: {
          number: card.number,
          expiry: {
            month: card.expiryMonth,
            year: card.expiryYear,
          },
          devicePayment: {
            cryptogramFormat: '3DSECURE',
            onlinePaymentCryptogram: card.cryptogram,
            ...(card.eci ? { eciIndicator: card.eci } : {}),
          },
        },
      },
    },
    transaction: {
      reference: reference || orderId,
      source: 'INTERNET',
    },
  };

  return putToGateway(orderId, paymentTransactionId, payload);
}

/* DIRECT CARD PAYMENT */

export async function payWithCard(params: {
  orderId: string;
  paymentTransactionId: string;
  card: CardDetails;
  amount: number;
  currency: string;
  reference?: string;
}) {
  const { orderId, paymentTransactionId, card, amount, currency, reference } =
    params;

  if (!card?.securityCode) {
    throw new Error('CVV is required for card payment');
  }

  if (!card.number) {
    throw new Error('Card number missing');
  }

  if (!card.expiryMonth || !card.expiryYear) {
    throw new Error('Card expiry missing');
  }

  const amountStr = Number.isFinite(amount)
    ? amount.toFixed(2)
    : String(amount);

  const payload = {
    apiOperation: 'PAY',
    order: {
      amount: amountStr,
      currency,
      reference: reference || orderId,
    },
    sourceOfFunds: {
      type: 'CARD',
      provided: {
        card: {
          number: card.number,
          expiry: {
            month: card.expiryMonth,
            year: card.expiryYear,
          },
          securityCode: card.securityCode,
          nameOnCard: card.nameOnCard,
        },
      },
    },
    transaction: {
      reference: reference || orderId,
    },
  };

  return putToGateway(orderId, paymentTransactionId, payload);
}

/* 3DS INIT */

export async function initiateAuthentication(params: {
  orderId: string;
  transactionId: string;
  card: CardDetails;
  currency: string;
  channel?: 'PAYER_BROWSER' | 'PAYER_APP';
  methodNotificationUrl?: string;
}) {
  const {
    orderId,
    transactionId,
    card,
    currency,
    channel = 'PAYER_BROWSER',
    methodNotificationUrl,
  } = params;

  const payload: Record<string, any> = {
    apiOperation: 'INITIATE_AUTHENTICATION',
    authentication: { channel },
    order: { currency },
    sourceOfFunds: {
      provided: {
        card: {
          ...(card.number ? { number: card.number } : {}),
          ...(card.token ? { token: card.token } : {}),
        },
      },
    },
  };

  if (!card.number && !card.token) {
    throw new Error('Either card number or card token is required for 3DS initiation');
  }

  if (methodNotificationUrl) {
    try {
      const url = new URL(methodNotificationUrl);

      if (
        url.hostname === 'localhost' &&
        url.port &&
        url.port !== '80' &&
        url.port !== '443'
      ) {
        console.warn('[Mastercard] Skipping methodNotificationUrl');
      } else {
        payload.authentication.methodNotificationUrl = methodNotificationUrl;
      }
    } catch {}
  }

  return putToGateway(orderId, transactionId, payload);
}

/* AUTHENTICATE PAYER */

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

  const amountStr = Number.isFinite(amount)
    ? amount.toFixed(2)
    : String(amount);

  const payload = {
    apiOperation: 'AUTHENTICATE_PAYER',
    sourceOfFunds: {
      provided: {
        card: {
          ...(card.number ? { number: card.number } : {}),
          ...(card.token ? { token: card.token } : {}),
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

/* FINAL PAY AFTER 3DS */

export async function payWithAuthentication(params: {
  orderId: string;
  paymentTransactionId: string;
  authenticationTransactionId: string;
  authenticationStatus?: string;
  card: CardDetails;
  amount: number;
  currency: string;
  reference?: string;
}) {
  const {
    orderId,
    paymentTransactionId,
    authenticationTransactionId,
    card,
    amount,
    currency,
    reference,
  } = params;

  if (!card?.securityCode) {
    throw new Error('CVV required for authenticated payment');
  }
  const hasPan = !!card?.number;
  const hasToken = !!card?.token;
  if (!hasPan && !hasToken) {
    throw new Error('Either card number or card token is required for authenticated payment');
  }
  if (hasPan && (!card.expiryMonth || !card.expiryYear)) {
    throw new Error('Card expiry missing for authenticated payment');
  }

  const amountStr = Number.isFinite(amount)
    ? amount.toFixed(2)
    : String(amount);

  const payload = {
    apiOperation: 'PAY',
    authentication: {
      transactionId: authenticationTransactionId,
    },
    order: {
      amount: amountStr,
      currency,
      reference: reference || orderId,
    },
    sourceOfFunds: {
      type: 'CARD',
      provided: {
        card: {
          ...(hasPan ? { number: card.number } : {}),
          ...(hasToken ? { token: card.token } : {}),
          expiry:
            card.expiryMonth && card.expiryYear
              ? { month: card.expiryMonth, year: card.expiryYear }
              : undefined,
          securityCode: card.securityCode,
        },
      },
    },
    transaction: {
      reference: reference || orderId,
    },
  };

  return putToGateway(orderId, paymentTransactionId, payload);
}
