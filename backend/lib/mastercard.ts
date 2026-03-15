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

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: buildAuthHeader(cfg),
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  let json: any = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Invalid response from payment gateway');
  }

  if (!response.ok) {
    throw new Error(json.error?.explanation || 'Payment gateway error');
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
          number: card.number,
        },
      },
    },
  };

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
          number: card.number,
          expiry: {
            month: card.expiryMonth,
            year: card.expiryYear,
          },
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
