# Mastercard Payment Gateway Configuration

## Test Environment Credentials

Do not commit gateway credentials (even sandbox) into the repo.
Use environment variables only.

## Configuration

Set these via environment variables:

```bash
MPG_HOST=test-network.mtf.gateway.mastercard.com
MPG_MERCHANT_ID=test12122024
MPG_API_USERNAME=merchant.test12122024
MPG_API_PASSWORD=REPLACE_ME
MPG_API_VERSION=100
```

## Production Setup

When moving to production, update the environment variables with your live credentials:

```bash
MPG_HOST=ap-gateway.mastercard.com  # Production gateway host (use host only, without /api)
MPG_MERCHANT_ID=your_live_merchant_id
MPG_API_USERNAME=merchant.your_live_merchant_id
MPG_API_PASSWORD=your_live_api_password
MPG_API_VERSION=100
```

### Recommended (do not hardcode live credentials)

- Create a `.env.local` file (not committed) and set the variables there.
- The backend server (`npm run start-server`) loads `.env.local` automatically.

See `ENV_EXAMPLE.txt` for a template.

## Payment Flow

The implementation follows the Mastercard 3DS Payer Authentication API flow:

1. **INITIATE_AUTHENTICATION** - Determines 3DS availability and initiates method call
2. **AUTHENTICATE_PAYER** - Authenticates the payer (frictionless or challenge flow)
3. **PAY** - Processes the payment using the authentication result

## Test Cards

Use these test cards for testing:

### Successful Payment (3DS)
- **Card Number**: `5123450000000008`
- **Expiry**: Any future date (e.g., `12/25`)
- **CVV**: `123`
- **Cardholder Name**: Any name

### Declined Payment
- **Card Number**: `5123450000000009`
- **Expiry**: Any future date
- **CVV**: `123`

## API Endpoints

The payment flow uses these tRPC endpoints:

- `payments.initiate3ds` - Step 1: Initiate authentication
- `payments.authenticate3ds` - Step 2: Authenticate payer
- `payments.payWith3ds` - Step 3: Process payment

## Transaction IDs

- **INITIATE_AUTHENTICATION**: Uses transaction ID `1`
- **AUTHENTICATE_PAYER**: Uses transaction ID `1` (same as initiate)
- **PAY**: Uses transaction ID `2` (new transaction for payment)

## Notes

- All amounts are formatted as strings in API requests (Mastercard requirement)
- The gateway uses Basic Authentication with API Username and Password
- Browser details are automatically included for 3DS authentication
- The redirect URL is configured to handle 3DS challenge completion

