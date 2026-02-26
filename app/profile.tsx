import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Lock, CreditCard, Bell, Gift, Globe, FileText, Shield, Edit, User as UserIcon, ChevronLeft, LogOut } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import Colors from '@/constants/colors';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, firebaseUser, isLoading, logout, isGuest } = useAuth();
  const { subscription } = useApp();

  const goBackOrHome = () => {
    const canGoBack = typeof router.canGoBack === 'function' ? router.canGoBack() : false;
    if (canGoBack) return router.back();
    return router.replace('/(tabs)/home');
  };

  const displayName =
    user?.name ||
    firebaseUser?.displayName ||
    firebaseUser?.email?.split('@')[0] ||
    'Guest';
  const primaryEmail = user?.email || firebaseUser?.email || 'Add your email';
  const primaryPhone = user?.phone || firebaseUser?.phoneNumber || 'Add phone number';
  const photoUrl = user?.photoUrl || firebaseUser?.photoURL || '';

  // If auth is still loading, don't treat it as logged out (prevents web from bouncing to login).
  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={{ marginTop: 10, color: Colors.textSecondary }}>Loading profile…</Text>
        </View>
      </>
    );
  }

  // If not logged in, show a prompt to log in or sign up
  // (Use firebaseUser as the source of truth for auth session.)
  if (!firebaseUser && !user) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={goBackOrHome} style={styles.backButton}>
                <ChevronLeft size={22} color={Colors.text} />
              </TouchableOpacity>
              <Image 
                source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t5u7px23rxplxx8gfxveq' }}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.greeting}>Welcome</Text>
              <View style={styles.iconsContainer}>
                <View style={styles.languageButton}>
                  <Text style={styles.languageText}>EN</Text>
                </View>
              </View>
            </View>
          </View>
          <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { alignItems: 'center', justifyContent: 'center', flexGrow: 1 }]}>
            <Text style={{ fontSize: 18, fontWeight: '600' as const, color: Colors.text, marginBottom: 12 }}>Please log in</Text>
            <Text style={{ fontSize: 14, color: Colors.textSecondary, marginBottom: 24, textAlign: 'center' }}>
              You need an account to view your profile and manage subscriptions.
            </Text>
            <TouchableOpacity onPress={() => router.push('/login')} style={{ backgroundColor: Colors.black, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 }}>
              <Text style={{ color: Colors.white, fontWeight: '700' as const }}>Login / Sign Up</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </>
    );
  }

  const getRemainingDays = () => {
    if (!subscription) return 0;
    const now = new Date();
    const end = new Date(subscription.endDate);
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e: any) {
      console.error('[Profile] Logout failed:', e);
      showAlert('Error', e?.message || 'Failed to log out.');
    } finally {
      router.replace('/splash');
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={goBackOrHome} style={styles.backButton}>
              <ChevronLeft size={22} color={Colors.text} />
            </TouchableOpacity>
            <Image 
              source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t5u7px23rxplxx8gfxveq' }}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.greeting}>Hello {displayName.split(' ')[0]}</Text>
            <View style={styles.iconsContainer}>
              <View style={styles.languageButton}>
                <Text style={styles.languageText}>EN</Text>
              </View>
              <View style={styles.profileButton}>
                <UserIcon size={16} color={Colors.white} />
              </View>
            </View>
          </View>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Profile</Text>
            {subscription && (
              <View style={styles.memberBadge}>
                <Text style={styles.memberText}>Member</Text>
              </View>
            )}
          </View>

          <View style={styles.profileCard}>
            <View style={styles.profileInfo}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <UserIcon size={22} color={Colors.textMuted} />
                </View>
              )}
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{displayName}</Text>
                <Text style={styles.userPhone}>{primaryPhone}</Text>
                <Text style={styles.userEmail}>{primaryEmail}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.editButton} onPress={() => router.push('/profile-edit')}>
              <Edit size={16} color={Colors.text} />
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Account</Text>

          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/security')}>
              <Lock size={20} color={Colors.text} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Security</Text>
                <Text style={styles.menuSubtitle}>Phone OTP</Text>
              </View>
              <ChevronRight size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/notifications')}>
              <Bell size={20} color={Colors.text} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Notifications</Text>
                <Text style={styles.menuSubtitle}>Push • SMS</Text>
              </View>
              <ChevronRight size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/refer-friend')}>
              <Gift size={20} color={Colors.text} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Refer a friend</Text>
                <Text style={styles.menuSubtitle}>Earn 10 JDS Credit</Text>
              </View>
              <ChevronRight size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>XPASS</Text>

          <View style={styles.menuCard}>
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => router.push('/my-subscription')}
            >
              <View style={styles.subscriptionIcon}>
                <Text style={styles.subscriptionIconText}>📋</Text>
              </View>
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>My Subscriptions</Text>
                {subscription ? (
                  <Text style={styles.menuSubtitle}>
                    Active: expires in {getRemainingDays()} days
                  </Text>
                ) : (
                  <Text style={styles.menuSubtitle}>No active subscription</Text>
                )}
              </View>
              <ChevronRight size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem}>
              <Globe size={20} color={Colors.text} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Language</Text>
              </View>
              <ChevronRight size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem}>
              <FileText size={20} color={Colors.text} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Terms & Conditions</Text>
              </View>
              <ChevronRight size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem}>
              <Shield size={20} color={Colors.text} />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Privacy Policy</Text>
              </View>
              <ChevronRight size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ height: 16 }} />

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <LogOut size={18} color={Colors.white} />
            <Text style={styles.logoutText}>{isGuest ? 'Exit guest' : 'Logout'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  logo: {
    width: 40,
    height: 40,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  iconsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  languageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  languageText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 20,
    marginBottom: 12,
  },
  memberBadge: {
    backgroundColor: Colors.black,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  memberText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  profileCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  userPhone: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  userEmail: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500' as const,
  },
  menuCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuContent: {
    flex: 1,
    marginLeft: 16,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  logoutButton: {
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 40,
  },
  logoutText: {
    color: Colors.white,
    fontWeight: '800' as const,
    fontSize: 14,
  },
  subscriptionIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscriptionIconText: {
    fontSize: 18,
  },
});
