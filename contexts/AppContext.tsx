import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Subscription, Gym, CheckIn, SubscriptionTier, SubscriptionDuration } from '@/types';
import { trpc } from '@/lib/trpc';
import { useAuth } from './AuthContext';
import { firestoreGyms } from '@/lib/firestore';
import { config } from '@/lib/config';
import { getGymTier } from '@/lib/gym-tier';
import { agentLog } from '@/lib/agent-debug-log';

// Pricing table (TOTAL price for duration) based on provided spec
const TOTAL_PRICES: Record<SubscriptionDuration, Record<SubscriptionTier, number>> = {
  1:    { silver: 65,  gold: 90,  diamond: 140, elite: 225 },
  3:    { silver: 165, gold: 220, diamond: 300, elite: 550 },
  6:    { silver: 290, gold: 360, diamond: 480, elite: 900 },
  12:   { silver: 520, gold: 635, diamond: 850, elite: 1600 },
  // For unsupported durations, fall back later safely
} as any;

export function calculateSubscriptionPrice(tier: SubscriptionTier, duration: SubscriptionDuration): { monthlyPrice: number; totalPrice: number } {
  const durationPrices = (TOTAL_PRICES as any)[duration] as Record<SubscriptionTier, number> | undefined;
  const totalPrice = durationPrices ? durationPrices[tier] : 0;
  const months = Number(duration) || 1;
  const monthlyPrice = months > 0 ? Math.round(totalPrice / months) : 0;
  return { monthlyPrice, totalPrice };
}

