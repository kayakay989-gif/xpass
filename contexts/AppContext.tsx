import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Subscription, Gym, CheckIn, SubscriptionTier, SubscriptionDuration } from '@/types';
import { trpc } from '@/lib/trpc';
import { useAuth } from './AuthContext';
import { firestoreGyms } from '@/lib/firestore';

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
  const { user } = useAuth();
  const userId = user?.id || null;

  const subscriptionQuery = trpc.subscriptions.getCurrent.useQuery(
    // safely omit when no user
    { userId: userId as any },
    { enabled: !!userId }
  );
  
  const checkInsQuery = trpc.checkIns.list.useQuery(
    { userId: userId as any },
    { enabled: !!userId }
  );

  const subscription = subscriptionQuery.data || null;
  const checkIns = checkInsQuery.data || [];
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [isGymsLoading, setIsGymsLoading] = useState<boolean>(true);
  const [gymsError, setGymsError] = useState<string | null>(null);

  const refetchGyms = useCallback(async () => {
    setIsGymsLoading(true);
    try {
      const gymsData = await firestoreGyms.getAll();
      setGyms(gymsData);
      setGymsError(null);
      return gymsData;
    } catch (e: any) {
      const msg =
        e?.code
          ? `${e.code}${e?.message ? `: ${e.message}` : ''}`
          : e?.message || 'Failed to load gyms from Firestore.';
      setGymsError(msg);
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
    if (selectedGymFilter === 'all') return gyms;
    return gyms.filter(gym => gym.allowedTiers.includes(selectedGymFilter));
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
      isLoading: subscriptionQuery.isLoading || isGymsLoading || checkInsQuery.isLoading,
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
    subscriptionQuery.isLoading,
    isGymsLoading,
    checkInsQuery.isLoading,
    checkInMutation.isPending,
  ]);
});
