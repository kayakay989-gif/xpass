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

  throw new Error(
    "No base url found, please set EXPO_PUBLIC_RORK_API_BASE_URL or configure it in lib/config.ts"
  );
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

          // Firebase user auth (mobile/user/admin)
          const token = await auth.currentUser?.getIdToken?.().catch(() => null);
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }

          // Gym owner session auth (web gym panel)
          if (AsyncStorage) {
            const gymOwnerToken = await AsyncStorage.getItem("gymOwnerSessionToken").catch(() => null);
            if (gymOwnerToken) {
              headers["x-gym-owner-token"] = gymOwnerToken;
            }
          }

          // Preserve the method that tRPC sets (POST for mutations, GET for queries)
          const method = options?.method || 'POST';
          // No noisy request logging in production
          
          const response = await fetch(url, {
            ...options,
            method, // Preserve the method set by tRPC
            headers,
          });
          
          if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          }
          
          return response;
        } catch (error) {
          throw error;
        }
      },
    }),
  ],
});
