import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { firestorePayments } from "./lib/firestore-admin";

const app = new Hono();

console.log('[Hono] Server initializing...');

app.use("*", cors({
  origin: '*',
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Add request logging middleware
app.use("/trpc/*", async (c, next) => {
  console.log('[tRPC Server] Incoming request:', {
    method: c.req.method,
    url: c.req.url,
    path: c.req.path,
    origin: c.req.header('origin'),
  });
  await next();
});

// tRPC server - handle all methods
app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      console.error('[tRPC Server] Error on path', path, ':', {
        message: error.message,
        code: error.code,
        cause: error.cause,
      });
    },
  })
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "API is running" });
});

app.get("/api", (c) => {
  return c.json({ status: "ok", message: "API endpoint is accessible" });
});

app.all("/api/3ds/callback", async (c) => {
  const body = await c.req.parseBody().catch(() => ({}));
  // MPGS posts x-www-form-urlencoded fields like:
  // - order.id, transaction.id, result, response.gatewayRecommendation, delegate=THREEDS
  const getField = (key: string): string | undefined => {
    const v: any = (body as any)?.[key];
    if (Array.isArray(v)) return v[0];
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    return undefined;
  };

  const orderId = getField('order.id') || getField('orderId');
  const authTransactionId = getField('transaction.id') || getField('transactionId');
  const result = getField('result');
  const gatewayRecommendation = getField('response.gatewayRecommendation') || getField('gatewayRecommendation');
  const delegate = getField('delegate');

  console.log('[3DS Callback] Received redirect from ACS', {
    method: c.req.method,
    url: c.req.url,
    orderId,
    authTransactionId,
    result,
    gatewayRecommendation,
    delegate,
  });

  // Best-effort: store the ACS callback details against the auth transaction record (orderId-1).
  // This is NOT treated as authoritative for payment completion; it’s used for audit/debug and
  // to help the client know it can proceed to PAY.
  if (orderId && authTransactionId) {
    try {
      await firestorePayments.update(`${orderId}-${authTransactionId}`, {
        last3dsCallbackAt: new Date(),
        threeDS: {
          delegate,
          result,
          gatewayRecommendation,
        },
  });
    } catch (e) {
      console.warn('[3DS Callback] Failed to persist callback details (non-fatal):', e);
    }
  }

  const msg = JSON.stringify({
    type: '3DS_AUTH_COMPLETE',
    orderId,
    authTransactionId,
    result,
    gatewayRecommendation,
    delegate,
  });

  const html = `
    <html>
      <body style="font-family: sans-serif; text-align: center; padding: 32px;">
        <h2>Authentication received</h2>
        <p>You can return to the app now.</p>
        <script>
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(${JSON.stringify(msg)});
          }
          // Web fallback: notify parent window if inside an iframe.
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage(${JSON.stringify(msg)}, '*');
          }
          } catch (e) {}
        </script>
      </body>
    </html>
  `;
  return c.html(html);
});

app.all("*", (c) => {
  console.log('[Hono] Unmatched route:', c.req.method, c.req.url);
  return c.json({ error: "Not found", path: c.req.path }, 404);
});

console.log('[Hono] Server initialized and ready to handle requests');
console.log('[Hono] tRPC endpoint: /trpc/*');

export default app;