export const [AppProvider, useApp] = createContextHook(() => {
  const { user, firebaseUser } = useAuth();
  // MUST match Firebase ID token uid. Never prefer `user.id` first — Firestore profile id can differ
  // (e.g. legacy/email edge cases) and would cause getCurrent Unauthorized + empty subscription on mobile.
  const userId = firebaseUser?.uid ?? null;

  const subscriptionQuery = trpc.subscriptions.getCurrent.useQuery(
    { userId: userId as any },
    {
      enabled: !!userId,
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
      retryDelay: (attempt) => Math.min(800 * (attempt + 1), 4000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    }
  );
  
  const checkInsQuery = trpc.checkIns.list.useQuery(
    { userId: userId as any },
    {
      enabled: !!userId,
      staleTime: 30_000,
      retry: 1,
    }
  );

  const subscription = userId ? subscriptionQuery.data || null : null;
  const checkIns = userId ? checkInsQuery.data || [] : [];
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [isGymsLoading, setIsGymsLoading] = useState<boolean>(true);
  const [gymsError, setGymsError] = useState<string | null>(null);

  const refetchGyms = useCallback(async () => {
    setIsGymsLoading(true);
    try {
      const timeoutMs = 25000;
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Gym list timed out after ${timeoutMs / 1000}s`)),
          timeoutMs
        );
      });
      const gymsData = await Promise.race([
        firestoreGyms.getAll().finally(() => clearTimeout(timeoutId)),
        timeoutPromise,
      ]);
      setGyms(gymsData);
      setGymsError(null);
      return gymsData;
    } catch (e: any) {
      const msg =
        e?.code
          ? `${e.code}${e?.message ? `: ${e.message}` : ''}`
          : e?.message || 'Failed to load gyms from Firestore.';
      const projectHint = config.firebase.projectId ? ` (project: ${config.firebase.projectId})` : '';
      setGymsError(`${msg}${projectHint}`);
      // Keep previous gyms (if any) so we don't flash empty UI.
      throw e;
    } finally {
      setIsGymsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load gyms from Firestore directly so the user flow doesn't depend on the backend server.
    // This also ensures the user app shows the same gyms as the admin panel.
    refetchGyms().catch((e) => {
      console.error('[AppContext] Failed to load gyms from Firestore:', e);
    });
  }, [refetchGyms]);

  const [selectedGymFilter, setSelectedGymFilter] = useState<SubscriptionTier | 'all'>('all');

  // Debug logging for subscription lifecycle to help trace perceived delays.
  useEffect(() => {
    console.log('[AppContext] Subscription query state:', {
      enabled: !!userId,
      isLoading: subscriptionQuery.isLoading,
      hasData: !!subscriptionQuery.data,
    });
    // #region agent log
    const err = subscriptionQuery.error as Error | undefined;
    agentLog('H3', 'AppContext.tsx:subscriptionQuery', 'subscription_query_state', {
      userIdPresent: !!userId,
      isPending: subscriptionQuery.isPending,
      isFetching: subscriptionQuery.isFetching,
      hasData: !!subscriptionQuery.data,
      rawTier: subscriptionQuery.data ? String((subscriptionQuery.data as { tier?: unknown }).tier ?? '') : '',
      fetchStatus: subscriptionQuery.fetchStatus,
      errorMessage: err?.message?.slice(0, 120) ?? '',
    });
    agentLog('H4', 'AppContext.tsx:subscriptionQuery', 'subscription_tier_for_ui', {
      hasSubscription: !!subscriptionQuery.data,
      tier: subscriptionQuery.data ? String((subscriptionQuery.data as { tier?: unknown }).tier ?? '') : '',
    });
    // #endregion
  }, [
    userId,
    subscriptionQuery.isPending,
    subscriptionQuery.isFetching,
    subscriptionQuery.data,
    subscriptionQuery.fetchStatus,
    subscriptionQuery.error,
  ]);

  const checkInMutation = trpc.checkIns.create.useMutation({
    onSuccess: () => {
      console.log('[AppContext] Check-in successful, refetching data...');
      checkInsQuery.refetch();
      subscriptionQuery.refetch();
    },
  });

  const checkIn = useCallback(async (gymId: string): Promise<{ success: boolean; message: string }> => {
    try {
      if (!userId) {
        throw new Error('Please log in to check in');
      }
      const result = await checkInMutation.mutateAsync({ userId, gymId });
      return { success: true, message: 'Check-in successful!' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Check-in failed';
      console.error('[AppContext] Check-in error:', errorMessage);
      return { success: false, message: errorMessage };
    }
  }, [userId, checkInMutation]);

  const refreshSubscription = useCallback(async (): Promise<void> => {
    if (!userId) return;
    await subscriptionQuery.refetch();
  }, [userId, subscriptionQuery]);

  const createSubscriptionMutation = trpc.subscriptions.create.useMutation({
    onSuccess: () => {
      console.log('[AppContext] Subscription created, refetching data...');
      subscriptionQuery.refetch();
    },
  });

  const createSubscription = useCallback(async (tier: SubscriptionTier, duration: SubscriptionDuration): Promise<void> => {
    try {
      if (!userId) {
        throw new Error('Please log in to subscribe');
      }
      await createSubscriptionMutation.mutateAsync({ userId, tier, duration });
    } catch (error) {
      console.error('[AppContext] Create subscription error:', error);
      throw error;
    }
  }, [userId, createSubscriptionMutation]);

  const filteredGyms = useMemo(() => {
    if (!gyms) return [];

    // If no specific tier is selected, return all gyms.
    if (selectedGymFilter === 'all') return gyms;

    const selectedTier = selectedGymFilter as SubscriptionTier;

    // Filter by the same tier logic used for badges (`getGymTier`),
    // so the list and the label are always consistent.
    return gyms.filter((gym: any) => getGymTier(gym) === selectedTier);
  }, [gyms, selectedGymFilter]);

  return useMemo(() => {
    return {
      subscription,
      gyms,
      filteredGyms,
      gymsError,
      checkIns,
      selectedGymFilter,
      setSelectedGymFilter,
      checkIn,
      createSubscription,
      refetchGyms,
      refreshSubscription,
      subscriptionQuery,
      // Do not block the whole app on check-ins; home/subscription only need subscription + gyms.
      isLoading: subscriptionQuery.isLoading || isGymsLoading,
      isSubscriptionLoading: !!userId && (subscriptionQuery.isPending || subscriptionQuery.isFetching),
      isCheckInsLoading: checkInsQuery.isLoading,
      isCheckingIn: checkInMutation.isPending,
    };
  }, [
    subscription,
    gyms,
    filteredGyms,
    gymsError,
    checkIns,
    selectedGymFilter,
    checkIn,
    createSubscription,
    refetchGyms,
    refreshSubscription,
    subscriptionQuery,
    subscriptionQuery.isLoading,
    isGymsLoading,
    checkInsQuery.isLoading,
    checkInMutation.isPending,
  ]);
});
