import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  Linking,
  Platform,
  Modal,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight, CreditCard, Filter, Home, User as UserIcon } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { paramFirst } from '@/lib/expo-router-params';
import { trpc } from '@/lib/trpc';

export default function GymDashboardScreen() {
  const router = useRouter();
  const trpcUtils = trpc.useUtils();
  const urlParams = useLocalSearchParams<{ gymId?: string | string[] }>();
  const urlGymId = paramFirst(urlParams.gymId);
  const [actualGymId, setActualGymId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'home' | 'payments' | 'profile'>('home');
  const [homeView, setHomeView] = useState<'main' | 'checkinsToday' | 'checkinsAll'>('main');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [gym, setGym] = useState<any>(null);
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [gymOwner, setGymOwner] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [checkInsLoadError, setCheckInsLoadError] = useState<string | null>(null);
  const [showSupportModal, setShowSupportModal] = useState(false);

  // Load via backend API (gym owners are not Firebase Auth users — client Firestore reads fail)
  const loadData = async (gymIdToLoad: string) => {
    if (!gymIdToLoad) {
      console.warn('[GymDashboard] No gymId provided to loadData');
      setIsLoading(false);
      return;
    }

    try {
      setIsRefreshing(true);
      console.log('[GymDashboard] Loading data for gymId:', gymIdToLoad);

      const profile = await trpcUtils.gymOwners.getProfile.fetch({ gymId: gymIdToLoad });
      if (!profile?.gym) {
        console.error('[GymDashboard] Gym not found for gymId:', gymIdToLoad);
        setGym(null);
        return;
      }

      setGym(profile.gym);
      setGymOwner(profile.owner);

      try {
        const checkInsData = await trpcUtils.gyms.getCheckIns.fetch({ gymId: gymIdToLoad });
        setCheckIns(checkInsData || []);
        setCheckInsLoadError(null);
        console.log('[GymDashboard] Check-ins loaded:', {
          gymId: gymIdToLoad,
          returnedCount: checkInsData?.length || 0,
        });
      } catch (checkInsError: any) {
        const message =
          checkInsError?.message || 'Failed to load check-ins. Pull down to refresh.';
        console.error('[GymDashboard] Check-ins load failed:', {
          gymId: gymIdToLoad,
          message,
        });
        setCheckInsLoadError(message);
        // Keep prior check-ins visible on refresh failure instead of clearing the list.
      }
    } catch (error) {
      console.error('[GymDashboard] Error loading data:', error);
      setGym(null);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [token, storedGymId] = await Promise.all([
          AsyncStorage.getItem('gymOwnerSessionToken'),
          AsyncStorage.getItem('gymOwnerGymId'),
        ]);

        // Session storage is authoritative (URL can be stale after login redirect)
        const gymIdToUse = storedGymId || urlGymId;

        console.log('[GymDashboard] Session check:', {
          hasToken: !!token,
          storedGymId,
          urlGymId,
          gymIdToUse,
        });

        if (!token || !gymIdToUse) {
          console.warn('[GymDashboard] Missing token or gymId, redirecting to login');
          router.replace('/gym-login' as any);
          return;
        }

        if (urlGymId && storedGymId && urlGymId !== storedGymId) {
          console.warn('[GymDashboard] URL gymId differs from stored, using stored:', storedGymId);
        }

        if (cancelled) return;

        setActualGymId(gymIdToUse);
        setSessionChecked(true);
        await loadData(gymIdToUse);
      } catch (error) {
        if (cancelled) return;
        console.error('[GymDashboard] Session check error:', error);
        router.replace('/gym-login' as any);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [urlGymId, router]);

  useFocusEffect(
    useCallback(() => {
      if (!actualGymId || !sessionChecked) return;
      void loadData(actualGymId);
    }, [actualGymId, sessionChecked])
  );

  // Load payouts data (pending + paid) from the same source as the admin panel
  const payoutsQuery = trpc.gyms.getPayments.useQuery(
    { gymId: actualGymId || '' },
    {
      enabled: !!actualGymId,
      refetchOnWindowFocus: true,
    }
  );
  const payments = payoutsQuery.data || [];

  const pendingPayouts = useMemo(
    () => payments.filter((p: any) => p.status === 'pending'),
    [payments]
  );

  const paidPayouts = useMemo(
    () => payments.filter((p: any) => p.status === 'paid'),
    [payments]
  );

  const latestPaidPayout = useMemo(
    () => (paidPayouts.length > 0 ? paidPayouts[0] : null),
    [paidPayouts]
  );

  const pastPaidPayouts = useMemo(
    () => (paidPayouts.length > 1 ? paidPayouts.slice(1) : []),
    [paidPayouts]
  );

  const todayCheckIns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return checkIns.filter((ci: any) => {
      const ciDate = new Date(ci.timestamp);
      ciDate.setHours(0, 0, 0, 0);
      return ciDate.getTime() === today.getTime();
    });
  }, [checkIns]);

  const sortedAllCheckIns = useMemo(() => {
    return [...checkIns].sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [checkIns]);

  const stats = useMemo(() => {
    // Calculate monthly earnings from check-ins with payoutAmount
    const monthlyEarnings = checkIns.reduce((sum: number, ci: any) => {
      return sum + (ci.payoutAmount || 0);
    }, 0);

    return {
      totalToday: todayCheckIns.length,
      totalAll: checkIns.length,
      monthlyEarnings: monthlyEarnings,
    };
  }, [checkIns, todayCheckIns.length]);

  const onRefresh = () => {
    if (actualGymId) {
      loadData(actualGymId);
      payoutsQuery.refetch();
    }
  };

  if (!sessionChecked || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>Loading gym dashboard...</Text>
      </View>
    );
  }

  if (!gym && !isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Gym not found</Text>
        <Text style={styles.errorSubtext}>Gym ID: {actualGymId || 'unknown'}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={async () => {
            const storedGymId = await AsyncStorage.getItem('gymOwnerGymId');
            if (storedGymId) {
              setIsLoading(true);
              await loadData(storedGymId);
            } else {
              router.replace('/gym-login' as any);
            }
          }}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.logoutButtonSmall}
          onPress={async () => {
            await AsyncStorage.multiRemove(['gymOwnerSessionToken', 'gymOwnerGymId', 'gymOwnerId']);
            router.replace('/gym-login' as any);
          }}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ownerEmail = gymOwner?.email;

  const TopBar = () => (
    <View style={styles.topBar}>
      <View style={styles.brandRow}>
        <Image
          source={require('../assets/images/main logo.png')}
          style={styles.brandLogo}
          resizeMode="contain"
        />
        <Text style={styles.brandText}>XPASS</Text>
      </View>

      <View style={styles.topBarRight}>
        <TouchableOpacity
          style={styles.profilePill}
          activeOpacity={0.8}
          onPress={() => {
            setActiveTab('profile');
            setHomeView('main');
          }}
        >
          <UserIcon size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const BottomTabs = () => (
    <View style={styles.bottomTabs}>
      <TouchableOpacity
        style={styles.bottomTabItem}
        activeOpacity={0.85}
        onPress={() => {
          setActiveTab('home');
          setHomeView('main');
        }}
      >
        <View style={[styles.bottomTabIconWrap, activeTab === 'home' && styles.bottomTabIconWrapActive]}>
          <Home size={20} color={activeTab === 'home' ? '#FFFFFF' : '#9CA3AF'} />
        </View>
        <Text style={[styles.bottomTabLabel, activeTab === 'home' && styles.bottomTabLabelActive]}>Home</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.bottomTabItem}
        activeOpacity={0.85}
        onPress={() => {
          setActiveTab('payments');
          setHomeView('main');
        }}
      >
        <View style={[styles.bottomTabIconWrap, activeTab === 'payments' && styles.bottomTabIconWrapActive]}>
          <CreditCard size={20} color={activeTab === 'payments' ? '#FFFFFF' : '#9CA3AF'} />
        </View>
        <Text style={[styles.bottomTabLabel, activeTab === 'payments' && styles.bottomTabLabelActive]}>
          Payments
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.bottomTabItem}
        activeOpacity={0.85}
        onPress={() => {
          setActiveTab('profile');
          setHomeView('main');
        }}
      >
        <View style={[styles.bottomTabIconWrap, activeTab === 'profile' && styles.bottomTabIconWrapActive]}>
          <UserIcon size={20} color={activeTab === 'profile' ? '#FFFFFF' : '#9CA3AF'} />
        </View>
        <Text style={[styles.bottomTabLabel, activeTab === 'profile' && styles.bottomTabLabelActive]}>
          Profile
        </Text>
      </TouchableOpacity>
    </View>
  );

  const CheckInsList = ({ mode }: { mode: 'today' | 'all' }) => {
    const title = mode === 'today' ? 'Check ins today' : 'All Check ins';
    const data = mode === 'today' ? todayCheckIns : sortedAllCheckIns;

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.screenTitle}>{title}</Text>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.8}>
            <Filter size={20} color="#111827" />
          </TouchableOpacity>
        </View>

        <View style={styles.list}>
          {data.map((ci: any) => {
            const dt = new Date(ci.timestamp);
            return (
              <View key={ci.id} style={styles.checkinCard}>
                {ci.userPhotoUrl ? (
                  <Image source={{ uri: ci.userPhotoUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]} />
                )}
                <View style={styles.checkinInfo}>
                  <Text style={styles.checkinName}>{ci.userName}</Text>
                  <Text style={styles.checkinSub}>Checked into {gym.name}</Text>
                  <Text style={styles.checkinTime}>
                    {dt.toLocaleDateString()} , {dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          headerShown: false,
          gestureEnabled: false,
          headerBackVisible: false,
          headerLeft: () => null,
        }} 
      />

      <TopBar />

      {activeTab === 'home' && homeView === 'checkinsToday' && <CheckInsList mode="today" />}
      {activeTab === 'home' && homeView === 'checkinsAll' && <CheckInsList mode="all" />}

      {activeTab === 'home' && homeView === 'main' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.screenTitle}>{gym.name}</Text>

          {checkInsLoadError ? (
            <View style={styles.checkInsErrorBanner}>
              <Text style={styles.checkInsErrorText}>
                {checkInsLoadError} Pull down to refresh.
              </Text>
            </View>
          ) : null}

          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statCardMinimal}
              activeOpacity={0.85}
              onPress={() => setHomeView('checkinsToday')}
            >
              <Text style={styles.statLabelMinimal}>Check-ins today</Text>
              <Text style={styles.statValueMinimal}>{stats.totalToday}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.statCardMinimal}
              activeOpacity={0.85}
              onPress={() => setHomeView('checkinsAll')}
            >
              <Text style={styles.statLabelMinimal}>All time Check-ins</Text>
              <Text style={styles.statValueMinimal}>{stats.totalAll}</Text>
            </TouchableOpacity>
          </View>

          {/* Pricing Info Card */}
          {gym.pricePerVisit && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Pricing</Text>
              <View style={styles.row}>
                <Text style={styles.rowLeft}>Price Per Visit:</Text>
                <Text style={styles.rowRight}>JOD {gym.pricePerVisit.toFixed(2)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLeft}>Membership Model:</Text>
                <Text style={styles.rowRight}>{gym.membershipModel === 'pay_per_visit' ? 'Pay-Per-Visit' : gym.membershipModel || 'N/A'}</Text>
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Monthly Earnings</Text>
            <View style={styles.row}>
              <Text style={styles.rowLeft}>Total Earnings:</Text>
              <Text style={styles.rowRight}>JOD {stats.monthlyEarnings?.toFixed(2) || '0.00'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLeft}>Total Check-ins:</Text>
              <Text style={styles.rowRight}>{stats.totalAll}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryCta}
            activeOpacity={0.9}
            onPress={() => setShowSupportModal(true)}
          >
            <Text style={styles.primaryCtaText}>Contact Support</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {activeTab === 'payments' && (
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        >
          <Text style={styles.screenTitle}>Payouts</Text>

          {payoutsQuery.isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#111827" />
              <Text style={styles.loadingText}>Loading payouts...</Text>
            </View>
          ) : payments.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No payouts yet</Text>
              <Text style={styles.emptyText}>
                Payouts will appear here once check-ins are processed.
              </Text>
            </View>
          ) : (
            <>
              {/* Pending Payouts */}
              <Text style={styles.sectionLabel}>Pending</Text>
              {pendingPayouts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No pending payouts</Text>
                </View>
              ) : (
                pendingPayouts.map((payout: any) => {
                  const monthDate = new Date(payout.month + '-01');
                  const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

                  return (
                    <View key={payout.id} style={styles.payoutCard}>
                      <View style={styles.payoutHeaderRow}>
                        <Text style={styles.payoutMonth}>{monthName}</Text>
                        <View style={styles.payoutStatusBadge}>
                          <Text style={styles.payoutStatusText}>Pending</Text>
                        </View>
                      </View>

                      <View style={styles.payoutDetailsRow}>
                        <Text style={styles.payoutLabel}>Check-ins:</Text>
                        <Text style={styles.payoutValue}>{payout.totalCheckins}</Text>
                      </View>

                      {payout.payPerVisitRate && (
                        <View style={styles.payoutDetailsRow}>
                          <Text style={styles.payoutLabel}>Rate per visit:</Text>
                          <Text style={styles.payoutValue}>{payout.payPerVisitRate.toFixed(2)} JOD</Text>
                        </View>
                      )}

                      <View style={styles.payoutDetailsRow}>
                        <Text style={styles.payoutLabel}>Total Amount:</Text>
                        <Text style={styles.payoutTotalAmount}>JOD {payout.amount.toFixed(2)}</Text>
                      </View>
                    </View>
                  );
                })
              )}

              {/* Paid Payouts (most recent) */}
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Paid</Text>
              {latestPaidPayout ? (
                (() => {
                  const payout = latestPaidPayout;
                  const monthDate = new Date(payout.month + '-01');
                  const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  const paidDate = payout.paidAt ? new Date(payout.paidAt) : null;

                  return (
                    <View key={payout.id} style={styles.payoutCard}>
                      <View style={styles.payoutHeaderRow}>
                        <Text style={styles.payoutMonth}>{monthName}</Text>
                        <View style={[styles.payoutStatusBadge, styles.payoutStatusBadgePaid]}>
                          <Text style={[styles.payoutStatusText, styles.payoutStatusTextPaid]}>Paid</Text>
                        </View>
                      </View>

                      <View style={styles.payoutDetailsRow}>
                        <Text style={styles.payoutLabel}>Check-ins:</Text>
                        <Text style={styles.payoutValue}>{payout.totalCheckins}</Text>
                      </View>

                      {payout.payPerVisitRate && (
                        <View style={styles.payoutDetailsRow}>
                          <Text style={styles.payoutLabel}>Rate per visit:</Text>
                          <Text style={styles.payoutValue}>{payout.payPerVisitRate.toFixed(2)} JOD</Text>
                        </View>
                      )}

                      <View style={styles.payoutDetailsRow}>
                        <Text style={styles.payoutLabel}>Total Amount:</Text>
                        <Text style={styles.payoutTotalAmount}>JOD {payout.amount.toFixed(2)}</Text>
                      </View>

                      {paidDate && (
                        <View style={styles.payoutDetailsRow}>
                          <Text style={styles.payoutLabel}>Paid on:</Text>
                          <Text style={styles.payoutValue}>
                            {paidDate.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No paid payouts yet</Text>
                </View>
              )}

              {/* Past Payouts (history) */}
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Past Payouts</Text>
              {pastPaidPayouts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No older payouts yet</Text>
                </View>
              ) : (
                pastPaidPayouts.map((payout: any) => {
                  const monthDate = new Date(payout.month + '-01');
                  const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

                  return (
                    <View key={payout.id} style={styles.payoutCard}>
                      <View style={styles.payoutHeaderRow}>
                        <Text style={styles.payoutMonth}>{monthName}</Text>
                        <View style={[styles.payoutStatusBadge, styles.payoutStatusBadgePaid]}>
                          <Text style={[styles.payoutStatusText, styles.payoutStatusTextPaid]}>Paid</Text>
                        </View>
                      </View>

                      <View style={styles.payoutDetailsRow}>
                        <Text style={styles.payoutLabel}>Total Amount:</Text>
                        <Text style={styles.payoutTotalAmount}>JOD {payout.amount.toFixed(2)}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}
        </ScrollView>
      )}

      {activeTab === 'profile' && (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.screenTitle}>Profile</Text>

          <View style={styles.profileCard}>
            <Image
              source={{
                uri:
                  typeof gym.imageUrl === 'string' && !gym.imageUrl.startsWith('blob:')
                    ? gym.imageUrl
                    : 'https://placehold.co/80x80/png?text=Gym',
              }}
              style={styles.profileLogo}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{gym.name}</Text>
              <Text style={styles.profileSub}>{ownerEmail || '—'}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.listCard}>
        <TouchableOpacity 
          style={[styles.navRow, { borderBottomWidth: 0 }]} 
          activeOpacity={0.85} 
          onPress={() => router.push('/notifications' as any)}
        >
          <View>
            <Text style={styles.navTitle}>Notifications</Text>
            <Text style={styles.navSub}>Push • SMS</Text>
          </View>
          <ChevronRight size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

          <TouchableOpacity
            style={styles.logoutButton}
            activeOpacity={0.9}
            onPress={async () => {
              await AsyncStorage.multiRemove(['gymOwnerSessionToken', 'gymOwnerGymId']);
              router.replace('/gym-login' as any);
            }}
          >
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <BottomTabs />

      {/* Support contact modal */}
      <Modal
        visible={showSupportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSupportModal(false)}
      >
        <View style={styles.supportOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setShowSupportModal(false)}
          />
          <View style={styles.supportSheet}>
            <Text style={styles.supportTitle}>Contact Support</Text>
            <Text style={styles.supportSubtitle}>
              Choose how you’d like to reach XPASS support.
            </Text>

            <TouchableOpacity
              style={styles.supportButtonWhatsapp}
              activeOpacity={0.9}
              onPress={async () => {
                const url = 'https://wa.me/962790449173';
                try {
                  await Linking.openURL(url);
                } catch (err) {
                  Alert.alert('Error', 'Unable to open WhatsApp.');
                }
                setShowSupportModal(false);
              }}
            >
              <Text style={styles.supportButtonText}>WhatsApp</Text>
              <Text style={styles.supportButtonSub}>Chat with support on WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.supportButtonCall}
              activeOpacity={0.9}
              onPress={async () => {
                const url = 'tel:+962790449173';
                try {
                  await Linking.openURL(url);
                } catch (err) {
                  Alert.alert('Error', 'Unable to start a phone call.');
                }
                setShowSupportModal(false);
              }}
            >
              <Text style={styles.supportButtonText}>Call</Text>
              <Text style={styles.supportButtonSub}>Call +962 7 9044 9173</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.supportCancelButton}
              activeOpacity={0.85}
              onPress={() => setShowSupportModal(false)}
            >
              <Text style={styles.supportCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: '#FFFFFF',
  },
  errorText: { fontSize: 18, color: '#EF4444', fontWeight: '600' as const, marginBottom: 8 },
  errorSubtext: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  checkInsErrorBanner: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  checkInsErrorText: { fontSize: 13, color: '#B91C1C', fontWeight: '600' as const },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6B7280' },
  retryButton: {
    backgroundColor: '#E31E24',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' as const },
  logoutButtonSmall: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 110 },

  topBar: {
    height: 64,
    paddingHorizontal: 20,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  brandRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  brandLogo: { width: 40, height: 40 },
  brandText: { fontSize: 18, fontWeight: '800' as const, color: '#111827', letterSpacing: 0.4 },
  topBarRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  profilePill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  screenTitle: { fontSize: 20, fontWeight: '700' as const, color: '#111827', marginBottom: 14 },
  statsRow: { flexDirection: 'row' as const, gap: 12, marginBottom: 16 },
  statCardMinimal: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 16,
  },
  statLabelMinimal: { fontSize: 12, color: '#6B7280', fontWeight: '600' as const },
  statValueMinimal: { marginTop: 10, fontSize: 22, fontWeight: '800' as const, color: '#111827' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' as const, color: '#111827', marginBottom: 12 },
  muted: { fontSize: 13, color: '#6B7280', fontWeight: '500' as const, paddingVertical: 6 },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  rowLeft: { color: '#6B7280', fontSize: 13, fontWeight: '600' as const },
  rowRight: { color: '#111827', fontSize: 14, fontWeight: '800' as const },
  secondaryCta: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    paddingVertical: 14,
    alignItems: 'center' as const,
  },
  secondaryCtaText: { fontSize: 14, fontWeight: '700' as const, color: '#111827' },
  primaryCta: {
    backgroundColor: '#E31E24',
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center' as const,
    marginBottom: 8,
  },
  primaryCtaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' as const },

  pillHeader: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center' as const,
    marginBottom: 18,
  },
  pillHeaderText: { fontSize: 16, fontWeight: '700' as const, color: '#111827' },
  paymentRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  paymentLeft: { fontSize: 13, color: '#6B7280', fontWeight: '600' as const },
  paymentRight: { fontSize: 14, color: '#111827', fontWeight: '800' as const },

  profileCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 14,
    marginBottom: 18,
  },
  profileLogo: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#F3F4F6' },
  profileName: { fontSize: 16, fontWeight: '800' as const, color: '#111827' },
  profileSub: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '600' as const },

  sectionLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '700' as const, marginBottom: 10 },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    marginBottom: 18,
    overflow: 'hidden' as const,
  },
  navRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  navTitle: { fontSize: 14, fontWeight: '800' as const, color: '#111827' },
  navSub: { fontSize: 12, color: '#6B7280', marginTop: 2, fontWeight: '600' as const },

  logoutButton: {
    backgroundColor: '#111827',
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center' as const,
    marginTop: 6,
  },
  logoutText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' as const },

  supportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end' as const,
  },
  supportSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  supportTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#111827',
    marginBottom: 4,
  },
  supportSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  supportButtonWhatsapp: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#22C55E',
    marginTop: 4,
    marginBottom: 6,
  },
  supportButtonCall: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#111827',
    marginTop: 4,
  },
  supportButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  supportButtonSub: {
    fontSize: 12,
    color: '#E5E7EB',
    marginTop: 2,
  },
  supportCancelButton: {
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center' as const,
    backgroundColor: '#F3F4F6',
  },
  supportCancelText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#374151',
  },

  bottomTabs: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  bottomTabItem: { flex: 1, alignItems: 'center' as const, gap: 6 },
  bottomTabIconWrap: {
    width: 46,
    height: 34,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'transparent',
  },
  bottomTabIconWrapActive: { backgroundColor: '#111827' },
  bottomTabLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '700' as const },
  bottomTabLabelActive: { color: '#111827' },

  sectionHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
  },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center' as const, justifyContent: 'center' as const },
  list: { gap: 12 },
  checkinCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 14,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#F3F4F6' },
  avatarPlaceholder: { backgroundColor: '#E5E7EB' },
  checkinInfo: { flex: 1 },
  checkinName: { fontSize: 15, fontWeight: '800' as const, color: '#111827' },
  checkinSub: { marginTop: 2, fontSize: 12, fontWeight: '600' as const, color: '#6B7280' },
  checkinTime: { marginTop: 2, fontSize: 11, fontWeight: '600' as const, color: '#9CA3AF' },

  emptyState: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 40,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' as const, color: '#111827', marginBottom: 8 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center' as const },

  payoutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 16,
    marginBottom: 12,
  },
  payoutHeaderRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  payoutMonth: { fontSize: 16, fontWeight: '700' as const, color: '#111827' },
  payoutStatusBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  payoutStatusBadgePaid: {
    backgroundColor: '#D1FAE5',
  },
  payoutStatusText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#92400E',
  },
  payoutStatusTextPaid: {
    color: '#065F46',
  },
  payoutDetailsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  payoutLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600' as const },
  payoutValue: { fontSize: 13, color: '#111827', fontWeight: '700' as const },
  payoutTotalAmount: { fontSize: 16, color: '#111827', fontWeight: '800' as const },
});

