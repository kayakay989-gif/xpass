import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import superjson from "superjson";
import { config } from "@/lib/config";
import { auth } from "@/lib/firebase";

// AsyncStorage is available on native and has a web shim.
let AsyncStorage: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  AsyncStorage = require("@react-native-async-storage/async-storage")?.default ?? require("@react-native-async-storage/async-storage");
} catch {
  AsyncStorage = null;
}

// Optional Expo imports (only available in Expo environment)
let Constants: any = null;
try {
  Constants = require('expo-constants');
} catch {
  // Not in Expo environment (e.g., Node.js server)
}

export const trpc = createTRPCReact<AppRouter>();

const resolveHostnameFromScriptUrl = (): string | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    const scriptURL: string | undefined = rn?.NativeModules?.SourceCode?.scriptURL;
    if (!scriptURL) return null;
    const parsed = new URL(scriptURL);
    return parsed.hostname || null;
  } catch {
    return null;
  }
};

const resolveLanUrlFromExpo = (): string | null => {
  if (!Constants) return null;
  try {
    const expoAny: any = Constants;

    const candidates: Array<string | undefined> = [
      expoAny.manifest?.debuggerHost,
      expoAny.manifest?.hostUri,
      expoAny.expoConfig?.hostUri,
      expoAny.expoConfig?.developer?.host,
      expoAny.expoConfig?.packagerOpts?.host,
      expoAny.expoGoConfig?.debuggerHost,
      expoAny.expoGoConfig?.hostUri,
      expoAny?.manifest2?.extra?.expoClient?.hostUri,
    ];

    const hostUri = candidates.find(Boolean);
    if (!hostUri) return null;

    const hostname = hostUri.split(':')[0];
    if (!hostname) return null;

    return `http://${hostname}:3000`;
  } catch {
    return null;
  }
};

const getBaseUrl = () => {
  // Use centralized config which has fallback for development
  const baseUrl = config.api.baseUrl;
  
  if (baseUrl) {
    return baseUrl;
  }

  // IMPORTANT: Do not throw at module-import time.
  // App Store review builds often run without local `.env` injection, which can cause a launch-time crash.
  // We fall back to the backend URL documented in `ENV_EXAMPLE.txt` so the app can boot and fail gracefully later.
  console.warn(
    '[tRPC] Missing EXPO_PUBLIC_RORK_API_BASE_URL; falling back to default backend URL for launch safety.'
  );
  return 'https://xpass-b66g.onrender.com';
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/trpc`,
      transformer: superjson,
      fetch: async (url, options) => {
        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(options?.headers as any),
          };

          const urlString = typeof url === 'string' ? url : String(url);
          const isGymOwnerLogin = urlString.includes('gymOwners.login');

          // Resolve Firebase token and gym owner session token in parallel
          // (previously sequential awaits added latency to every request).
          const getFirebaseToken = async (): Promise<string | null> => {
            // Gym owner portal does not use Firebase Auth — skip token refresh to avoid slow login on web.
            if (isGymOwnerLogin) return null;
            let token = await auth.currentUser?.getIdToken?.().catch(() => null);
            if (auth.currentUser && !token) {
              await new Promise((r) => setTimeout(r, 120));
              token = await auth.currentUser.getIdToken(true).catch(() => null);
            }
            return token ?? null;
          };
          const getGymOwnerToken = async (): Promise<string | null> => {
            if (!AsyncStorage) return null;
            return AsyncStorage.getItem("gymOwnerSessionToken").catch(() => null);
          };

          const [token, gymOwnerToken] = await Promise.all([
            getFirebaseToken(),
            getGymOwnerToken(),
          ]);

          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }
          // Gym owner session auth (web gym panel)
          if (gymOwnerToken) {
            headers["x-gym-owner-token"] = gymOwnerToken;
          }

          // Preserve the method that tRPC sets (POST for mutations, GET for queries)
          const method = options?.method || 'POST';
          // No noisy request logging in production
          
          // Render cold starts + gym owner lookup can exceed 14s on mobile Safari.
          const isAdminRoute = urlString.includes('admin.');
          const REQUEST_TIMEOUT_MS = isGymOwnerLogin || isAdminRoute ? 60_000 : 14_000;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
          let response: Response;
          try {
            response = await fetch(url, {
              ...options,
              method, // Preserve the method set by tRPC
              headers,
              signal: controller.signal,
            });
          } catch (fetchError: any) {
            if (fetchError?.name === 'AbortError') {
              const err = new Error('Fetch is aborted') as Error & { name: string };
              err.name = 'AbortError';
              throw err;
            }
            throw fetchError;
          } finally {
            clearTimeout(timeoutId);
          }
          
          if (!response.ok) {
            const text = await response.text();
            let json: any = null;
            try {
              json = text ? JSON.parse(text) : null;
            } catch {
              json = null;
            }

            const err = new Error(
              json?.error?.json?.message ||
                json?.error?.message ||
                json?.message ||
                `HTTP ${response.status}: ${text}`
            ) as any;

            err.status = response.status;
            err.json = json;
            err.data = json?.error?.data;
            err.shape = json?.error?.shape;
            err.cause = json?.error?.cause;

            throw err;
          }
          
          return response;
        } catch (error) {
          throw error;
        }
      },
    }),
  ],
});
