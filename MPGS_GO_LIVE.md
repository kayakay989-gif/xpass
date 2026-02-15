# MPGS Production Go‑Live Checklist (End‑to‑End)

This project uses MPGS (Mastercard Payment Gateway Services) via the **Direct REST API**:

- `INITIATE_AUTHENTICATION` (txn `1`)
- `AUTHENTICATE_PAYER` (txn `1`)
- `PAY` (txn `2`, includes `authentication.transactionId = "1"`)

## 1) Rotate credentials (security)

Your live password was shared in chat. Treat it as **exposed** and request a **rotation** from the provider before public release.

## 2) Set production MPGS credentials (backend)

MPGS production “Gateway Messages URL” provided:

- `https://ap-gateway.mastercard.com/api`

In this codebase you must set **host only** (no `/api`):

- `MPG_HOST=ap-gateway.mastercard.com`

Create `.env.local` in the project root (recommended) and set:

```text
NODE_ENV=production
MPG_HOST=ap-gateway.mastercard.com
MPG_MERCHANT_ID=9589667361EP
MPG_API_USERNAME=merchant.9589667361EP
MPG_API_PASSWORD=***REDACTED***
MPG_API_VERSION=100
```

Optional logging toggle (do **not** enable in production unless troubleshooting):

```text
MPG_DEBUG=1
```

Start backend:

```bat
npm run start-server
```

## 3) Configure Firebase Admin for production (backend)

This backend uses Firebase Admin. In production you should set:

- `FIREBASE_SERVICE_ACCOUNT` to the service account JSON string (recommended for server deployments)

Do not commit service account files into the repo.

## 4) Deploy the backend to a public HTTPS domain

You must host the backend on a **public HTTPS URL** (port 443) for:

- tRPC calls from the app
- the 3DS ACS return/callback (`/api/3ds/callback`)

Requirements:

- Public: accessible from the internet
- HTTPS: valid certificate
- Routes reachable:
  - `GET /` (health)
  - `POST /trpc/*`
  - `POST /api/3ds/callback`

## 5) Set the app API base URL (frontend)

Set this during build/runtime:

- `EXPO_PUBLIC_RORK_API_BASE_URL=https://<your-backend-domain>`

This drives:

- tRPC base URL: `https://<domain>/trpc`
- 3DS callback URL: `https://<domain>/api/3ds/callback`

### Important (production behavior)

In production, the backend **does not accept** a redirect URL from the client for 3DS.
It always uses:

- `${EXPO_PUBLIC_RORK_API_BASE_URL}/api/3ds/callback`

So if `EXPO_PUBLIC_RORK_API_BASE_URL` is missing or not HTTPS, the payment flow will fail fast with a clear error.

## 6) Confirm the full production cycle

1. Run a payment on a test device/build
2. Confirm in backend logs:
   - `INITIATE_AUTHENTICATION` success
   - `AUTHENTICATE_PAYER` returns `PROCEED` or challenge flow completes
   - `PAY` returns `result=SUCCESS`
3. Confirm in gateway response:
   - `response.gatewayCode = APPROVED`
   - `order.status = CAPTURED` (or your expected settlement state)

## 7) Data persistence verification

Payments and subscriptions are written to **Firestore** via Admin SDK:

- `payments` collection: docs like `${orderId}-${transactionId}`
- `subscriptions` collection: `sub-...`

Verify that after restarting the backend, the payment/subscription records remain.

## 8) Production readiness notes

- Make sure your pricing/amount logic matches production requirements.
- Ensure you have monitoring/alerts for failed gateway calls.
- Consider adding webhook-based reconciliation if your acquirer recommends it.

