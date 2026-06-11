import { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { initTRPC } from "@trpc/server";
import SuperJSON from "superjson";
import admin from "@/backend/lib/firebase-admin";
import { adminDb } from "@/backend/lib/firebase-admin";
import { getGymOwnerSessionByToken } from "@/backend/lib/gym-owner-auth";
import { TRPCError } from "@trpc/server";

export const createContext = async (opts: FetchCreateContextFnOptions) => {
  const startedAt = Date.now();
  const authHeader = opts.req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;

  const gymOwnerToken =
    opts.req.headers.get("x-gym-owner-token") ||
    opts.req.headers.get("x-gym-owner-session") ||
    null;

  let user: { uid: string; email?: string | null } | null = null;
  let gymOwner: { ownerId: string; gymId: string } | null = null;

  if (bearer) {
    try {
      const decoded = await admin.auth().verifyIdToken(bearer);
      user = { uid: decoded.uid, email: decoded.email ?? null };
    } catch {
      // ignore; user remains null (unauthorized)
    }
  }

  if (gymOwnerToken) {
    try {
      const session = await getGymOwnerSessionByToken(gymOwnerToken);
      if (session) {
        gymOwner = { ownerId: session.ownerId, gymId: session.gymId };
      }
    } catch {
      // ignore
    }
  }

  // Lazy admin check: the Firestore role read only runs for procedures that need it
  // (admin / gym-owner routes). Member routes (subscriptions, check-ins, ...) skip it,
  // saving a Firestore round trip on every request. Memoized per request.
  let isAdminPromise: Promise<boolean> | null = null;
  const getIsAdmin = (): Promise<boolean> => {
    if (!user) return Promise.resolve(false);
    if (!isAdminPromise) {
      const uid = user.uid;
      isAdminPromise = (async () => {
        try {
          const roleStart = Date.now();
          // Role lives in Firestore: users/{uid} { role: "admin", status: "active" }
          const snap = await adminDb.collection("users").doc(uid).get();
          const data: any = snap.exists ? snap.data() : null;
          console.log(
            "[Perf] admin role lookup:",
            JSON.stringify({ ms: Date.now() - roleStart })
          );
          return data?.role === "admin" && data?.status === "active";
        } catch {
          return false;
        }
      })();
    }
    return isAdminPromise;
  };

  const authMs = Date.now() - startedAt;
  if (authMs > 250) {
    console.log(
      "[Perf] createContext slow:",
      JSON.stringify({ authMs, hasUser: !!user, hasGymOwner: !!gymOwner })
    );
  }

  return {
    req: opts.req,
    user,
    getIsAdmin,
    gymOwner,
  };
};

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: SuperJSON,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next();
});

export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !(await ctx.getIsAdmin())) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

export const gymOwnerProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.gymOwner) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next();
});

export const gymOwnerOrAdminProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.gymOwner && !(await ctx.getIsAdmin())) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next();
});
