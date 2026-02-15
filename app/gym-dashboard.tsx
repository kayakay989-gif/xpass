import React, { useMemo, useState } from 'react';
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
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '@/lib/trpc';
import { ChevronRight, CreditCard, Filter, Home, User as UserIcon } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function GymDashboardScreen() {
  const router = useRouter();
  const { gymId } = useLocalSearchParams<{ gymId: string }>();

  const [activeTab, setActiveTab] = useState<'home' | 'payments' | 'profile'>('home');
  const [homeView, setHomeView] = useState<'main' | 'checkinsToday' | 'checkinsAll'>('main');
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [token, storedGymId] = await Promise.all([
          AsyncStorage.getItem('gymOwnerSessionToken'),
          AsyncStorage.getItem('gymOwnerGymId'),
        ]);
        if (!token || !storedGymId || (gymId && storedGymId !== gymId)) {
          router.replace('/gym-login' as any);
          return;
        }
      } finally {
        setSessionChecked(true);
      }
    })();
  }, [gymId, router]);

  const gymQuery = trpc.gyms.getById.useQuery({ id: gymId || '1' }, { enabled: !!gymId });
  const checkInsQuery = trpc.gyms.getCheckIns.useQuery(
    { gymId: gymId || '1' },
    { enabled: !!gymId, refetchInterval: 10000 }
  );
  const paymentsQuery = trpc.gyms.getPayments.useQuery({ gymId: gymId || '1' }, { enabled: !!gymId });
  const profileQuery = trpc.gymOwners.getProfile.useQuery({ gymId: gymId || '1' }, { enabled: !!gymId });

  const gym = gymQuery.data;
  const checkIns = useMemo(() => checkInsQuery.data || [], [checkInsQuery.data]);
  const payments = useMemo(() => paymentsQuery.data || [], [paymentsQuery.data]);

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
    return {
      totalToday: todayCheckIns.length,
      totalAll: checkIns.length,
    };
  }, [checkIns.length, todayCheckIns.length]);

  const onRefresh = () => {
    checkInsQuery.refetch();
    paymentsQuery.refetch();
    gymQuery.refetch();
    profileQuery.refetch();
  };

  if (!sessionChecked || gymQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  if (!gym) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Gym not found</Text>
      </View>
    );
  }

  const ownerEmail = profileQuery.data?.owner?.email;

  const TopBar = () => (
    <View style={styles.topBar}>
      <View style={styles.brandRow}>
        <Image
          source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t5u7px23rxplxx8gfxveq' }}
          style={styles.brandLogo}
          resizeMode="contain"
        />
        <Text style={styles.brandText}>XPASS</Text>
      </View>

      <View style={styles.topBarRight}>
        <TouchableOpacity style={styles.langPill} activeOpacity={0.8}>
          <Text style={styles.langText}>EN</Text>
        </TouchableOpacity>
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
        refreshControl={<RefreshControl refreshing={checkInsQuery.isRefetching} onRefresh={onRefresh} />}
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
            const avatarUrl = `https://i.pravatar.cc/100?u=${encodeURIComponent(ci.userId)}`;
            return (
              <View key={ci.id} style={styles.checkinCard}>
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
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
      <Stack.Screen options={{ headerShown: false }} />

      <TopBar />

      {activeTab === 'home' && homeView === 'checkinsToday' && <CheckInsList mode="today" />}
      {activeTab === 'home' && homeView === 'checkinsAll' && <CheckInsList mode="all" />}

      {activeTab === 'home' && homeView === 'main' && (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={checkInsQuery.isRefetching} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.screenTitle}>{gym.name}</Text>

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

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Monthly Payouts</Text>

            {payments.length === 0 ? (
              <Text style={styles.muted}>No payouts available yet</Text>
            ) : (
              payments.slice(0, 2).map((p: any, idx: number) => (
                <View key={`${p.id || idx}`} style={styles.row}>
                  <Text style={styles.rowLeft}>{p.label || p.month || '—'}</Text>
                  <Text style={styles.rowRight}>JOD {p.amount || 0}</Text>
                </View>
              ))
            )}

            <TouchableOpacity style={styles.secondaryCta} activeOpacity={0.9} onPress={() => setActiveTab('payments')}>
              <Text style={styles.secondaryCtaText}>View All</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.primaryCta}
            activeOpacity={0.9}
            onPress={() => Alert.alert('Support', 'Contact support flow goes here.')}
          >
            <Text style={styles.primaryCtaText}>Contact Support</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {activeTab === 'payments' && (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.pillHeader}>
            <Text style={styles.pillHeaderText}>Upcoming Payments</Text>
          </View>

          {payments.length === 0 ? (
            <Text style={styles.muted}>No upcoming payments</Text>
          ) : (
            payments.map((p: any, idx: number) => (
              <View key={`${p.id || idx}`} style={styles.paymentRow}>
                <Text style={styles.paymentLeft}>{p.label || p.month || '—'}</Text>
                <Text style={styles.paymentRight}>JOD {p.amount || 0}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {activeTab === 'profile' && (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.screenTitle}>Profile</Text>

          <View style={styles.profileCard}>
            <Image source={{ uri: gym.imageUrl || 'https://placehold.co/80x80/png?text=Gym' }} style={styles.profileLogo} />
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{gym.name}</Text>
              <Text style={styles.profileSub}>{ownerEmail || '—'}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Account</Text>
          <View style={styles.listCard}>
            <TouchableOpacity style={styles.navRow} activeOpacity={0.85} onPress={() => Alert.alert('Security', 'Coming soon')}>
              <View>
                <Text style={styles.navTitle}>Security</Text>
                <Text style={styles.navSub}>Phone OTP</Text>
              </View>
              <ChevronRight size={18} color="#9CA3AF" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navRow, { borderBottomWidth: 0 }]} activeOpacity={0.85} onPress={() => Alert.alert('Notifications', 'Coming soon')}>
              <View>
                <Text style={styles.navTitle}>Notifications</Text>
                <Text style={styles.navSub}>Push • SMS</Text>
              </View>
              <ChevronRight size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>XPASS</Text>
          <View style={styles.listCard}>
            <TouchableOpacity style={[styles.navRow, { borderBottomWidth: 0 }]} activeOpacity={0.85} onPress={() => Alert.alert('Language', 'Coming soon')}>
              <View>
                <Text style={styles.navTitle}>Language</Text>
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
  errorText: { fontSize: 18, color: '#EF4444', fontWeight: '600' as const },
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
  brandLogo: { width: 28, height: 28 },
  brandText: { fontSize: 18, fontWeight: '800' as const, color: '#111827', letterSpacing: 0.4 },
  topBarRight: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  langPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  langText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' as const },
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
  checkinInfo: { flex: 1 },
  checkinName: { fontSize: 15, fontWeight: '800' as const, color: '#111827' },
  checkinSub: { marginTop: 2, fontSize: 12, fontWeight: '600' as const, color: '#6B7280' },
  checkinTime: { marginTop: 2, fontSize: 11, fontWeight: '600' as const, color: '#9CA3AF' },
});

