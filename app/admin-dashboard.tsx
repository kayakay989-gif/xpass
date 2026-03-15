import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { firestoreUsers, firestoreSubscriptions, firestoreCheckIns, firestoreSpotlightImages } from '@/lib/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { app } from '@/lib/firebase';
import {
  Shield,
  Users,
  User as UserIcon,
  Building2,
  Calendar,
  DollarSign,
  Search,
  TrendingUp,
  Plus,
  X,
  MapPin,
  Image as ImageIcon,
  QrCode,
  Copy,
  CheckCircle,
  Download,
  Tag,
  Edit,
  Trash2,
  ArrowLeft,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GymCategory, SubscriptionTier } from '@/types';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import * as Clipboard from 'expo-clipboard';
import GymLocationPicker from '@/components/GymLocationPicker';
import { useAuth } from '@/contexts/AuthContext';
import { firestoreGyms, firestoreGymOwners } from '@/lib/firestore';
import { FIXED_CITIES } from '@/constants/cities';
import { trpc } from '@/lib/trpc';
import { TIER_COLORS as SHARED_TIER_COLORS } from '@/constants/tier-colors';
import DatePicker from '@/components/DatePicker';

type TabType = 'overview' | 'users' | 'gyms' | 'checkins' | 'payouts' | 'revenue';

// Use shared tier colors for consistency
const TIER_COLORS = {
  silver: SHARED_TIER_COLORS.silver.primary,
  gold: SHARED_TIER_COLORS.gold.primary,
  diamond: SHARED_TIER_COLORS.diamond.primary,
  elite: SHARED_TIER_COLORS.elite.primary,
  none: '#9CA3AF',
} as const;

// Coupons Management Component
function CouponsManagementSection({ onClose }: { onClose: () => void }) {
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any>(null);
  const [couponForm, setCouponForm] = useState({
    code: '',
    discountPercent: '',
    isActive: true,
    usageLimit: '',
    expiresAt: '',
  });
  const [page, setPage] = useState(0);
  const [allCoupons, setAllCoupons] = useState<any[]>([]);
  const pageSize = 20;

  // Lazy loading: only fetch when component is mounted (when coupons section is opened)
  const { data: couponsData, refetch: refetchCoupons, isLoading, isFetching } = trpc.coupons.getAll.useQuery(
    { limit: pageSize, offset: page * pageSize },
    { 
      enabled: true, // Always enabled since we're in the coupons section
      refetchOnWindowFocus: true,
      staleTime: 0,
    }
  );

  // Update coupons list when data changes
  useEffect(() => {
    console.log('[Coupons] Loading coupons page', page, 'data:', couponsData);
    if (couponsData?.coupons) {
      if (page === 0) {
        // First page - replace all coupons
        setAllCoupons(couponsData.coupons);
      } else {
        // Subsequent pages - append to existing coupons (avoid duplicates)
        setAllCoupons((prev) => {
          const existingIds = new Set(prev.map(c => c.id));
          const newCoupons = couponsData.coupons.filter(c => !existingIds.has(c.id));
          return [...prev, ...newCoupons];
        });
      }
    }
  }, [couponsData, page]);

  const coupons = allCoupons;
  const hasMore = couponsData?.hasMore || false;
  const createMutation = trpc.coupons.create.useMutation({
    onSuccess: () => {
      setPage(0); // Reset to first page
      setAllCoupons([]); // Clear existing coupons
      refetchCoupons();
      setShowCouponModal(false);
      resetCouponForm();
      Alert.alert('Success', 'Coupon created successfully');
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    },
  });
  const updateMutation = trpc.coupons.update.useMutation({
    onSuccess: () => {
      setPage(0); // Reset to first page
      setAllCoupons([]); // Clear existing coupons
      refetchCoupons();
      setShowCouponModal(false);
      setEditingCoupon(null);
      resetCouponForm();
      Alert.alert('Success', 'Coupon updated successfully');
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    },
  });
  const deleteMutation = trpc.coupons.delete.useMutation({
    onSuccess: () => {
      console.log('[Coupons] Delete successful, refreshing list...');
      setPage(0); // Reset to first page
      setAllCoupons([]); // Clear existing coupons
      refetchCoupons();
      Alert.alert('Success', 'Coupon deleted successfully');
    },
    onError: (error) => {
      console.error('[Coupons] Delete error:', error);
      Alert.alert('Error', error.message || 'Failed to delete coupon. Please try again.');
    },
  });

  const resetCouponForm = () => {
    setCouponForm({
      code: '',
      discountPercent: '',
      isActive: true,
      usageLimit: '',
      expiresAt: '',
    });
    setEditingCoupon(null);
  };

  const handleSaveCoupon = () => {
    const discountPercent = parseFloat(couponForm.discountPercent);
    if (isNaN(discountPercent) || discountPercent < 1 || discountPercent > 100) {
      Alert.alert('Error', 'Discount must be between 1 and 100');
      return;
    }

    const usageLimit = couponForm.usageLimit ? parseInt(couponForm.usageLimit) : null;
    if (couponForm.usageLimit && (isNaN(usageLimit!) || usageLimit! < 1)) {
      Alert.alert('Error', 'Usage limit must be a positive number');
      return;
    }

    const expiresAt = couponForm.expiresAt ? new Date(couponForm.expiresAt) : null;
    if (expiresAt && expiresAt < new Date()) {
      Alert.alert('Error', 'Expiration date must be in the future');
      return;
    }

    if (editingCoupon) {
      updateMutation.mutate({
        couponId: editingCoupon.id,
        code: couponForm.code,
        discountPercent,
        isActive: couponForm.isActive,
        usageLimit,
        expiresAt,
      });
    } else {
      createMutation.mutate({
        code: couponForm.code,
        discountPercent,
        isActive: couponForm.isActive,
        usageLimit,
        expiresAt,
      });
    }
  };

  const handleEditCoupon = (coupon: any) => {
    setEditingCoupon(coupon);
    setCouponForm({
      code: coupon.code,
      discountPercent: coupon.discountPercent.toString(),
      isActive: coupon.isActive,
      usageLimit: coupon.usageLimit?.toString() || '',
      expiresAt: coupon.expiresAt
        ? new Date(coupon.expiresAt).toISOString().split('T')[0]
        : '',
    });
    setShowCouponModal(true);
  };

  const handleDeleteCoupon = (couponId: string) => {
    if (!couponId) {
      Alert.alert('Error', 'Invalid coupon ID');
      return;
    }
    
    Alert.alert(
      'Delete Coupon',
      'Are you sure you want to delete this coupon? This action cannot be undone.',
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => console.log('[Coupons] Delete cancelled')
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            console.log('[Coupons] Deleting coupon:', couponId);
            deleteMutation.mutate({ couponId });
          },
        },
      ],
      { cancelable: true }
    );
  };

  const toggleCouponActive = (coupon: any) => {
    updateMutation.mutate({
      couponId: coupon.id,
      isActive: !coupon.isActive,
    });
  };

  return (
    <View style={styles.content}>
      <View style={styles.pageHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>Coupons</Text>
        </View>
        <TouchableOpacity
          style={styles.addButtonIcon}
          onPress={() => {
            resetCouponForm();
            setShowCouponModal(true);
          }}
        >
          <Plus size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {isLoading && page === 0 ? (
        <ActivityIndicator size="large" color="#111827" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView 
          style={styles.couponsList} 
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            const paddingToBottom = 20;
            const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
            
            if (isCloseToBottom && hasMore && !isFetching) {
              setPage((prev) => prev + 1);
            }
          }}
          scrollEventThrottle={400}
        >
          {coupons && coupons.length > 0 ? (
            coupons.map((coupon: any) => {
              const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
              const isLimitReached =
                coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit;

              return (
                <View key={coupon.id} style={styles.couponCard}>
                  <View style={styles.couponHeader}>
                    <View style={styles.couponCodeRow}>
                      <Text style={styles.couponCode}>{coupon.code}</Text>
                      <TouchableOpacity
                        style={[
                          styles.activeToggle,
                          coupon.isActive && styles.activeToggleOn,
                        ]}
                        onPress={() => toggleCouponActive(coupon)}
                      >
                        <Text
                          style={[
                            styles.activeToggleText,
                            coupon.isActive && styles.activeToggleTextOn,
                          ]}
                        >
                          {coupon.isActive ? 'Active' : 'Inactive'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.couponActions}>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => handleEditCoupon(coupon)}
                      >
                        <Edit size={18} color="#6B7280" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          if (coupon?.id) {
                            handleDeleteCoupon(coupon.id);
                          }
                        }}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Trash2 size={18} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.couponDetails}>
                    <View style={styles.couponDetailRow}>
                      <Text style={styles.couponDetailLabel}>Discount:</Text>
                      <Text style={styles.couponDetailValue}>
                        {coupon.discountPercent}%
                      </Text>
                    </View>
                    <View style={styles.couponDetailRow}>
                      <Text style={styles.couponDetailLabel}>Used:</Text>
                      <Text style={styles.couponDetailValue}>
                        {coupon.usedCount}
                        {coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : ' / ∞'}
                      </Text>
                    </View>
                    {coupon.expiresAt && (
                      <View style={styles.couponDetailRow}>
                        <Text style={styles.couponDetailLabel}>Expires:</Text>
                        <Text
                          style={[
                            styles.couponDetailValue,
                            isExpired && styles.expiredText,
                          ]}
                        >
                          {new Date(coupon.expiresAt).toLocaleDateString()}
                          {isExpired && ' (Expired)'}
                        </Text>
                      </View>
                    )}
                    {(isExpired || isLimitReached) && (
                      <View style={styles.warningBadge}>
                        <Text style={styles.warningText}>
                          {isExpired
                            ? 'Expired'
                            : isLimitReached
                            ? 'Limit Reached'
                            : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Tag size={48} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No coupons</Text>
              <Text style={styles.emptyText}>Create your first coupon to get started.</Text>
            </View>
          )}
          {isFetching && page > 0 && (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#111827" />
            </View>
          )}
          {!hasMore && coupons.length > 0 && (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#6B7280', fontSize: 14 }}>No more coupons to load</Text>
            </View>
          )}
          {isFetching && page > 0 && (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#111827" />
            </View>
          )}
          {!hasMore && coupons.length > 0 && (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#6B7280', fontSize: 14 }}>No more coupons to load</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Coupon Modal */}
      <Modal
        visible={showCouponModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowCouponModal(false);
          resetCouponForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCoupon ? 'Edit Coupon' : 'Create Coupon'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowCouponModal(false);
                  resetCouponForm();
                }}
              >
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Coupon Code *</Text>
              <TextInput
                style={styles.input}
                value={couponForm.code}
                onChangeText={(text) =>
                  setCouponForm({ ...couponForm, code: text.toUpperCase() })
                }
                placeholder="e.g., WELCOME10"
                placeholderTextColor="#9CA3AF"
                editable={!editingCoupon}
              />

              <Text style={styles.label}>Discount % (1-100) *</Text>
              <TextInput
                style={styles.input}
                value={couponForm.discountPercent}
                onChangeText={(text) =>
                  setCouponForm({ ...couponForm, discountPercent: text })
                }
                placeholder="e.g., 10"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />

              <Text style={styles.label}>Usage Limit (optional)</Text>
              <TextInput
                style={styles.input}
                value={couponForm.usageLimit}
                onChangeText={(text) =>
                  setCouponForm({ ...couponForm, usageLimit: text })
                }
                placeholder="Leave empty for unlimited"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />

              <Text style={styles.label}>Expiration Date (optional)</Text>
              <TextInput
                style={styles.input}
                value={couponForm.expiresAt}
                onChangeText={(text) =>
                  setCouponForm({ ...couponForm, expiresAt: text })
                }
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
              />

              <View style={styles.checkboxRow}>
                <TouchableOpacity
                  style={styles.checkbox}
                  onPress={() =>
                    setCouponForm({ ...couponForm, isActive: !couponForm.isActive })
                  }
                >
                  {couponForm.isActive && <CheckCircle size={20} color="#111827" />}
                </TouchableOpacity>
                <Text style={styles.checkboxLabel}>Active</Text>
              </View>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveCoupon}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingCoupon ? 'Update Coupon' : 'Create Coupon'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { isLoading: isAuthLoading, isCheckingAdmin, isAdmin, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showCouponsView, setShowCouponsView] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showTodayCheckIns, setShowTodayCheckIns] = useState<boolean>(false);
  const [selectedCheckIn, setSelectedCheckIn] = useState<any | null>(null);
  const [selectedSubscriber, setSelectedSubscriber] = useState<any | null>(null);
  const [showAddGymModal, setShowAddGymModal] = useState<boolean>(false);
  const [spotlightImages, setSpotlightImages] = useState<any[]>([]);
  const [isLoadingSpotlight, setIsLoadingSpotlight] = useState(false);
  const [spotlightOrderDirty, setSpotlightOrderDirty] = useState(false);
  const [isSavingSpotlightOrder, setIsSavingSpotlightOrder] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [editingGymId, setEditingGymId] = useState<string | null>(null);
  const [editingGymOwnerId, setEditingGymOwnerId] = useState<string | null>(null);
  const [editingGymCredentials, setEditingGymCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [gymCreationStep, setGymCreationStep] = useState<'details' | 'pricing' | 'review'>('details');
  const [newGym, setNewGym] = useState({
    name: '',
    address: '',
    city: '',
    latitude: '',
    longitude: '',
    category: 'standard' as GymCategory,
    amenities: '',
    facilities: [] as string[],
    hours: '6:00 AM - 10:00 PM',
    timings: {
      men: { from: '', to: '' },
      women: { from: '', to: '' },
      mixed: { from: '', to: '' },
    },
    menOnly: false,
    womenOnly: false,
    openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as string[],
    imageUrl: '',
    allowedTiers: [] as SubscriptionTier[],
    email: '',
    ownerName: '',
    membershipModel: 'pay_per_visit' as 'pay_per_visit',
    pricePerVisit: '',
    gymImages: [] as string[],
    ownerPhone: '',
  });
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);
  const [isCityModalVisible, setIsCityModalVisible] = useState(false);
  const [tempLocation, setTempLocation] = useState({
    latitude: 31.963158,
    longitude: 35.930359,
  });
  const [isCreatingGym, setIsCreatingGym] = useState(false);
  const [isUploadingGymImages, setIsUploadingGymImages] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdGymData, setCreatedGymData] = useState<{
    gymId: string;
    gymName: string;
    username: string;
    password: string;
  } | null>(null);

  // Load data once and keep it warm to avoid reloading on every tab switch
  const commonQueryOptions = {
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000, // 1 minute
  } as const;

  // Use direct Firestore queries instead of tRPC - no backend server needed
  const [gyms, setGyms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userStatusFilter, setUserStatusFilter] = useState<'active' | 'inactive'>('active');
  const [checkInsStartDateFilter, setCheckInsStartDateFilter] = useState<Date | null>(null);
  const [checkInsEndDateFilter, setCheckInsEndDateFilter] = useState<Date | null>(null);

  // Revenue analytics filters
  const [revenueRange, setRevenueRange] = useState<
    'THIS_MONTH' | 'LAST_MONTH' | 'LAST_3_MONTHS' | 'LAST_12_MONTHS' | 'ALL_TIME' | 'CUSTOM'
  >('THIS_MONTH');
  const [revenueStartDate, setRevenueStartDate] = useState<Date | null>(null);
  const [revenueEndDate, setRevenueEndDate] = useState<Date | null>(null);

  // Admin payouts (pending / paid)
  const payoutsQuery = trpc.admin.payouts.getAll.useQuery(undefined, {
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const markPaidMutation = trpc.admin.payouts.markPaid.useMutation({
    onSuccess: () => {
      payoutsQuery.refetch();
    },
  });

  const pendingPayouts = payoutsQuery.data?.pending || [];
  const paidPayouts = payoutsQuery.data?.paid || [];

  // Revenue analytics derived from already-loaded subscriptions data
  const revenueMetrics = useMemo(() => {
    if (!subscriptions || subscriptions.length === 0) {
      return {
        thisMonthRevenue: 0,
        lastMonthRevenue: 0,
        allTimeRevenue: 0,
        activeSubscribers: 0,
        byMonth: [] as { monthKey: string; label: string; amount: number }[],
        payments: [] as any[],
      };
    }

    const now = new Date();
    const startOfMonth = (year: number, monthIndex: number) =>
      new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const endOfMonth = (year: number, monthIndex: number) =>
      new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

    const toDate = (val: any): Date | null => {
      if (!val) return null;
      if (val instanceof Date) return val;
      if (val.toDate) return val.toDate();
      if (typeof val === 'string') return new Date(val);
      if (val._seconds) return new Date(val._seconds * 1000);
      return null;
    };

    const enriched = subscriptions.map((sub: any) => {
      const createdAt = toDate(sub.createdAt) || toDate(sub.startDate);
      const endDate = toDate(sub.endDate);
      return {
        ...sub,
        createdAt,
        endDate,
      };
    });

    // Active subscribers: use same logic as stats (isActive flag + not expired)
    const activeSubscribers = enriched.filter((sub: any) => {
      if (!sub.isActive) return false;
      if (!sub.endDate) return true;
      return sub.endDate.getTime() >= now.getTime();
    }).length;

    const isPaid = (sub: any) => {
      const paymentStatus = (sub.paymentStatus || '').toLowerCase();
      const status = (sub.status || '').toLowerCase();
      const amount = sub.totalPrice || 0;
      return amount > 0 && (paymentStatus === 'paid' || status === 'active');
    };

    const paidSubs = enriched.filter((sub: any) => sub.createdAt && isPaid(sub));

    const sameMonth = (d: Date, base: Date) =>
      d.getFullYear() === base.getFullYear() && d.getMonth() === base.getMonth();

    const thisMonthRevenue = paidSubs
      .filter((s: any) => sameMonth(s.createdAt, now))
      .reduce((sum: number, s: any) => sum + (s.totalPrice || 0), 0);

    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthRevenue = paidSubs
      .filter((s: any) => sameMonth(s.createdAt, lastMonthDate))
      .reduce((sum: number, s: any) => sum + (s.totalPrice || 0), 0);

    const allTimeRevenue = paidSubs.reduce(
      (sum: number, s: any) => sum + (s.totalPrice || 0),
      0
    );

    // Range filtering for trend + details
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;
    const year = now.getFullYear();
    const month = now.getMonth();

    switch (revenueRange) {
      case 'THIS_MONTH':
        rangeStart = startOfMonth(year, month);
        rangeEnd = endOfMonth(year, month);
        break;
      case 'LAST_MONTH': {
        const last = new Date(year, month - 1, 1);
        rangeStart = startOfMonth(last.getFullYear(), last.getMonth());
        rangeEnd = endOfMonth(last.getFullYear(), last.getMonth());
        break;
      }
      case 'LAST_3_MONTHS': {
        const start = new Date(year, month - 2, 1);
        rangeStart = startOfMonth(start.getFullYear(), start.getMonth());
        rangeEnd = endOfMonth(year, month);
        break;
      }
      case 'LAST_12_MONTHS': {
        const start = new Date(year, month - 11, 1);
        rangeStart = startOfMonth(start.getFullYear(), start.getMonth());
        rangeEnd = endOfMonth(year, month);
        break;
      }
      case 'ALL_TIME':
        rangeStart = null;
        rangeEnd = null;
        break;
      case 'CUSTOM':
        if (revenueStartDate) {
          const s = new Date(revenueStartDate);
          s.setHours(0, 0, 0, 0);
          rangeStart = s;
        }
        if (revenueEndDate) {
          const e = new Date(revenueEndDate);
          e.setHours(23, 59, 59, 999);
          rangeEnd = e;
        }
        break;
      default:
        break;
    }

    const inRange = paidSubs.filter((sub: any) => {
      if (!sub.createdAt) return false;
      if (rangeStart && sub.createdAt < rangeStart) return false;
      if (rangeEnd && sub.createdAt > rangeEnd) return false;
      return true;
    });

    // Group by month for chart
    const monthBuckets: Record<string, number> = {};
    inRange.forEach((sub: any) => {
      const d: Date = sub.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthBuckets[key] = (monthBuckets[key] || 0) + (sub.totalPrice || 0);
    });

    const byMonth = Object.entries(monthBuckets)
      .map(([monthKey, amount]) => {
        const [y, m] = monthKey.split('-').map((v) => parseInt(v, 10));
        const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        });
        return { monthKey, label, amount };
      })
      .sort((a, b) => (a.monthKey < b.monthKey ? -1 : 1));

    // Details table payments
    const payments = inRange
      .slice()
      .sort(
        (a: any, b: any) =>
          (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime()
      )
      .map((sub: any) => ({
        id: sub.id,
        userId: sub.userId,
        tier: sub.tier,
        duration: sub.duration,
        amount: sub.totalPrice || 0,
        currency: 'JOD',
        createdAt: sub.createdAt ? sub.createdAt.toISOString() : null,
      }));

    return {
      thisMonthRevenue,
      lastMonthRevenue,
      allTimeRevenue,
      activeSubscribers,
      byMonth,
      payments,
    };
  }, [subscriptions, revenueRange, revenueStartDate, revenueEndDate]);

  const formatPayoutMonth = (monthKey: string): string => {
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) return monthKey;
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  const formatPayoutAmount = (amount: number): string => {
    return `JOD ${amount.toFixed(2)}`;
  };

  const handleMarkPayoutPaid = (payoutId: string) => {
    const confirmMessage = 'Confirm this payout has been paid?';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(confirmMessage)) return;
      markPaidMutation.mutate({ payoutId });
    } else {
      Alert.alert('Mark as paid', confirmMessage, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: () => markPaidMutation.mutate({ payoutId }),
        },
      ]);
    }
  };

  // Load data from Firestore directly
  const loadData = async () => {
    try {
      setIsLoadingData(true);
      
      // Load all data in parallel
      const [gymsData, usersData, checkInsData, subscriptionsData] = await Promise.all([
        firestoreGyms.getAll(),
        firestoreUsers.getAll(),
        firestoreCheckIns.getAll(),
        firestoreSubscriptions.getAll(),
      ]);

      setGyms(gymsData);
      
      // Enrich users with subscription data
      const usersWithSubs = usersData.map((user: any) => {
        const subscription = subscriptionsData.find((sub: any) => sub.userId === user.id && sub.isActive);
        return {
          ...user,
          subscription,
        };
      });
      setUsers(usersWithSubs);
      
      setCheckIns(checkInsData);
      setSubscriptions(subscriptionsData);

      // Calculate stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCheckIns = checkInsData.filter((ci: any) => {
        const ciDate = new Date(ci.timestamp);
        ciDate.setHours(0, 0, 0, 0);
        return ciDate.getTime() === today.getTime();
      });

      const activeSubs = subscriptionsData.filter((sub: any) => sub.isActive);

      // Calculate revenue (sum of all subscription total prices)
      const totalRevenue = subscriptionsData.reduce((sum: number, sub: any) => sum + (sub.totalPrice || 0), 0);

      setStats({
        totalUsers: usersData.length,
        totalGyms: gymsData.length,
        totalCheckIns: checkInsData.length,
        todayCheckIns: todayCheckIns.length,
        activeSubscriptions: activeSubs.length,
        totalRevenue,
      });
    } catch (error) {
      console.error('[Admin] Error loading data:', error);
      Alert.alert('Error', 'Failed to load data from Firestore');
    } finally {
      setIsLoadingData(false);
      setIsRefreshing(false);
    }
  };

  // Load spotlight images for admin panel and normalize positions in memory
  const loadSpotlightImages = useCallback(async () => {
    try {
      setIsLoadingSpotlight(true);
      const images = await firestoreSpotlightImages.getAll();

      // Ensure positions are normalized: 1..N, no duplicates or gaps
      const sorted = [...images].sort(
        (a: any, b: any) =>
          (typeof a.position === 'number' ? a.position : 0) -
          (typeof b.position === 'number' ? b.position : 0)
      );

      const resequenced = sorted.map((img: any, index: number) => ({
        ...img,
        position: index + 1,
      }));

      setSpotlightImages(resequenced);
      setSpotlightOrderDirty(false);
    } catch (error) {
      console.error('[Admin] Error loading spotlight images:', error);
      Alert.alert('Error', 'Failed to load spotlight images');
    } finally {
      setIsLoadingSpotlight(false);
    }
  }, []);

  // Load data on mount and when refreshing
  useEffect(() => {
    loadData();
    loadSpotlightImages();
  }, []);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
  };

  // Enrich check-ins with user and gym names
  const enrichedCheckIns = useMemo(() => {
    return checkIns.map((checkIn: any) => {
      const user = users.find((u: any) => u.id === checkIn.userId);
      const gym = gyms.find((g: any) => g.id === checkIn.gymId);
      
      return {
        ...checkIn,
        userName: user?.name || 'Unknown',
        userEmail: user?.email || '',
        gymName: gym?.name || 'Unknown Gym',
        tier: user?.subscription?.tier || 'none',
      };
    }).sort((a: any, b: any) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [checkIns, users, gyms]);

  // Add stats to gyms including payout calculations
  const gymsWithStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return gyms.map((gym: any) => {
      const gymCheckIns = checkIns.filter((ci: any) => ci.gymId === gym.id);
      const todayCheckIns = gymCheckIns.filter((ci: any) => {
        const ciDate = new Date(ci.timestamp);
        ciDate.setHours(0, 0, 0, 0);
        return ciDate.getTime() === today.getTime();
      });
      
      // Calculate total payout: sum of payoutAmount from all check-ins
      const totalPayout = gymCheckIns.reduce((sum: number, ci: any) => {
        return sum + (ci.payoutAmount || 0);
      }, 0);
      
      return {
        ...gym,
        totalCheckIns: gymCheckIns.length,
        todayCheckIns: todayCheckIns.length,
        totalPayout: totalPayout,
      };
    });
  }, [gyms, checkIns]);

  const filteredUsers = useMemo(() => {
    // Normalize strings
    const norm = (v: any) =>
      typeof v === 'string' ? v.trim().toLowerCase() : '';

    const now = new Date();

    // Base search filter (by name or email)
    let result = !searchQuery
      ? users
      : users.filter(
          (u: any) =>
            (u.name || '')
              .toLowerCase()
              .includes(searchQuery.toLowerCase()) ||
            (u.email || '')
              .toLowerCase()
              .includes(searchQuery.toLowerCase())
        );

    // Helper: determine if a user currently has an active subscription
    const isActiveSubscriber = (user: any) => {
      const subscription = user.subscription;
      if (!subscription) return false;

      const statusActive = subscription.isActive === true;
      const endDate = subscription.endDate ? new Date(subscription.endDate) : null;
      const notExpired = endDate ? endDate.getTime() >= now.getTime() : false;

      return statusActive && notExpired;
    };

    // Helper: determine if a user is inactive/expired (never subscribed, expired, or inactive)
    const isInactiveOrExpired = (user: any) => {
      const subscription = user.subscription;
      if (!subscription) {
        return true;
      }

      const statusActive = subscription.isActive === true;
      const endDate = subscription.endDate ? new Date(subscription.endDate) : null;
      const expired = endDate ? endDate.getTime() < now.getTime() : false;

      // Inactive if subscription is not active or already expired
      return !statusActive || expired;
    };

    if (userStatusFilter === 'active') {
      result = result.filter(isActiveSubscriber);
    } else if (userStatusFilter === 'inactive') {
      result = result.filter(isInactiveOrExpired);
    }

    return result;
  }, [users, searchQuery, userStatusFilter]);

  const filteredGyms = useMemo(() => {
    if (!searchQuery) return gymsWithStats;
    return gymsWithStats.filter(
      (g: any) =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.address.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [gymsWithStats, searchQuery]);

  const filteredCheckIns = useMemo(() => {
    let result = enrichedCheckIns;

    // Text search (user name or gym name)
    if (searchQuery) {
      const queryLower = searchQuery.toLowerCase();
      result = result.filter(
        (ci: any) =>
          (ci.userName || '').toLowerCase().includes(queryLower) ||
          (ci.gymName || '').toLowerCase().includes(queryLower)
      );
    }

    // Date range filter - filter by selected start/end dates (inclusive)
    if (checkInsStartDateFilter || checkInsEndDateFilter) {
      const start = checkInsStartDateFilter ? new Date(checkInsStartDateFilter) : null;
      const end = checkInsEndDateFilter ? new Date(checkInsEndDateFilter) : null;

      if (start) {
        start.setHours(0, 0, 0, 0);
      }
      if (end) {
        end.setHours(23, 59, 59, 999);
      }

      result = result.filter((ci: any) => {
        const ciDate = new Date(ci.timestamp);
        const afterStart = !start || ciDate.getTime() >= start.getTime();
        const beforeEnd = !end || ciDate.getTime() <= end.getTime();
        return afterStart && beforeEnd;
      });
    }

    return result;
  }, [enrichedCheckIns, searchQuery, checkInsStartDateFilter, checkInsEndDateFilter]);

  const generateId = async (): Promise<string> => {
    if (Platform.OS === 'web' && typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    if (Crypto.randomUUID) {
      return await Crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 12);
  };

  const resetGymForm = () => {
    setGymCreationStep('details');
    setNewGym({
      name: '',
      address: '',
      city: '',
      latitude: '',
      longitude: '',
      category: 'standard',
      amenities: '',
      facilities: [],
      hours: '6:00 AM - 10:00 PM',
      timings: {
        men: { from: '', to: '' },
        women: { from: '', to: '' },
        mixed: { from: '', to: '' },
      },
      menOnly: false,
      womenOnly: false,
      openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      imageUrl: '',
      allowedTiers: [],
      email: '',
      ownerName: '',
      membershipModel: 'pay_per_visit',
      pricePerVisit: '',
      gymImages: [],
      ownerPhone: '',
    });
    setEditingGymId(null);
    setEditingGymOwnerId(null);
    setEditingGymCredentials(null);
    setTempLocation({
      latitude: 31.963158,
      longitude: 35.930359,
    });
  };

  const confirmAction = async (title: string, message: string): Promise<boolean> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // eslint-disable-next-line no-alert
      return window.confirm(`${title}\n\n${message}`);
    }

    return await new Promise((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'OK', onPress: () => resolve(true) },
      ]);
    });
  };

  const startEditGym = async (gym: any) => {
    try {
      setEditingGymId(gym.id);
      setEditingGymOwnerId(null);

      setGymCreationStep('details');
      setNewGym({
        name: gym.name || '',
        address: gym.address || '',
        city: gym.city || '',
        latitude: typeof gym.latitude === 'number' ? String(gym.latitude) : (gym.latitude || ''),
        longitude: typeof gym.longitude === 'number' ? String(gym.longitude) : (gym.longitude || ''),
        category: gym.category || 'standard',
        amenities: Array.isArray(gym.amenities) ? gym.amenities.join(', ') : (gym.amenities || ''),
        facilities: Array.isArray(gym.facilities) ? gym.facilities : [],
        hours: gym.hours || '6:00 AM - 10:00 PM',
        timings: gym.timings || {
          men: { from: '', to: '' },
          women: { from: '', to: '' },
          mixed: { from: '', to: '' },
        },
        menOnly: gym.menOnly || false,
        womenOnly: gym.womenOnly || false,
        openDays: Array.isArray(gym.openDays)
          ? gym.openDays
          : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        imageUrl: gym.imageUrl || '',
        allowedTiers: Array.isArray(gym.allowedTiers) ? gym.allowedTiers : [],
        // Prefer values stored on the gym doc (if present), then try gymOwners lookup below.
        email: gym.ownerEmail || gym.email || '',
        ownerName: gym.ownerName || '',
        membershipModel: gym.membershipModel || 'pay_per_visit',
        pricePerVisit: gym.pricePerVisit ? String(gym.pricePerVisit) : '',
        gymImages: Array.isArray(gym.gymImages) ? gym.gymImages : [],
        ownerPhone: gym.ownerPhone || '',
      });

      // Load owner contact info and credentials (best-effort)
      const owner = await firestoreGymOwners.getByGymId(gym.id).catch(() => null);
      if (owner) {
        setEditingGymOwnerId(owner.id);
        setNewGym((prev) => ({
          ...prev,
          email: owner.email || '',
          ownerName: owner.name || '',
        }));
        
        // Set credentials - use stored username if available, otherwise reconstruct
        // Password is reconstructed from gym ID pattern: gym_${gymId.substring(0, 8)}
        const password = `gym_${gym.id.substring(0, 8)}`;
        setEditingGymCredentials({
          username: owner.username || '',
          password: password,
        });
      } else {
        // If no owner record, reconstruct credentials from gym ID pattern
        const sanitizedName = (gym.name || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .substring(0, 20);
        const username = `${sanitizedName}_${gym.id.substring(0, 6)}`;
        const password = `gym_${gym.id.substring(0, 8)}`;
        setEditingGymCredentials({ username, password });
      }

      setShowAddGymModal(true);
    } catch (e) {
      console.error('[Admin] Failed to start edit gym:', e);
      Alert.alert('Error', 'Failed to load gym details for editing.');
    }
  };

  const handleDeleteGym = async () => {
    if (!editingGymId) return;

    const ok = await confirmAction(
      'Delete Gym',
      'Are you sure you want to delete this gym? This cannot be undone.'
    );
    if (!ok) return;

    try {
      await firestoreGyms.delete(editingGymId);
      const owner = editingGymOwnerId
        ? { id: editingGymOwnerId }
        : await firestoreGymOwners.getByGymId(editingGymId).catch(() => null);
      if (owner?.id) {
        await firestoreGymOwners.delete(owner.id);
      }
      setShowAddGymModal(false);
      resetGymForm();
      await loadData();
      setActiveTab('gyms');
    } catch (e: any) {
      console.error('[Admin] Delete gym failed:', e);
      Alert.alert('Error', e?.message || 'Failed to delete gym.');
    }
  };

  const validateDetailsStep = (): boolean => {
    if (!newGym.name || !newGym.address || !newGym.city) {
      Alert.alert('Error', 'Please fill in all required fields');
      return false;
    }

    if (!newGym.latitude || !newGym.longitude) {
      Alert.alert('Error', 'Please select the gym location on the map');
      return false;
    }

    const isEditing = !!editingGymId;
    if (!isEditing && (!newGym.email || !newGym.ownerName)) {
      Alert.alert('Error', 'Owner name and email are required');
      return false;
    }

    return true;
  };

  const validatePricingStep = (): boolean => {
    if (!newGym.pricePerVisit || isNaN(parseFloat(newGym.pricePerVisit)) || parseFloat(newGym.pricePerVisit) <= 0) {
      Alert.alert('Error', 'Please enter a valid price per visit (must be greater than 0)');
      return false;
    }
    return true;
  };

  const validateEditForm = (): boolean => {
    if (!validateDetailsStep()) return false;
    if (!newGym.pricePerVisit || isNaN(parseFloat(newGym.pricePerVisit)) || parseFloat(newGym.pricePerVisit) <= 0) {
      Alert.alert('Error', 'Please enter a valid Pay Per Visit amount (must be greater than 0)');
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (gymCreationStep === 'details') {
      if (validateDetailsStep()) {
        setGymCreationStep('pricing');
      }
    } else if (gymCreationStep === 'pricing') {
      if (validatePricingStep()) {
        setGymCreationStep('review');
      }
    }
  };

  const handleBackStep = () => {
    if (gymCreationStep === 'pricing') {
      setGymCreationStep('details');
    } else if (gymCreationStep === 'review') {
      setGymCreationStep('pricing');
    }
  };

  const handleAddGym = async () => {
    console.log('[Admin] Add gym button clicked');
    console.log('[Admin] Form data:', newGym);
    const isEditing = !!editingGymId;
    
    // Final validation before submission
    if (isEditing) {
      if (!validateEditForm()) {
        return;
      }
    } else {
      if (!validateDetailsStep() || !validatePricingStep()) {
        return;
      }
    }

    const latitude = parseFloat(newGym.latitude);
    const longitude = parseFloat(newGym.longitude);

    if (isNaN(latitude) || isNaN(longitude)) {
      Alert.alert('Error', 'Please enter valid latitude and longitude');
      return;
    }

    const gymData = {
      name: newGym.name.trim(),
      address: newGym.address.trim(),
      city: newGym.city.trim(),
      latitude,
      longitude,
      category: newGym.category,
      hours: newGym.hours || '6:00 AM - 10:00 PM',
      imageUrl: newGym.imageUrl?.trim() || undefined,
      allowedTiers: newGym.allowedTiers.length > 0 ? newGym.allowedTiers : undefined,
      // Owner contact (optional for edit, required for create)
      email: newGym.email?.trim() || undefined,
      ownerName: newGym.ownerName?.trim() || undefined,
      ownerPhone: newGym.ownerPhone?.trim() || undefined,
    };

    console.log('[Admin] Submitting gym data (isEditing=%s):', isEditing, gymData);
    
    setIsCreatingGym(true);
    try {
      const gymId = isEditing ? editingGymId! : await generateId();
      const defaultAllowedTiers: SubscriptionTier[] =
        gymData.category === 'elite'
          ? ['elite']
          : gymData.category === 'diamond'
          ? ['diamond', 'elite']
          : gymData.category === 'premium'
          ? ['gold', 'diamond', 'elite']
          : ['silver', 'gold', 'diamond', 'elite'];

      const pricePerVisit = parseFloat(newGym.pricePerVisit);
      
      const gymRecord: any = {
        id: gymId,
        name: gymData.name,
        address: gymData.address,
        city: gymData.city,
        latitude: gymData.latitude,
        longitude: gymData.longitude,
        category: gymData.category,
        amenities: gymData.amenities || [],
        facilities: newGym.facilities || [],
        hours: gymData.hours,
        timings: newGym.timings,
        menOnly: newGym.menOnly,
        womenOnly: newGym.womenOnly,
        openDays: Array.isArray(newGym.openDays) && newGym.openDays.length > 0
          ? newGym.openDays
          : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        imageUrl:
          gymData.imageUrl ||
          'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
        allowedTiers: gymData.allowedTiers || defaultAllowedTiers,
        membershipModel: newGym.membershipModel || 'pay_per_visit',
        pricePerVisit: pricePerVisit,
        gymImages: Array.isArray(newGym.gymImages) ? newGym.gymImages : [],
      };
      // Persist owner contact on the gym doc for easy editing/display (even if gymOwners doc is missing)
      if (gymData.email) gymRecord.ownerEmail = gymData.email;
      if (gymData.ownerName) gymRecord.ownerName = gymData.ownerName;
      if (gymData.ownerPhone) gymRecord.ownerPhone = gymData.ownerPhone;

      if (isEditing) {
        const { id: _ignoreId, ...gymUpdates } = gymRecord;
        console.log('[Admin] Updating gym in Firestore:', gymId, gymUpdates);
        await firestoreGyms.update(gymId, gymUpdates);
        console.log('[Admin] Gym updated successfully in Firestore with ID:', gymId);
      } else {
        console.log('[Admin] Creating gym in Firestore:', gymRecord);
        await firestoreGyms.create(gymRecord);
        console.log('[Admin] Gym created successfully in Firestore with ID:', gymId);
      }

      let username = '';
      let password = '';

      if (!isEditing) {
        const sanitizedName = gymData.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .substring(0, 20);
        username = `${sanitizedName}_${gymId.substring(0, 6)}`;
        password = `gym_${gymId.substring(0, 8)}`;

        // Store only a hash in Firestore (never plaintext).
        // Format: sha256:<salt>:<hexDigest>
        const salt = (await generateId()).slice(0, 16);
        const passwordHash = `sha256:${salt}:${await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${salt}:${password}`
        )}`;

        // Try to create gym owner, but don't block the success flow if this fails
        const ownerId = await generateId();
        const gymOwnerData = {
          id: ownerId,
          gymId,
          username,
          passwordHash,
          email: gymData.email,
          name: gymData.ownerName,
          // Owner phone is kept only on the gym doc for admin use; it is never exposed in the user app.
          createdAt: new Date(),
        };
        console.log('[Admin] Creating gym owner in Firestore:', gymOwnerData);
        try {
          await firestoreGymOwners.create(gymOwnerData);
          console.log('[Admin] Gym owner created successfully in Firestore with ID:', ownerId);
        } catch (ownerError: any) {
          console.error('[Admin] failed to create gym owner record:', ownerError);
          Alert.alert(
            'Gym Owner Save Warning',
            'The gym was created, but saving the gym owner record failed. You can still share the credentials shown next, but please contact support to fix owner access.'
          );
        }
      } else {
        // Update owner contact info if we have an owner record
        const ownerId =
          editingGymOwnerId ||
          (await firestoreGymOwners.getByGymId(gymId).catch(() => null))?.id;
        if (ownerId && (gymData.email || gymData.ownerName)) {
          try {
            await firestoreGymOwners.update(ownerId, {
              ...(gymData.email ? { email: gymData.email } : {}),
              ...(gymData.ownerName ? { name: gymData.ownerName } : {}),
            } as any);
          } catch (e) {
            console.warn('[Admin] Failed to update gym owner contact info (non-fatal):', e);
          }
        }
      }

      // Close the add gym modal and show success modal with QR code
      setShowAddGymModal(false);
      resetGymForm();
      if (!isEditing) {
        setCreatedGymData({
          gymId,
          gymName: gymData.name,
          username,
          password,
        });
        setShowSuccessModal(true);
      } else {
        Alert.alert('Saved', 'Gym updated successfully.');
      }
      setActiveTab('gyms');
      loadData(); // Reload data from Firestore
    } catch (error: any) {
      console.error('[Admin] create gym error:', error);
      Alert.alert('Error', error?.message || 'Failed to submit gym. Please try again.');
    } finally {
      setIsCreatingGym(false);
    }
  };

  const openMapModal = async () => {
    // Try to get user's current location first
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setTempLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => {
          // Fallback to existing location or default
          if (newGym.latitude && newGym.longitude) {
            const lat = parseFloat(newGym.latitude);
            const lng = parseFloat(newGym.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
              setTempLocation({ latitude: lat, longitude: lng });
            } else {
              // Default to Amman, Jordan
              setTempLocation({ latitude: 31.963158, longitude: 35.930359 });
            }
          } else {
            // Default to Amman, Jordan
            setTempLocation({ latitude: 31.963158, longitude: 35.930359 });
          }
        },
        { timeout: 3000, enableHighAccuracy: true }
      );
    } else {
      // Fallback if geolocation not available
      if (newGym.latitude && newGym.longitude) {
        const lat = parseFloat(newGym.latitude);
        const lng = parseFloat(newGym.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          setTempLocation({ latitude: lat, longitude: lng });
        } else {
          setTempLocation({ latitude: 31.963158, longitude: 35.930359 });
        }
      } else {
        setTempLocation({ latitude: 31.963158, longitude: 35.930359 });
      }
    }
    setIsMapModalVisible(true);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied!', 'Credentials copied to clipboard');
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const downloadQRCode = async (gymId: string, gymName: string) => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=xpass-gym-${gymId}`;
        
        // Fetch the QR code image
        const response = await fetch(qrUrl);
        const blob = await response.blob();
        
        // Create a download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${gymName.replace(/[^a-z0-9]/gi, '_')}_QR_Code.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        Alert.alert('Success', 'QR code downloaded successfully!');
      } else {
        // For native platforms, you could use expo-file-system or similar
        Alert.alert('Info', 'Download is only available on web');
      }
    } catch (error) {
      console.error('Failed to download QR code:', error);
      Alert.alert('Error', 'Failed to download QR code. Please try again.');
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    setCreatedGymData(null);
    // Switch to gyms tab to show the newly added gym
    setActiveTab('gyms');
  };

  const handleConfirmLocation = () => {
    setNewGym({
      ...newGym,
      latitude: tempLocation.latitude.toString(),
      longitude: tempLocation.longitude.toString(),
    });
    setIsMapModalVisible(false);
  };

  const handleUploadGymImages = async () => {
    if (isUploadingGymImages) return;
    setIsUploadingGymImages(true);

    try {
      const storage = getStorage(app);
      const newUrls: string[] = [];

      if (Platform.OS === 'web') {
        const files = await new Promise<FileList | null>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.multiple = true;
          input.style.display = 'none';

          const handleChange = (e: Event) => {
            const target = e.target as HTMLInputElement;
            const list = target.files;
            input.removeEventListener('change', handleChange);
            document.body.removeChild(input);
            resolve(list && list.length > 0 ? list : null);
          };

          input.addEventListener('change', handleChange);
          document.body.appendChild(input);
          input.click();
        });

        if (!files) {
          setIsUploadingGymImages(false);
          return;
        }

        const fileArray = Array.from(files);
        for (let index = 0; index < fileArray.length; index++) {
          const file = fileArray[index];
          const timestamp = Date.now();
          const idSeed = `${timestamp}-${file.name}-${index}`;
          const objectId = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            idSeed
          );
          const objectRef = ref(storage, `gymImages/${objectId}.jpg`);
          await uploadBytes(objectRef, file, { contentType: file.type || 'image/jpeg' });
          const url = await getDownloadURL(objectRef);
          newUrls.push(url);
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Please grant access to your photo library.');
          setIsUploadingGymImages(false);
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          allowsMultipleSelection: true,
          quality: 0.8,
        } as any);

        if (result.canceled || !result.assets?.length) {
          setIsUploadingGymImages(false);
          return;
        }

        for (let index = 0; index < result.assets.length; index++) {
          const asset = result.assets[index];
          const uri = asset.uri;
          if (!uri) continue;
          const timestamp = Date.now();
          const objectId = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            `${timestamp}-gym-image-${index}`
          );
          const objectRef = ref(storage, `gymImages/${objectId}.jpg`);
          const response = await fetch(uri);
          const blob = await response.blob();
          await uploadBytes(objectRef, blob, { contentType: 'image/jpeg' });
          const url = await getDownloadURL(objectRef);
          newUrls.push(url);
        }
      }

      if (newUrls.length === 0) {
        setIsUploadingGymImages(false);
        return;
      }

      setNewGym((prev) => ({
        ...prev,
        gymImages: [...(prev.gymImages || []), ...newUrls],
      }));
    } catch (error: any) {
      console.error('[Admin] Error uploading gym images:', error);
      Alert.alert('Error', error?.message || 'Failed to upload images. Please try again.');
    } finally {
      setIsUploadingGymImages(false);
    }
  };

  const handlePickImage = async () => {
    try {
      // Ensure gallery upload state is reset so its button label is correct
      if (isUploadingGymImages) {
        setIsUploadingGymImages(false);
      }
      const storage = getStorage(app);

      // Web: use native file input so we can upload directly to storage
      if (Platform.OS === 'web') {
        const file = await new Promise<File | null>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.style.display = 'none';

          const handleChange = (e: Event) => {
            const target = e.target as HTMLInputElement;
            const f = target.files?.[0] || null;
            input.removeEventListener('change', handleChange);
            document.body.removeChild(input);
            resolve(f);
          };

          input.addEventListener('change', handleChange);
          document.body.appendChild(input);
          input.click();
        });

        if (!file) return;

        const timestamp = Date.now();
        const logoId = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${timestamp}-${file.name}-logo`
        );
        const objectRef = ref(storage, `gymLogos/${logoId}.jpg`);
        await uploadBytes(objectRef, file, { contentType: file.type || 'image/jpeg' });
        const url = await getDownloadURL(objectRef);

        setNewGym((prev) => ({ ...prev, imageUrl: url }));
      } else {
        // Native: use ImagePicker, then upload selected image
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Please grant access to your photo library to upload a logo.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.8,
          aspect: [1, 1], // Force square crop for gym logos
        });
        if (result.canceled || !result.assets?.[0]?.uri) return;

        const uri = result.assets[0].uri;
        const resp = await fetch(uri);
        const blob = await resp.blob();

        const timestamp = Date.now();
        const logoId = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${timestamp}-native-logo`
        );
        const objectRef = ref(storage, `gymLogos/${logoId}.jpg`);
        await uploadBytes(objectRef, blob, { contentType: blob.type || 'image/jpeg' });
        const url = await getDownloadURL(objectRef);

        setNewGym((prev) => ({ ...prev, imageUrl: url }));
      }
    } catch (error: any) {
      console.error('[Admin] Error uploading gym logo:', error);
      Alert.alert('Error', error?.message || 'Failed to upload logo. Please try again.');
    }
  };

  // Spotlight banner management functions
  const handleUploadSpotlightBanner = async () => {
    if (isUploadingBanner) return; // Prevent multiple uploads
    
    setIsUploadingBanner(true);
    try {
      let imageUri: string | null = null;

      if (Platform.OS === 'web') {
        // Web: use file input
        const file = await new Promise<File | null>((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.style.display = 'none';
          
          const handleChange = (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files?.[0] || null;
            input.removeEventListener('change', handleChange);
            document.body.removeChild(input);
            resolve(file);
          };
          input.addEventListener('change', handleChange);
          document.body.appendChild(input);
          input.click();
        });
        
        if (!file) {
          setIsUploadingBanner(false);
          return;
        }

        console.log('[Admin] Uploading file:', file.name, file.size);
        const storage = getStorage(app);
        const timestamp = Date.now();
        const bannerId = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${timestamp}-${file.name}`
        );
        const objectRef = ref(storage, `spotlightImages/${bannerId}.jpg`);
        
        console.log('[Admin] Uploading to storage:', objectRef.fullPath);
        await uploadBytes(objectRef, file, { contentType: file.type || 'image/jpeg' });
        console.log('[Admin] Getting download URL...');
        imageUri = await getDownloadURL(objectRef);
        console.log('[Admin] Image uploaded, URL:', imageUri);
      } else {
        // Mobile: use ImagePicker
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Please grant access to your photo library.');
          setIsUploadingBanner(false);
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.85,
          aspect: [16, 9], // Banner aspect ratio
        });
        if (result.canceled || !result.assets?.[0]?.uri) {
          setIsUploadingBanner(false);
          return;
        }

        console.log('[Admin] Uploading image from mobile:', result.assets[0].uri);
        const storage = getStorage(app);
        const timestamp = Date.now();
        const bannerId = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${timestamp}-spotlight`
        );
        const objectRef = ref(storage, `spotlightImages/${bannerId}.jpg`);
        const response = await fetch(result.assets[0].uri);
        const blob = await response.blob();
        console.log('[Admin] Uploading to storage:', objectRef.fullPath);
        await uploadBytes(objectRef, blob, { contentType: 'image/jpeg' });
        console.log('[Admin] Getting download URL...');
        imageUri = await getDownloadURL(objectRef);
        console.log('[Admin] Image uploaded, URL:', imageUri);
      }

      if (!imageUri) {
        setIsUploadingBanner(false);
        Alert.alert('Error', 'Failed to get image URL after upload.');
        return;
      }

      // Create banner in Firestore
      console.log('[Admin] Creating banner in Firestore...');
      const timestamp = Date.now();
      const imageId = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${timestamp}-${imageUri}`
      );
      const currentPositions = spotlightImages.map((img: any) =>
        typeof img.position === 'number' ? img.position : 0
      );
      const nextPosition =
        currentPositions.length > 0 ? Math.max(...currentPositions) + 1 : 1;

      const newImage = {
        id: imageId,
        imageUrl: imageUri,
        position: nextPosition,
        isActive: true,
        createdAt: new Date(),
      };

      console.log('[Admin] Spotlight image data:', newImage);
      await firestoreSpotlightImages.create(newImage as any);
      console.log('[Admin] Spotlight image created, reloading list...');
      await loadSpotlightImages();
      Alert.alert('Success', 'Spotlight image uploaded successfully!');
    } catch (error: any) {
      console.error('[Admin] Error uploading spotlight banner:', error);
      console.error('[Admin] Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack,
      });
      Alert.alert('Error', error?.message || 'Failed to upload banner. Please try again.');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleUpdateSpotlightOrder = (bannerId: string, newOrderRaw: string) => {
    const trimmed = newOrderRaw.trim();
    if (!trimmed) return;
    const parsed = parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return;

    setSpotlightImages((prev) => {
      const list = [...prev].sort(
        (a, b) => (a.position || 0) - (b.position || 0)
      );
      const currentIndex = list.findIndex((img) => img.id === bannerId);
      if (currentIndex === -1) return prev;

      const clamped =
        parsed < 1
          ? 1
          : parsed > list.length
          ? list.length
          : parsed;

      const [moved] = list.splice(currentIndex, 1);
      list.splice(clamped - 1, 0, moved);

      const reseq = list.map((img, index) => ({
        ...img,
        position: index + 1,
      }));

      return reseq;
    });
    setSpotlightOrderDirty(true);
  };

  const handleSaveSpotlightOrder = async () => {
    if (!spotlightImages || spotlightImages.length === 0) return;

    try {
      setIsSavingSpotlightOrder(true);

      // Normalize to 1..N and persist to Firestore
      const sorted = [...spotlightImages].sort(
        (a: any, b: any) =>
          (typeof a.position === 'number' ? a.position : 0) -
          (typeof b.position === 'number' ? b.position : 0)
      );

      const resequenced = sorted.map((img: any, index: number) => ({
        ...img,
        position: index + 1,
      }));

      await Promise.all(
        resequenced.map((img: any) =>
          firestoreSpotlightImages.update(img.id, {
            position: img.position,
          })
        )
      );

      setSpotlightImages(resequenced);
      setSpotlightOrderDirty(false);
      Alert.alert('Success', 'Banner order updated successfully');

      // Reload from Firestore to ensure consistency
      await loadSpotlightImages();
    } catch (error: any) {
      console.error('[Admin] Failed to save spotlight banner order:', error);
      Alert.alert(
        'Error',
        error?.message || 'Failed to save banner order. Please try again.'
      );
    } finally {
      setIsSavingSpotlightOrder(false);
    }
  };

  const handleDeleteSpotlightBanner = async (bannerId: string, imageUrl: string) => {
    Alert.alert(
      'Delete Banner',
      'Are you sure you want to delete this spotlight banner?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete from Firestore
              await firestoreSpotlightImages.delete(bannerId);

              // Try to delete from Storage (if it's a Firebase Storage URL)
              try {
                if (imageUrl.includes('firebasestorage')) {
                  const storage = getStorage(app);
                  const imageRef = ref(storage, imageUrl);
                  await deleteObject(imageRef);
                }
              } catch (storageError) {
                console.warn('[Admin] Could not delete image from storage:', storageError);
                // Continue even if storage deletion fails
              }

              // Re-fetch and resequence positions
              await loadSpotlightImages();
              setSpotlightImages((prev) =>
                [...prev]
                  .filter((img) => img.id !== bannerId)
                  .sort((a, b) => (a.position || 0) - (b.position || 0))
                  .map((img, index) => ({ ...img, position: index + 1 }))
              );
              Alert.alert('Success', 'Spotlight image deleted successfully!');
            } catch (error: any) {
              console.error('[Admin] Error deleting banner:', error);
              Alert.alert('Error', error?.message || 'Failed to delete banner. Please try again.');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (!isAuthLoading && !isCheckingAdmin) {
      if (!isAuthenticated || !isAdmin) {
        router.replace('/admin-login');
      }
    }
  }, [isAuthLoading, isCheckingAdmin, isAuthenticated, isAdmin, router]);

  const guardLoading = isAuthLoading || isCheckingAdmin;

  // Map picker is provided by platform-specific GymLocationPicker component

  const toggleTier = (tier: SubscriptionTier) => {
    setNewGym((prev) => ({
      ...prev,
      allowedTiers: prev.allowedTiers.includes(tier)
        ? prev.allowedTiers.filter((t) => t !== tier)
        : [...prev.allowedTiers, tier],
    }));
  };

  if (guardLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  if (isLoadingData && gyms.length === 0 && users.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#DC2626" />
        <Text style={{ marginTop: 16, color: '#6B7280' }}>Loading data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

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
          <TouchableOpacity style={styles.profilePill} activeOpacity={0.8}>
            <UserIcon size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'overview' && !showCouponsView && (
          <View style={styles.content}>
            <Text style={styles.pageTitle}>Admin Console</Text>

            <View style={styles.statsGrid2x2}>
              <TouchableOpacity
                style={styles.statCardMinimal}
                activeOpacity={0.85}
                onPress={() => setActiveTab('users')}
              >
                <Text style={styles.statLabelMinimal}>Active Users</Text>
                <Text style={styles.statValueMinimal}>{stats?.totalUsers || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statCardMinimal}
                activeOpacity={0.85}
                onPress={() => setActiveTab('checkins')}
              >
                <Text style={styles.statLabelMinimal}>Check-ins</Text>
                <Text style={styles.statValueMinimal}>{stats?.totalCheckIns || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statCardMinimal}
                activeOpacity={0.85}
                onPress={() => setActiveTab('payouts')}
              >
                <Text style={styles.statLabelMinimal}>Payouts Pending</Text>
                <Text style={styles.statValueMinimal}>{pendingPayouts.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statCardMinimal}
                activeOpacity={0.85}
                onPress={() => setActiveTab('gyms')}
              >
                <Text style={styles.statLabelMinimal}>Total Gyms</Text>
                <Text style={styles.statValueMinimal}>{stats?.totalGyms || 0}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.statsGrid2x2, { marginTop: 24 }]}>
              <TouchableOpacity
                style={styles.statCardMinimal}
                activeOpacity={0.85}
                onPress={() => setActiveTab('revenue')}
              >
                <Text style={styles.statLabelMinimal}>Revenue This Month</Text>
                <Text style={styles.statValueMinimal}>
                  {`JOD ${revenueMetrics.thisMonthRevenue.toFixed(0)}`}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.primaryCta}
              activeOpacity={0.9}
              onPress={() => setShowAddGymModal(true)}
            >
              <Text style={styles.primaryCtaText}>Add a New Gym</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              activeOpacity={0.85}
              onPress={() => setShowCouponsView(true)}
            >
              <Tag size={18} color="#111827" style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>Coupons</Text>
            </TouchableOpacity>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Monthly Payouts</Text>

              {(gymsWithStats || []).slice(0, 2).map((g: any) => (
                <View key={g.id} style={styles.payoutRow}>
                  <Text style={styles.payoutGymName}>{g.name}</Text>
                  <Text style={styles.payoutAmount}>JOD {g.totalPayout?.toFixed(2) || '0.00'}</Text>
                </View>
              ))}

              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.85}
                onPress={() => setActiveTab('payouts')}
              >
                <Text style={styles.secondaryButtonText}>View All</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === 'users' && (
          <View style={styles.content}>
            <Text style={styles.pageTitle}>Subscribers</Text>
            <View style={styles.searchContainer}>
              <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search users..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Subscribers status filter: Active vs Inactive / Expired */}
            <View style={styles.userFilterRow}>
              <TouchableOpacity
                style={[
                  styles.userFilterChip,
                  userStatusFilter === 'active' && styles.userFilterChipActive,
                ]}
                activeOpacity={0.85}
                onPress={() => setUserStatusFilter('active')}
              >
                <Text
                  style={[
                    styles.userFilterChipText,
                    userStatusFilter === 'active' && styles.userFilterChipTextActive,
                  ]}
                >
                  Active
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.userFilterChip,
                  userStatusFilter === 'inactive' && styles.userFilterChipActive,
                ]}
                activeOpacity={0.85}
                onPress={() => setUserStatusFilter('inactive')}
              >
                <Text
                  style={[
                    styles.userFilterChipText,
                    userStatusFilter === 'inactive' && styles.userFilterChipTextActive,
                  ]}
                >
                  Inactive / Expired
                </Text>
              </TouchableOpacity>
            </View>

            {filteredUsers.map((user: any) => {
              const subscription = user.subscription;
              const now = new Date();
              const isExpired = subscription && new Date(subscription.endDate) < now;
              const daysRemaining = subscription
                ? Math.ceil((new Date(subscription.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                : null;

              return (
                <TouchableOpacity
                  key={user.id}
                  style={styles.userCard}
                  onPress={() => setSelectedSubscriber(user)}
                  activeOpacity={0.7}
                >
                  <View style={styles.userHeader}>
                    <View style={styles.userIcon}>
                      <Users size={24} color="#DC2626" />
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{user.name || 'No name'}</Text>
                      <Text style={styles.userEmail}>{user.email || 'No email'}</Text>
                      {user.phone && (
                        <Text style={styles.userPhone}>{user.phone}</Text>
                      )}
                      {subscription && (
                        <View
                          style={[
                            styles.tierBadge,
                            {
                              backgroundColor:
                                TIER_COLORS[subscription.tier as keyof typeof TIER_COLORS] + '20',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.tierText,
                              { color: TIER_COLORS[subscription.tier as keyof typeof TIER_COLORS] },
                            ]}
                          >
                            {subscription.tier.toUpperCase()} - {subscription.duration}mo
                          </Text>
                        </View>
                      )}
                      {subscription && (
                        <View style={styles.subscriptionInfo}>
                          {isExpired ? (
                            <Text style={styles.expiredText}>Expired</Text>
                          ) : daysRemaining !== null ? (
                            <Text style={styles.daysRemainingText}>
                              {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Expires today'}
                            </Text>
                          ) : null}
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.userStats}>
                    <View style={styles.userStat}>
                      <Text style={styles.userStatLabel}>Wallet</Text>
                      <Text style={styles.userStatValue}>JOD {user.walletBalance || 0}</Text>
                    </View>
                    <View style={styles.userStat}>
                      <Text style={styles.userStatLabel}>Code</Text>
                      <Text style={styles.userStatValue}>{user.referralCode || 'N/A'}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {activeTab === 'gyms' && (
          <View style={styles.content}>
            <View style={styles.pageHeaderBlock}>
              <Text style={styles.pageTitle}>All Gyms</Text>
              <Text style={styles.pageSubtitle}>Browse every gym partner on XPASS</Text>
            </View>
            <View style={styles.searchContainer}>
              <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search gyms, areas"
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddGymModal(true)}
              >
                <Plus size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {isLoadingData && filteredGyms.length === 0 && (
              <View style={styles.loadingCard}>
                <ActivityIndicator size="large" color="#DC2626" />
                <Text style={styles.loadingText}>Loading gyms...</Text>
              </View>
            )}

            {!isLoadingData && filteredGyms.length === 0 && (
              <View style={styles.emptyCard}>
                <Building2 size={48} color="#9CA3AF" />
                <Text style={styles.emptyText}>No gyms found</Text>
                <Text style={styles.emptySubtext}>
                  Click the + button to add your first gym
                </Text>
              </View>
            )}

            <Text style={styles.listCount}>Showing {filteredGyms.length} gyms</Text>

            {/* Spotlight Images Management */}
            <View style={styles.spotlightPanel}>
              <Text style={styles.sectionTitle}>Spotlight Images</Text>
              <Text style={styles.spotlightDescription}>
                Manage promotional banners shown in the user home carousel.
              </Text>

              <TouchableOpacity
                style={[
                  styles.uploadBannerButton,
                  isUploadingBanner && styles.uploadBannerButtonDisabled,
                ]}
                onPress={handleUploadSpotlightBanner}
                disabled={isUploadingBanner}
              >
                {isUploadingBanner ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.uploadBannerButtonText}>Uploading...</Text>
                  </>
                ) : (
                  <>
                    <Plus size={20} color="#fff" />
                    <Text style={styles.uploadBannerButtonText}>Upload New Banner</Text>
                  </>
                )}
              </TouchableOpacity>

              {isLoadingSpotlight ? (
                <View style={styles.loadingCard}>
                  <ActivityIndicator size="large" color="#DC2626" />
                  <Text style={styles.loadingText}>Loading spotlight images...</Text>
                </View>
              ) : spotlightImages.length === 0 ? (
                <View style={styles.emptyCard}>
                  <ImageIcon size={48} color="#9CA3AF" />
                  <Text style={styles.emptyText}>No spotlight images</Text>
                  <Text style={styles.emptySubtext}>
                    Upload a banner to display in the user home carousel.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.bannersList}>
                    {spotlightImages.map((img, index) => (
                      <View key={img.id} style={styles.bannerCard}>
                        <Image
                          source={{ uri: img.imageUrl }}
                          style={styles.bannerPreview}
                          resizeMode="cover"
                        />
                        <View style={styles.bannerInfo}>
                          <View style={styles.bannerOrderRow}>
                            <Text style={styles.bannerOrderLabel}>Position</Text>
                            <TextInput
                              style={styles.bannerOrderInput}
                              keyboardType="number-pad"
                              value={
                                typeof img.position === 'number'
                                  ? String(img.position)
                                  : String(index + 1)
                              }
                              onChangeText={(text) =>
                                handleUpdateSpotlightOrder(
                                  img.id,
                                  text || String(index + 1)
                                )
                              }
                            />
                          </View>
                          <View style={styles.bannerActiveRow}>
                            <Text style={styles.bannerOrderLabel}>
                              {img.isActive ? 'Active' : 'Inactive'}
                            </Text>
                            <TouchableOpacity
                              style={[
                                styles.activeToggle,
                                img.isActive && styles.activeToggleOn,
                              ]}
                              onPress={async () => {
                                const next = !img.isActive;
                                setSpotlightImages((prev) =>
                                  prev.map((it) =>
                                    it.id === img.id ? { ...it, isActive: next } : it
                                  )
                                );
                                try {
                                  await firestoreSpotlightImages.update(img.id, {
                                    isActive: next,
                                  });
                                } catch (error) {
                                  console.error(
                                    '[Admin] Failed to toggle spotlight image active flag:',
                                    error
                                  );
                                  loadSpotlightImages();
                                }
                              }}
                            >
                              <Text
                                style={[
                                  styles.activeToggleText,
                                  img.isActive && styles.activeToggleTextOn,
                                ]}
                              >
                                {img.isActive ? 'ON' : 'OFF'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.deleteBannerButton}
                          onPress={() =>
                            handleDeleteSpotlightBanner(img.id, img.imageUrl)
                          }
                        >
                          <X size={18} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                    <TouchableOpacity
                      style={[
                        styles.saveBannerOrderButton,
                        (!spotlightOrderDirty || isSavingSpotlightOrder) &&
                          styles.saveBannerOrderButtonDisabled,
                      ]}
                      activeOpacity={0.85}
                      disabled={!spotlightOrderDirty || isSavingSpotlightOrder}
                      onPress={handleSaveSpotlightOrder}
                    >
                      {isSavingSpotlightOrder ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.saveBannerOrderButtonText}>Save Banner Order</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            {/* Gyms Section */}
            <View style={styles.gymsSection}>
              <Text style={styles.sectionTitle}>Gyms</Text>
              <Text style={styles.spotlightDescription}>
                Manage gym locations and settings.
              </Text>
            </View>

            {filteredGyms.map((gym: any) => {
              const logoUri =
                typeof gym.imageUrl === 'string' && !gym.imageUrl.startsWith('blob:')
                  ? gym.imageUrl
                  : 'https://placehold.co/140x90/png?text=Gym';

              return (
              <View key={gym.id} style={styles.gymRowCard}>
                <Image
                  source={{ uri: logoUri }}
                  style={styles.gymThumb}
                />
                <View style={styles.gymRowInfo}>
                  <View style={styles.gymRowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gymName}>{gym.name}</Text>
                      <Text style={styles.gymAddress}>{gym.city || gym.address}</Text>
                      <View style={styles.amenitiesPills}>
                        {(gym.amenities || []).slice(0, 3).map((a: string, idx: number) => (
                          <View key={`${gym.id}-a-${idx}`} style={styles.pill}>
                            <Text style={styles.pillText}>{a}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.editPill}
                      activeOpacity={0.9}
                      onPress={() => startEditGym(gym)}
                    >
                      <Text style={styles.editPillText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );})}
          </View>
        )}

        {activeTab === 'checkins' && (
          <View style={styles.content}>
            <Text style={styles.pageTitle}>Check-ins</Text>
            
            {/* Today's Check-ins Summary */}
            {(() => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const todayCheckIns = enrichedCheckIns.filter((ci: any) => {
                const ciDate = new Date(ci.timestamp);
                ciDate.setHours(0, 0, 0, 0);
                return ciDate.getTime() === today.getTime();
              });

              if (todayCheckIns.length > 0) {
                return (
                  <View style={styles.todayCheckInsSection}>
                    <TouchableOpacity
                      style={styles.todayHeaderRow}
                      activeOpacity={0.8}
                      onPress={() => setShowTodayCheckIns((prev) => !prev)}
                    >
                      <Text style={styles.sectionTitle}>Check-ins Today: {todayCheckIns.length}</Text>
                      <Text style={styles.todayToggleText}>
                        {showTodayCheckIns ? 'Hide' : 'Show'}
                      </Text>
                    </TouchableOpacity>

                    {showTodayCheckIns && (
                      <>
                        {todayCheckIns.slice(0, 5).map((checkIn: any) => {
                          const checkInDate = new Date(checkIn.timestamp);
                          return (
                            <TouchableOpacity
                              key={checkIn.id}
                              style={styles.checkInCard}
                              activeOpacity={0.85}
                              onPress={() => setSelectedCheckIn(checkIn)}
                            >
                              <View style={styles.checkInHeader}>
                                <View
                                  style={[
                                    styles.tierBadge,
                                    {
                                      backgroundColor:
                                        TIER_COLORS[checkIn.tier as keyof typeof TIER_COLORS] + '20',
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.tierText,
                                      { color: TIER_COLORS[checkIn.tier as keyof typeof TIER_COLORS] },
                                    ]}
                                  >
                                    {checkIn.tier.toUpperCase()}
                                  </Text>
                                </View>
                                <View style={styles.checkInInfo}>
                                  <Text style={styles.checkInUser}>{checkIn.userName}</Text>
                                  <Text style={styles.checkInGym}>{checkIn.gymName}</Text>
                                </View>
                              </View>
                              <View style={styles.checkInTimeRow}>
                                <Text style={styles.checkInDate}>
                                  {checkInDate.toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </Text>
                                <Text style={styles.checkInTime}>
                                  {checkInDate.toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true,
                                  })}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                        {todayCheckIns.length > 5 && (
                          <Text style={styles.moreCheckInsText}>
                            +{todayCheckIns.length - 5} more today
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                );
              }
              return null;
            })()}

            <View style={styles.searchContainer}>
              <Search size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search check-ins..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Date range filter for check-ins */}
            <View style={styles.dateFilterRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.dateFilterLabel}>From</Text>
                <DatePicker
                  value={checkInsStartDateFilter}
                  onChange={setCheckInsStartDateFilter}
                  placeholder="Start date"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.dateFilterLabel}>To</Text>
                <DatePicker
                  value={checkInsEndDateFilter}
                  onChange={setCheckInsEndDateFilter}
                  placeholder="End date"
                />
              </View>
            </View>

            <Text style={styles.allCheckInsTitle}>
              {checkInsStartDateFilter || checkInsEndDateFilter
                ? `${checkInsStartDateFilter
                    ? checkInsStartDateFilter.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '...'} – ${checkInsEndDateFilter
                    ? checkInsEndDateFilter.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '...'}`
                : 'All Check-ins'}
            </Text>

            {filteredCheckIns.map((checkIn: any) => {
              const checkInDate = new Date(checkIn.timestamp);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isToday = (() => {
                const ciDate = new Date(checkIn.timestamp);
                ciDate.setHours(0, 0, 0, 0);
                return ciDate.getTime() === today.getTime();
              })();

              return (
                <TouchableOpacity
                  key={checkIn.id}
                  style={styles.checkInCard}
                  activeOpacity={0.85}
                  onPress={() => setSelectedCheckIn(checkIn)}
                >
                  <View style={styles.checkInHeader}>
                    <View
                      style={[
                        styles.tierBadge,
                        { backgroundColor: TIER_COLORS[checkIn.tier as keyof typeof TIER_COLORS] + '20' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tierText,
                          { color: TIER_COLORS[checkIn.tier as keyof typeof TIER_COLORS] },
                        ]}
                      >
                        {checkIn.tier.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.checkInInfo}>
                      <Text style={styles.checkInUser}>{checkIn.userName}</Text>
                      <Text style={styles.checkInGym}>{checkIn.gymName}</Text>
                    </View>
                  </View>
                  <View style={styles.checkInTimeRow}>
                    <Text style={styles.checkInDate}>
                      {isToday ? 'Today' : checkInDate.toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </Text>
                    <Text style={styles.checkInTime}>
                      {checkInDate.toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: true 
                      })}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {activeTab === 'payouts' && (
          <View style={styles.content}>
            <Text style={styles.pageTitle}>Payouts</Text>
            <Text style={styles.pageSubtitle}>
              Monthly payouts are calculated from completed check-ins.
            </Text>

            {/* Payouts data */}
            {payoutsQuery.isLoading ? (
              <View style={styles.loadingCard}>
                <ActivityIndicator size="large" color="#DC2626" />
                <Text style={styles.loadingText}>Loading payouts...</Text>
              </View>
            ) : (
              <>
                  {/* Pending Section */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Pending Payouts</Text>

                    {pendingPayouts.length === 0 ? (
                      <View style={styles.emptyState}>
                        <DollarSign size={40} color="#9CA3AF" />
                        <Text style={styles.emptyTitle}>No pending payouts</Text>
                        <Text style={styles.emptyText}>
                          When users check in to gyms, payouts will appear here.
                        </Text>
                      </View>
                    ) : (
                      pendingPayouts.map((payout: any) => (
                        <View key={payout.id} style={styles.payoutCard}>
                          <View style={styles.payoutHeaderRow}>
                            <Text style={styles.payoutGymName}>{payout.gymName}</Text>
                            <View style={styles.payoutStatusBadgePending}>
                              <Text style={styles.payoutStatusTextPending}>Pending</Text>
                            </View>
                          </View>

                          <View style={styles.payoutMetaRow}>
                            <Text style={styles.payoutLabel}>Month</Text>
                            <Text style={styles.payoutValue}>{formatPayoutMonth(payout.month)}</Text>
                          </View>
                          <View style={styles.payoutMetaRow}>
                            <Text style={styles.payoutLabel}>Check-ins</Text>
                            <Text style={styles.payoutValue}>{payout.totalCheckins}</Text>
                          </View>
                          <View style={styles.payoutMetaRow}>
                            <Text style={styles.payoutLabel}>Pay Per Visit Rate</Text>
                            <Text style={styles.payoutValue}>
                              {payout.payPerVisitRate ? `${payout.payPerVisitRate.toFixed(2)} JOD` : 'N/A'}
                            </Text>
                          </View>
                          <View style={styles.payoutMetaRow}>
                            <Text style={styles.payoutLabel}>Total Amount</Text>
                            <Text style={styles.payoutValue}>{formatPayoutAmount(payout.amount)}</Text>
                          </View>

                          <TouchableOpacity
                            style={styles.markPaidButton}
                            activeOpacity={0.9}
                              onPress={() => handleMarkPayoutPaid(payout.id)}
                          >
                            <Text style={styles.markPaidButtonText}>Mark as Paid</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>

                  {/* Paid Section */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Paid Payouts</Text>

                    {paidPayouts.length === 0 ? (
                      <View style={styles.emptyState}>
                        <DollarSign size={40} color="#9CA3AF" />
                        <Text style={styles.emptyTitle}>No paid payouts</Text>
                        <Text style={styles.emptyText}>
                          Once payouts are marked as paid, they will appear here.
                        </Text>
                      </View>
                    ) : (
                      paidPayouts.map((payout: any) => {
                        const paidOn = payout.paidAt || payout.createdAt;
                        return (
                          <View key={payout.id} style={styles.payoutCard}>
                            <View style={styles.payoutHeaderRow}>
                              <Text style={styles.payoutGymName}>{payout.gymName}</Text>
                              <View style={styles.payoutStatusBadgePaid}>
                                <Text style={styles.payoutStatusTextPaid}>Paid</Text>
                              </View>
                            </View>

                            <View style={styles.payoutMetaRow}>
                              <Text style={styles.payoutLabel}>Month</Text>
                              <Text style={styles.payoutValue}>{formatPayoutMonth(payout.month)}</Text>
                            </View>
                            <View style={styles.payoutMetaRow}>
                              <Text style={styles.payoutLabel}>Check-ins</Text>
                              <Text style={styles.payoutValue}>{payout.totalCheckins}</Text>
                            </View>
                            <View style={styles.payoutMetaRow}>
                              <Text style={styles.payoutLabel}>Pay Per Visit Rate</Text>
                              <Text style={styles.payoutValue}>
                                {payout.payPerVisitRate ? `${payout.payPerVisitRate.toFixed(2)} JOD` : 'N/A'}
                              </Text>
                            </View>
                            <View style={styles.payoutMetaRow}>
                              <Text style={styles.payoutLabel}>Total Amount</Text>
                              <Text style={styles.payoutValue}>{formatPayoutAmount(payout.amount)}</Text>
                            </View>
                            <View style={styles.payoutMetaRow}>
                              <Text style={styles.payoutLabel}>Paid on</Text>
                              <Text style={styles.payoutValue}>
                                {new Date(paidOn).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
              </>
            )}
          </View>
        )}

        {activeTab === 'revenue' && (
          <View style={styles.content}>
            <Text style={styles.pageTitle}>Revenue</Text>

            <View style={styles.revenueFilterRow}>
              {[
                { key: 'THIS_MONTH', label: 'This Month' },
                { key: 'LAST_MONTH', label: 'Last Month' },
                { key: 'LAST_3_MONTHS', label: 'Last 3 Months' },
                { key: 'LAST_12_MONTHS', label: 'Last 12 Months' },
                { key: 'ALL_TIME', label: 'All Time' },
                { key: 'CUSTOM', label: 'Custom' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.userFilterChip,
                    revenueRange === opt.key && styles.userFilterChipActive,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => setRevenueRange(opt.key as any)}
                >
                  <Text
                    style={[
                      styles.userFilterChipText,
                      revenueRange === opt.key && styles.userFilterChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {revenueRange === 'CUSTOM' && (
              <View style={styles.dateRangeRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.dateFilterLabel}>From</Text>
                  <DatePicker
                    date={revenueStartDate}
                    onChange={setRevenueStartDate}
                    placeholder="Select start date"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.dateFilterLabel}>To</Text>
                  <DatePicker
                    date={revenueEndDate}
                    onChange={setRevenueEndDate}
                    placeholder="Select end date"
                  />
                </View>
              </View>
            )}

            <View style={styles.statsGrid2x2}>
              <View style={styles.statCardMinimal}>
                <Text style={styles.statLabelMinimal}>This Month</Text>
                <Text style={styles.statValueMinimal}>
                  {`JOD ${revenueMetrics.thisMonthRevenue.toFixed(0)}`}
                </Text>
              </View>
              <View style={styles.statCardMinimal}>
                <Text style={styles.statLabelMinimal}>Last Month</Text>
                <Text style={styles.statValueMinimal}>
                  {`JOD ${revenueMetrics.lastMonthRevenue.toFixed(0)}`}
                </Text>
              </View>
              <View style={styles.statCardMinimal}>
                <Text style={styles.statLabelMinimal}>All Time Revenue</Text>
                <Text style={styles.statValueMinimal}>
                  {`JOD ${revenueMetrics.allTimeRevenue.toFixed(0)}`}
                </Text>
              </View>
              <View style={styles.statCardMinimal}>
                <Text style={styles.statLabelMinimal}>Active Subscribers</Text>
                <Text style={styles.statValueMinimal}>
                  {revenueMetrics.activeSubscribers}
                </Text>
              </View>
            </View>

            {/* Simple revenue chart */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Revenue Trend</Text>
              {revenueMetrics.byMonth.length === 0 ? (
                <Text style={styles.emptyStateText}>No revenue data for this period.</Text>
              ) : (
                <View style={{ marginTop: 12 }}>
                  {revenueMetrics.byMonth.map((m) => {
                    const maxAmount = Math.max(
                      ...revenueMetrics.byMonth.map((x) => x.amount || 0),
                    );
                    const widthPercent =
                      maxAmount > 0 ? Math.max(5, (m.amount / maxAmount) * 100) : 0;
                    return (
                      <View key={m.monthKey} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={styles.revenueChartLabel}>{m.label}</Text>
                          <Text style={styles.revenueChartValue}>
                            {`JOD ${m.amount.toFixed(0)}`}
                          </Text>
                        </View>
                        <View style={styles.revenueChartBarBackground}>
                          <View
                            style={[
                              styles.revenueChartBarFill,
                              { width: `${widthPercent}%` },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Revenue table */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Revenue Details</Text>

              {revenueMetrics.payments.length === 0 ? (
                <Text style={styles.emptyStateText}>No payments found for this period.</Text>
              ) : (
                revenueMetrics.payments.map((p) => {
                  const user = users.find((u: any) => u.id === p.userId);
                  const date = p.createdAt
                    ? new Date(p.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : '-';
                  const plan = `${(p.tier || '').toString().toUpperCase()} ${p.duration || ''}mo`;
                  return (
                    <View key={p.id} style={styles.revenueRow}>
                      <View style={{ flex: 1.4 }}>
                        <Text style={styles.revenueRowPrimary}>{date}</Text>
                      </View>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.revenueRowPrimary}>{user?.name || 'Unknown'}</Text>
                        <Text style={styles.revenueRowSecondary}>{user?.email || ''}</Text>
                      </View>
                      <View style={{ flex: 1.8 }}>
                        <Text style={styles.revenueRowPrimary}>{plan}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.revenueRowPrimary}>
                          {`JOD ${(p.amount || 0).toFixed(0)}`}
                        </Text>
                        <Text style={styles.revenueRowSecondary}>
                          {p.paymentMethod === 'coupon' ? 'Coupon' : 'Card'}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}

        {showCouponsView && (
          <CouponsManagementSection onClose={() => setShowCouponsView(false)} />
        )}
      </ScrollView>

      <View style={styles.bottomTabs}>
        <TouchableOpacity
          style={[styles.bottomTabItem, activeTab === 'overview' && styles.bottomTabItemActive]}
          onPress={() => setActiveTab('overview')}
          activeOpacity={0.85}
        >
          <View style={[styles.bottomTabIconWrap, activeTab === 'overview' && styles.bottomTabIconWrapActive]}>
            <TrendingUp size={20} color={activeTab === 'overview' ? '#FFFFFF' : '#111827'} />
          </View>
          <Text style={[styles.bottomTabLabel, activeTab === 'overview' && styles.bottomTabLabelActive]}>
            Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomTabItem, activeTab === 'gyms' && styles.bottomTabItemActive]}
          onPress={() => setActiveTab('gyms')}
          activeOpacity={0.85}
        >
          <View style={[styles.bottomTabIconWrap, activeTab === 'gyms' && styles.bottomTabIconWrapActive]}>
            <Building2 size={20} color={activeTab === 'gyms' ? '#FFFFFF' : '#111827'} />
          </View>
          <Text style={[styles.bottomTabLabel, activeTab === 'gyms' && styles.bottomTabLabelActive]}>
            Gyms
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomTabItem, activeTab === 'users' && styles.bottomTabItemActive]}
          onPress={() => setActiveTab('users')}
          activeOpacity={0.85}
        >
          <View style={[styles.bottomTabIconWrap, activeTab === 'users' && styles.bottomTabIconWrapActive]}>
            <Users size={20} color={activeTab === 'users' ? '#FFFFFF' : '#111827'} />
          </View>
          <Text style={[styles.bottomTabLabel, activeTab === 'users' && styles.bottomTabLabelActive]}>
            Subscribers
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomTabItem, activeTab === 'checkins' && styles.bottomTabItemActive]}
          onPress={() => setActiveTab('checkins')}
          activeOpacity={0.85}
        >
          <View style={[styles.bottomTabIconWrap, activeTab === 'checkins' && styles.bottomTabIconWrapActive]}>
            <Calendar size={20} color={activeTab === 'checkins' ? '#FFFFFF' : '#111827'} />
          </View>
          <Text style={[styles.bottomTabLabel, activeTab === 'checkins' && styles.bottomTabLabelActive]}>
            Check-ins
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomTabItem, activeTab === 'payouts' && styles.bottomTabItemActive]}
          onPress={() => setActiveTab('payouts')}
          activeOpacity={0.85}
        >
          <View style={[styles.bottomTabIconWrap, activeTab === 'payouts' && styles.bottomTabIconWrapActive]}>
            <DollarSign size={20} color={activeTab === 'payouts' ? '#FFFFFF' : '#111827'} />
          </View>
          <Text style={[styles.bottomTabLabel, activeTab === 'payouts' && styles.bottomTabLabelActive]}>
            Payouts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomTabItem, activeTab === 'revenue' && styles.bottomTabItemActive]}
          onPress={() => setActiveTab('revenue')}
          activeOpacity={0.85}
        >
          <View style={[styles.bottomTabIconWrap, activeTab === 'revenue' && styles.bottomTabIconWrapActive]}>
            <TrendingUp size={20} color={activeTab === 'revenue' ? '#FFFFFF' : '#111827'} />
          </View>
          <Text style={[styles.bottomTabLabel, activeTab === 'revenue' && styles.bottomTabLabelActive]}>
            Revenue
          </Text>
        </TouchableOpacity>
      </View>

      {/* Add Gym Modal */}
      <Modal
        visible={showAddGymModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddGymModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingGymId ? 'Edit Gym' : gymCreationStep === 'details' ? 'Add Gym Details' : gymCreationStep === 'pricing' ? 'Pricing' : 'Review'}
              </Text>
              <TouchableOpacity onPress={() => {
                setShowAddGymModal(false);
                resetGymForm();
              }}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Step Indicator */}
            {!editingGymId && (
              <View style={styles.stepIndicator}>
                <View style={[styles.stepDot, gymCreationStep === 'details' && styles.stepDotActive]} />
                <View style={styles.stepLine} />
                <View style={[styles.stepDot, gymCreationStep === 'pricing' && styles.stepDotActive]} />
                <View style={styles.stepLine} />
                <View style={[styles.stepDot, gymCreationStep === 'review' && styles.stepDotActive]} />
              </View>
            )}

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Details Step */}
              {(gymCreationStep === 'details' || editingGymId) && (
                <>
              <Text style={styles.label}>Gym Name *</Text>
              <TextInput
                style={styles.input}
                value={newGym.name}
                onChangeText={(text) => setNewGym({ ...newGym, name: text })}
                placeholder="Enter gym name"
              />

              <Text style={styles.label}>Address *</Text>
              <TextInput
                style={styles.input}
                value={newGym.address}
                onChangeText={(text) => setNewGym({ ...newGym, address: text })}
                placeholder="Enter address"
              />

              <Text style={styles.label}>City *</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setIsCityModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={newGym.city ? styles.inputText : styles.inputPlaceholder}>
                  {newGym.city || 'Select city'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.label}>Location *</Text>
              <TouchableOpacity style={styles.mapButton} onPress={openMapModal}>
                <MapPin size={20} color="#fff" />
                <Text style={styles.mapButtonText}>Select on Google Maps</Text>
              </TouchableOpacity>
              {newGym.latitude && newGym.longitude ? (
                <Text style={styles.locationSummary}>
                  Selected location: {parseFloat(newGym.latitude).toFixed(4)}, {parseFloat(newGym.longitude).toFixed(4)}
                </Text>
              ) : (
                <Text style={styles.locationSummaryMuted}>No location selected yet</Text>
              )}

              <Text style={styles.label}>Category *</Text>
              <View style={styles.categoryContainer}>
                {(['standard', 'premium', 'diamond', 'elite'] as GymCategory[]).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryButton,
                      newGym.category === cat && styles.categoryButtonActive,
                    ]}
                    onPress={() => setNewGym({ ...newGym, category: cat })}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        newGym.category === cat && styles.categoryTextActive,
                      ]}
                    >
                      {cat.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Allowed Subscription Tiers</Text>
              <View style={styles.tierContainer}>
                {(['silver', 'gold', 'diamond', 'elite'] as SubscriptionTier[]).map((tier) => (
                  <TouchableOpacity
                    key={tier}
                    style={[
                      styles.tierButton,
                      newGym.allowedTiers.includes(tier) && styles.tierButtonActive,
                    ]}
                    onPress={() => toggleTier(tier)}
                  >
                    <Text
                      style={[
                        styles.tierText,
                        newGym.allowedTiers.includes(tier) && styles.tierTextActive,
                      ]}
                    >
                      {tier.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Facilities *</Text>
              <Text style={styles.helperText}>Select facilities available at this gym</Text>
              <View style={styles.facilitiesContainer}>
                {[
                  'Pool',
                  'Sauna',
                  'Steam Room',
                  'Jacuzzi',
                  'Running Track',
                  'Cardio Zone',
                  'Strength & Weight Training',
                  'Calisthenics',
                  'Instructor-Led Classes',
                ].map((facility) => (
                  <TouchableOpacity
                    key={facility}
                    style={[
                      styles.facilityButton,
                      newGym.facilities.includes(facility) && styles.facilityButtonActive,
                    ]}
                    onPress={() => {
                      const currentFacilities = [...newGym.facilities];
                      if (currentFacilities.includes(facility)) {
                        setNewGym({
                          ...newGym,
                          facilities: currentFacilities.filter((f) => f !== facility),
                        });
                      } else {
                        setNewGym({
                          ...newGym,
                          facilities: [...currentFacilities, facility],
                        });
                      }
                    }}
                  >
                    <Text
                      style={[
                        styles.facilityButtonText,
                        newGym.facilities.includes(facility) && styles.facilityButtonTextActive,
                      ]}
                    >
                      {facility}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Timings</Text>
              
              {/* Men Timings */}
              <View style={styles.timingRow}>
                <Text style={styles.timingLabel}>Men</Text>
                <View style={styles.timingInputs}>
                  <View style={styles.timingField}>
                    <TextInput
                      style={styles.timingInput}
                      value={newGym.timings.men.from}
                      onChangeText={(text) =>
                        setNewGym({
                          ...newGym,
                          timings: {
                            ...newGym.timings,
                            men: { ...newGym.timings.men, from: text },
                          },
                        })
                      }
                      placeholder="From"
                      placeholderTextColor="#9CA3AF"
                    />
                    <View style={styles.periodToggleRow}>
                      {(['AM', 'PM'] as const).map((period) => {
                        const current = (newGym.timings.men.from || '').trim().split(/\s+/).pop()?.toUpperCase();
                        const isSelected = current === period;
                        return (
                          <TouchableOpacity
                            key={`men-from-${period}`}
                            style={[
                              styles.periodButton,
                              isSelected && styles.periodButtonActive,
                            ]}
                            onPress={() =>
                              setNewGym((prev) => {
                                const currentValue = prev.timings.men.from || '';
                                const parts = currentValue.trim().split(/\s+/);
                                const base = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
                                const next = base ? `${base} ${period}` : period;
                                return {
                                  ...prev,
                                  timings: {
                                    ...prev.timings,
                                    men: { ...prev.timings.men, from: next },
                                  },
                                };
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.periodButtonText,
                                isSelected && styles.periodButtonTextActive,
                              ]}
                            >
                              {period}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  <View style={styles.timingField}>
                    <TextInput
                      style={styles.timingInput}
                      value={newGym.timings.men.to}
                      onChangeText={(text) =>
                        setNewGym({
                          ...newGym,
                          timings: {
                            ...newGym.timings,
                            men: { ...newGym.timings.men, to: text },
                          },
                        })
                      }
                      placeholder="To"
                      placeholderTextColor="#9CA3AF"
                    />
                    <View style={styles.periodToggleRow}>
                      {(['AM', 'PM'] as const).map((period) => {
                        const current = (newGym.timings.men.to || '').trim().split(/\s+/).pop()?.toUpperCase();
                        const isSelected = current === period;
                        return (
                          <TouchableOpacity
                            key={`men-to-${period}`}
                            style={[
                              styles.periodButton,
                              isSelected && styles.periodButtonActive,
                            ]}
                            onPress={() =>
                              setNewGym((prev) => {
                                const currentValue = prev.timings.men.to || '';
                                const parts = currentValue.trim().split(/\s+/);
                                const base = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
                                const next = base ? `${base} ${period}` : period;
                                return {
                                  ...prev,
                                  timings: {
                                    ...prev.timings,
                                    men: { ...prev.timings.men, to: next },
                                  },
                                };
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.periodButtonText,
                                isSelected && styles.periodButtonTextActive,
                              ]}
                            >
                              {period}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>

              {/* Women Timings */}
              <View style={styles.timingRow}>
                <Text style={styles.timingLabel}>Women</Text>
                <View style={styles.timingInputs}>
                  <View style={styles.timingField}>
                    <TextInput
                      style={styles.timingInput}
                      value={newGym.timings.women.from}
                      onChangeText={(text) =>
                        setNewGym({
                          ...newGym,
                          timings: {
                            ...newGym.timings,
                            women: { ...newGym.timings.women, from: text },
                          },
                        })
                      }
                      placeholder="From"
                      placeholderTextColor="#9CA3AF"
                    />
                    <View style={styles.periodToggleRow}>
                      {(['AM', 'PM'] as const).map((period) => {
                        const current = (newGym.timings.women.from || '').trim().split(/\s+/).pop()?.toUpperCase();
                        const isSelected = current === period;
                        return (
                          <TouchableOpacity
                            key={`women-from-${period}`}
                            style={[
                              styles.periodButton,
                              isSelected && styles.periodButtonActive,
                            ]}
                            onPress={() =>
                              setNewGym((prev) => {
                                const currentValue = prev.timings.women.from || '';
                                const parts = currentValue.trim().split(/\s+/);
                                const base = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
                                const next = base ? `${base} ${period}` : period;
                                return {
                                  ...prev,
                                  timings: {
                                    ...prev.timings,
                                    women: { ...prev.timings.women, from: next },
                                  },
                                };
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.periodButtonText,
                                isSelected && styles.periodButtonTextActive,
                              ]}
                            >
                              {period}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  <View style={styles.timingField}>
                    <TextInput
                      style={styles.timingInput}
                      value={newGym.timings.women.to}
                      onChangeText={(text) =>
                        setNewGym({
                          ...newGym,
                          timings: {
                            ...newGym.timings,
                            women: { ...newGym.timings.women, to: text },
                          },
                        })
                      }
                      placeholder="To"
                      placeholderTextColor="#9CA3AF"
                    />
                    <View style={styles.periodToggleRow}>
                      {(['AM', 'PM'] as const).map((period) => {
                        const current = (newGym.timings.women.to || '').trim().split(/\s+/).pop()?.toUpperCase();
                        const isSelected = current === period;
                        return (
                          <TouchableOpacity
                            key={`women-to-${period}`}
                            style={[
                              styles.periodButton,
                              isSelected && styles.periodButtonActive,
                            ]}
                            onPress={() =>
                              setNewGym((prev) => {
                                const currentValue = prev.timings.women.to || '';
                                const parts = currentValue.trim().split(/\s+/);
                                const base = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
                                const next = base ? `${base} ${period}` : period;
                                return {
                                  ...prev,
                                  timings: {
                                    ...prev.timings,
                                    women: { ...prev.timings.women, to: next },
                                  },
                                };
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.periodButtonText,
                                isSelected && styles.periodButtonTextActive,
                              ]}
                            >
                              {period}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>

              {/* Mixed Timings */}
              <View style={styles.timingRow}>
                <Text style={styles.timingLabel}>Mixed</Text>
                <View style={styles.timingInputs}>
                  <View style={styles.timingField}>
                    <TextInput
                      style={styles.timingInput}
                      value={newGym.timings.mixed.from}
                      onChangeText={(text) =>
                        setNewGym({
                          ...newGym,
                          timings: {
                            ...newGym.timings,
                            mixed: { ...newGym.timings.mixed, from: text },
                          },
                        })
                      }
                      placeholder="From"
                      placeholderTextColor="#9CA3AF"
                    />
                    <View style={styles.periodToggleRow}>
                      {(['AM', 'PM'] as const).map((period) => {
                        const current = (newGym.timings.mixed.from || '').trim().split(/\s+/).pop()?.toUpperCase();
                        const isSelected = current === period;
                        return (
                          <TouchableOpacity
                            key={`mixed-from-${period}`}
                            style={[
                              styles.periodButton,
                              isSelected && styles.periodButtonActive,
                            ]}
                            onPress={() =>
                              setNewGym((prev) => {
                                const currentValue = prev.timings.mixed.from || '';
                                const parts = currentValue.trim().split(/\s+/);
                                const base = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
                                const next = base ? `${base} ${period}` : period;
                                return {
                                  ...prev,
                                  timings: {
                                    ...prev.timings,
                                    mixed: { ...prev.timings.mixed, from: next },
                                  },
                                };
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.periodButtonText,
                                isSelected && styles.periodButtonTextActive,
                              ]}
                            >
                              {period}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  <View style={styles.timingField}>
                    <TextInput
                      style={styles.timingInput}
                      value={newGym.timings.mixed.to}
                      onChangeText={(text) =>
                        setNewGym({
                          ...newGym,
                          timings: {
                            ...newGym.timings,
                            mixed: { ...newGym.timings.mixed, to: text },
                          },
                        })
                      }
                      placeholder="To"
                      placeholderTextColor="#9CA3AF"
                    />
                    <View style={styles.periodToggleRow}>
                      {(['AM', 'PM'] as const).map((period) => {
                        const current = (newGym.timings.mixed.to || '').trim().split(/\s+/).pop()?.toUpperCase();
                        const isSelected = current === period;
                        return (
                          <TouchableOpacity
                            key={`mixed-to-${period}`}
                            style={[
                              styles.periodButton,
                              isSelected && styles.periodButtonActive,
                            ]}
                            onPress={() =>
                              setNewGym((prev) => {
                                const currentValue = prev.timings.mixed.to || '';
                                const parts = currentValue.trim().split(/\s+/);
                                const base = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '';
                                const next = base ? `${base} ${period}` : period;
                                return {
                                  ...prev,
                                  timings: {
                                    ...prev.timings,
                                    mixed: { ...prev.timings.mixed, to: next },
                                  },
                                };
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.periodButtonText,
                                isSelected && styles.periodButtonTextActive,
                              ]}
                            >
                              {period}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>

              {/* Open Days */}
              <Text style={[styles.label, { marginTop: 16 }]}>Open Days</Text>
              <Text style={styles.helperText}>Select the days of the week the gym is open</Text>
              <View style={styles.openDaysContainer}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                  const isSelected = newGym.openDays?.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.openDayButton,
                        isSelected && styles.openDayButtonActive,
                      ]}
                      onPress={() =>
                        setNewGym((prev) => {
                          const current = prev.openDays || [];
                          const exists = current.includes(day);
                          const next = exists
                            ? current.filter((d) => d !== day)
                            : [...current, day];
                          return { ...prev, openDays: next };
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.openDayText,
                          isSelected && styles.openDayTextActive,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Access Checkboxes */}
              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() =>
                    setNewGym((prev) => {
                      const nextMenOnly = !prev.menOnly;
                      return {
                        ...prev,
                        menOnly: nextMenOnly,
                        womenOnly: nextMenOnly ? false : prev.womenOnly,
                      };
                    })
                  }
                >
                  <View style={[styles.checkbox, newGym.menOnly && styles.checkboxChecked]}>
                    {newGym.menOnly && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Men only</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() =>
                    setNewGym((prev) => {
                      const nextWomenOnly = !prev.womenOnly;
                      return {
                        ...prev,
                        womenOnly: nextWomenOnly,
                        menOnly: nextWomenOnly ? false : prev.menOnly,
                      };
                    })
                  }
                >
                  <View style={[styles.checkbox, newGym.womenOnly && styles.checkboxChecked]}>
                    {newGym.womenOnly && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Women only</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Gym Logo</Text>
              <TouchableOpacity style={styles.uploadButton} onPress={handlePickImage}>
                <ImageIcon size={20} color="#fff" />
                <Text style={styles.uploadButtonText}>Upload Logo</Text>
              </TouchableOpacity>
              {newGym.imageUrl && !newGym.imageUrl.startsWith('blob:') ? (
                <View style={styles.logoWrapper}>
                  <Image
                    source={{ uri: newGym.imageUrl }}
                    style={styles.logoPreview}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.logoRemoveButton}
                    onPress={() => setNewGym((prev) => ({ ...prev, imageUrl: '' }))}
                  >
                    <X size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.locationSummaryMuted}>No logo selected</Text>
              )}

              <TouchableOpacity
                style={[styles.uploadButton, { marginTop: 8 }]}
                onPress={handleUploadGymImages}
                disabled={isUploadingGymImages}
              >
                <ImageIcon size={20} color="#fff" />
                <Text style={styles.uploadButtonText}>
                  {isUploadingGymImages ? 'Uploading Images...' : 'Upload Images'}
                </Text>
              </TouchableOpacity>
              {Array.isArray(newGym.gymImages) && newGym.gymImages.length > 0 && (
                <Text style={styles.locationSummaryMuted}>
                  {newGym.gymImages.length} image{newGym.gymImages.length === 1 ? '' : 's'} uploaded
                </Text>
              )}

              <Text style={styles.label}>Owner Email *</Text>
              <TextInput
                style={styles.input}
                value={newGym.email}
                onChangeText={(text) => setNewGym({ ...newGym, email: text })}
                placeholder="owner@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.label}>Owner Name *</Text>
              <TextInput
                style={styles.input}
                value={newGym.ownerName}
                onChangeText={(text) => setNewGym({ ...newGym, ownerName: text })}
                placeholder="Gym Owner Name"
              />

              <Text style={styles.label}>Owner Phone (Admin only)</Text>
              <TextInput
                style={styles.input}
                value={newGym.ownerPhone}
                onChangeText={(text) => setNewGym({ ...newGym, ownerPhone: text })}
                placeholder="+962 7X XXX XXXX"
                keyboardType="phone-pad"
              />

              {/* Show credentials and QR code when editing */}
              {editingGymId && editingGymCredentials && (
                <>
                  <View style={styles.credentialsSectionEdit}>
                    <Text style={styles.credentialsTitleEdit}>Gym Owner Credentials</Text>
                    
                    <View style={styles.credentialItem}>
                      <Text style={styles.credentialLabel}>Username:</Text>
                      <View style={styles.credentialValueContainer}>
                        <Text style={styles.credentialValue}>{editingGymCredentials.username}</Text>
                        <TouchableOpacity
                          style={styles.copyButton}
                          onPress={() => copyToClipboard(editingGymCredentials.username)}
                        >
                          <Copy size={16} color="#4F46E5" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.credentialItem}>
                      <Text style={styles.credentialLabel}>Password:</Text>
                      <View style={styles.credentialValueContainer}>
                        <Text style={styles.credentialValue}>{editingGymCredentials.password}</Text>
                        <TouchableOpacity
                          style={styles.copyButton}
                          onPress={() => copyToClipboard(editingGymCredentials.password)}
                        >
                          <Copy size={16} color="#4F46E5" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* QR Code Section */}
                  <View style={styles.qrSectionEdit}>
                    <QrCode size={24} color="#4F46E5" />
                    <Text style={styles.qrTitleEdit}>Gym QR Code</Text>
                    <Text style={styles.qrSubtextEdit}>
                      Members can scan this code to check in
                    </Text>
                    <View style={styles.qrContainer}>
                      <Image
                        source={{
                          uri: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=xpass-gym-${editingGymId}`,
                        }}
                        style={styles.qrImage}
                      />
                    </View>
                    <Text style={styles.qrData}>xpass-gym-{editingGymId}</Text>
                    <TouchableOpacity
                      style={styles.downloadQRButton}
                      onPress={() => downloadQRCode(editingGymId, newGym.name)}
                    >
                      <Download size={18} color="#fff" />
                      <Text style={styles.downloadQRButtonText}>Download QR</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Pay Per Visit Field - Show when editing */}
              {editingGymId && (
                <>
                  <Text style={styles.label}>Pay Per Visit (JOD) *</Text>
                  <Text style={styles.helperText}>Amount XPASS pays the gym per check-in</Text>
                  <TextInput
                    style={styles.input}
                    value={newGym.pricePerVisit}
                    onChangeText={(text) => setNewGym({ ...newGym, pricePerVisit: text.replace(/[^0-9.]/g, '') })}
                    placeholder="Enter pay per visit amount"
                    keyboardType="decimal-pad"
                  />
                </>
              )}
                </>
              )}

              {/* Pricing Step */}
              {!editingGymId && gymCreationStep === 'pricing' && (
                <>
                  <Text style={styles.sectionTitle}>Membership Model</Text>
                  <View style={styles.radioContainer}>
                    <TouchableOpacity
                      style={styles.radioRow}
                      onPress={() => setNewGym({ ...newGym, membershipModel: 'pay_per_visit' })}
                    >
                      <View style={styles.radio}>
                        {newGym.membershipModel === 'pay_per_visit' && <View style={styles.radioSelected} />}
                      </View>
                      <Text style={styles.radioLabel}>Pay-Per-Visit</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.label}>Price Per Visit *</Text>
                  <Text style={styles.helperText}>Amount XPASS pays the gym per check-in (JOD)</Text>
                  <TextInput
                    style={styles.input}
                    value={newGym.pricePerVisit}
                    onChangeText={(text) => setNewGym({ ...newGym, pricePerVisit: text.replace(/[^0-9.]/g, '') })}
                    placeholder="Enter price per visit"
                    keyboardType="decimal-pad"
                  />
                </>
              )}

              {/* Review Step */}
              {!editingGymId && gymCreationStep === 'review' && (
                <>
                  <Text style={styles.sectionTitle}>Review Gym Details</Text>
                  
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>Gym Name:</Text>
                    <Text style={styles.reviewValue}>{newGym.name}</Text>
                  </View>
                  
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>Address:</Text>
                    <Text style={styles.reviewValue}>{newGym.address}</Text>
                  </View>
                  
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>City:</Text>
                    <Text style={styles.reviewValue}>{newGym.city}</Text>
                  </View>
                  
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>Category:</Text>
                    <Text style={styles.reviewValue}>{newGym.category.toUpperCase()}</Text>
                  </View>
                  
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>Membership Model:</Text>
                    <Text style={styles.reviewValue}>Pay-Per-Visit</Text>
                  </View>
                  
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>Price Per Visit:</Text>
                    <Text style={styles.reviewValue}>{newGym.pricePerVisit} JOD</Text>
                  </View>
                  
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>Owner Name:</Text>
                    <Text style={styles.reviewValue}>{newGym.ownerName}</Text>
                  </View>
                  
                  <View style={styles.reviewSection}>
                    <Text style={styles.reviewLabel}>Owner Email:</Text>
                    <Text style={styles.reviewValue}>{newGym.email}</Text>
                  </View>
                </>
              )}

              {/* Navigation Buttons */}
              {!editingGymId && (
                <View style={styles.stepButtons}>
                  {gymCreationStep !== 'details' && (
                    <TouchableOpacity
                      style={styles.backButton}
                      onPress={handleBackStep}
                    >
                      <Text style={styles.backButtonText}>
                        {gymCreationStep === 'review' ? 'Back to Pricing' : 'Back to Facilities'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {gymCreationStep !== 'review' ? (
                    <TouchableOpacity
                      style={[styles.nextButton, gymCreationStep === 'details' && styles.nextButtonFull]}
                      onPress={handleNextStep}
                    >
                      <Text style={styles.nextButtonText}>
                        {gymCreationStep === 'details' ? 'Continue to Pricing' : 'Continue to Review'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.submitButton, isCreatingGym && { opacity: 0.6 }]}
                      onPress={handleAddGym}
                      disabled={isCreatingGym}
                    >
                      {isCreatingGym ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.submitButtonText}>Add Gym</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Edit Mode Submit Button */}
              {editingGymId && (
                <>
                  <TouchableOpacity
                    style={[styles.submitButton, isCreatingGym && { opacity: 0.6 }]}
                    onPress={handleAddGym}
                    disabled={isCreatingGym}
                  >
                    {isCreatingGym ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.submitButtonText}>Save Changes</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={handleDeleteGym}
                    disabled={isCreatingGym}
                  >
                    <Text style={styles.deleteButtonText}>Delete Gym</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Check-in details modal */}
      <Modal
        visible={!!selectedCheckIn}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedCheckIn(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.checkInDetailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Check-in Details</Text>
              <TouchableOpacity onPress={() => setSelectedCheckIn(null)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {selectedCheckIn && (
              <View style={styles.checkInDetailBody}>
                <Text style={styles.checkInDetailLabel}>User name</Text>
                <Text style={styles.checkInDetailValue}>{selectedCheckIn.userName || 'N/A'}</Text>

                <Text style={styles.checkInDetailLabel}>Email</Text>
                <Text style={styles.checkInDetailValue}>{selectedCheckIn.userEmail || 'N/A'}</Text>

                <Text style={styles.checkInDetailLabel}>Gym</Text>
                <Text style={styles.checkInDetailValue}>{selectedCheckIn.gymName || 'N/A'}</Text>

                <Text style={styles.checkInDetailLabel}>Tier</Text>
                <Text style={styles.checkInDetailValue}>
                  {selectedCheckIn.tier ? selectedCheckIn.tier.toUpperCase() : 'N/A'}
                </Text>

                <Text style={styles.checkInDetailLabel}>Date & time</Text>
                <Text style={styles.checkInDetailValue}>
                  {new Date(selectedCheckIn.timestamp).toLocaleString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Subscriber Details Modal */}
      <Modal
        visible={!!selectedSubscriber}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedSubscriber(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.checkInDetailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Subscriber Details</Text>
              <TouchableOpacity onPress={() => setSelectedSubscriber(null)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {selectedSubscriber && (
              <ScrollView style={styles.checkInDetailBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.checkInDetailLabel}>Name</Text>
                <Text style={styles.checkInDetailValue}>{selectedSubscriber.name || 'N/A'}</Text>

                <Text style={styles.checkInDetailLabel}>Email</Text>
                <Text style={styles.checkInDetailValue}>{selectedSubscriber.email || 'N/A'}</Text>

                <Text style={styles.checkInDetailLabel}>Phone</Text>
                <Text style={styles.checkInDetailValue}>{selectedSubscriber.phone || 'N/A'}</Text>

                <Text style={styles.checkInDetailLabel}>Age</Text>
                <Text style={styles.checkInDetailValue}>{selectedSubscriber.age || 'N/A'}</Text>

                {selectedSubscriber.subscription && (
                  <>
                    <Text style={styles.checkInDetailLabel}>Subscription Tier</Text>
                    <Text style={styles.checkInDetailValue}>
                      {selectedSubscriber.subscription.tier
                        ? selectedSubscriber.subscription.tier.toUpperCase()
                        : 'N/A'}
                    </Text>

                    <Text style={styles.checkInDetailLabel}>Subscription Duration</Text>
                    <Text style={styles.checkInDetailValue}>
                      {selectedSubscriber.subscription.duration
                        ? `${selectedSubscriber.subscription.duration} month(s)`
                        : 'N/A'}
                    </Text>

                    <Text style={styles.checkInDetailLabel}>Subscription Status</Text>
                    <Text
                      style={[
                        styles.checkInDetailValue,
                        new Date(selectedSubscriber.subscription.endDate) < new Date()
                          ? { color: '#DC2626' }
                          : { color: '#059669' },
                      ]}
                    >
                      {new Date(selectedSubscriber.subscription.endDate) < new Date()
                        ? 'Expired'
                        : `${Math.ceil(
                            (new Date(selectedSubscriber.subscription.endDate).getTime() -
                              new Date().getTime()) /
                              (1000 * 60 * 60 * 24)
                          )} days remaining`}
                    </Text>

                    <Text style={styles.checkInDetailLabel}>Subscription Start Date</Text>
                    <Text style={styles.checkInDetailValue}>
                      {selectedSubscriber.subscription.startDate
                        ? new Date(selectedSubscriber.subscription.startDate).toLocaleDateString(
                            'en-US',
                            {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            }
                          )
                        : 'N/A'}
                    </Text>

                    <Text style={styles.checkInDetailLabel}>Subscription End Date</Text>
                    <Text style={styles.checkInDetailValue}>
                      {selectedSubscriber.subscription.endDate
                        ? new Date(selectedSubscriber.subscription.endDate).toLocaleDateString(
                            'en-US',
                            {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            }
                          )
                        : 'N/A'}
                    </Text>
                  </>
                )}

                <Text style={styles.checkInDetailLabel}>Wallet Balance</Text>
                <Text style={styles.checkInDetailValue}>
                  JOD {selectedSubscriber.walletBalance || 0}
                </Text>

                <Text style={styles.checkInDetailLabel}>Referral Code</Text>
                <Text style={styles.checkInDetailValue}>
                  {selectedSubscriber.referralCode || 'N/A'}
                </Text>

                {selectedSubscriber.referredBy && (
                  <>
                    <Text style={styles.checkInDetailLabel}>Referred By</Text>
                    <Text style={styles.checkInDetailValue}>
                      {selectedSubscriber.referredBy}
                    </Text>
                  </>
                )}

                {selectedSubscriber.createdAt && (
                  <>
                    <Text style={styles.checkInDetailLabel}>Member Since</Text>
                    <Text style={styles.checkInDetailValue}>
                      {new Date(selectedSubscriber.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </Text>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* City Picker Modal */}
      <Modal
        visible={isCityModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsCityModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.cityModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select City</Text>
              <TouchableOpacity onPress={() => setIsCityModalVisible(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {FIXED_CITIES.map((city) => {
                const isSelected = newGym.city === city;
                return (
                  <TouchableOpacity
                    key={city}
                    style={[styles.cityOption, isSelected && styles.cityOptionSelected]}
                    onPress={() => {
                      setNewGym({ ...newGym, city });
                      setIsCityModalVisible(false);
                    }}
                  >
                    <Text
                      style={[styles.cityOptionText, isSelected && styles.cityOptionTextSelected]}
                    >
                      {city}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Map Picker Modal */}
      <Modal
        visible={isMapModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsMapModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.mapModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Gym Location</Text>
              <TouchableOpacity onPress={() => setIsMapModalVisible(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <GymLocationPicker
              coordinate={tempLocation}
              onChange={setTempLocation}
              onSelectPlace={(place) => {
                // Auto-fill gym name and address when a place is selected
                setNewGym({
                  ...newGym,
                  name: place.name || newGym.name,
                  address: place.address || newGym.address,
                });
                setTempLocation({
                  latitude: place.latitude,
                  longitude: place.longitude,
                });
              }}
            />
            <View style={styles.mapFooter}>
              <Text style={styles.locationSummary}>
                {tempLocation.latitude.toFixed(4)}, {tempLocation.longitude.toFixed(4)}
              </Text>
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmLocation}>
                <Text style={styles.confirmButtonText}>Use this location</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal with QR Code */}
      <Modal
        visible={showSuccessModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleSuccessModalClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.successHeader}>
                <CheckCircle size={32} color="#10B981" />
                <Text style={styles.successTitle}>Gym Added Successfully!</Text>
              </View>
              <TouchableOpacity onPress={handleSuccessModalClose}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.successScrollView} showsVerticalScrollIndicator={false}>
              {createdGymData && (
                <>
                  <View style={styles.successInfo}>
                    <Text style={styles.successGymName}>{createdGymData.gymName}</Text>
                    <Text style={styles.successSubtext}>Gym ID: {createdGymData.gymId}</Text>
                  </View>

                  {/* QR Code Section */}
                  <View style={styles.qrSection}>
                    <QrCode size={24} color="#4F46E5" />
                    <Text style={styles.qrTitle}>Gym QR Code</Text>
                    <Text style={styles.qrSubtext}>
                      Members can scan this code to check in
                    </Text>
                    <View style={styles.qrContainer}>
                      <Image
                        source={{
                          uri: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=xpass-gym-${createdGymData.gymId}`,
                        }}
                        style={styles.qrImage}
                      />
                    </View>
                    <Text style={styles.qrData}>xpass-gym-{createdGymData.gymId}</Text>
                    <TouchableOpacity
                      style={styles.downloadQRButton}
                      onPress={() => downloadQRCode(createdGymData.gymId, createdGymData.gymName)}
                    >
                      <Download size={18} color="#fff" />
                      <Text style={styles.downloadQRButtonText}>Download QR</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Owner Credentials Section */}
                  <View style={styles.credentialsSection}>
                    <Text style={styles.credentialsTitle}>Gym Owner Credentials</Text>
                    <Text style={styles.credentialsSubtext}>
                      Share these credentials with the gym owner
                    </Text>

                    <View style={styles.credentialItem}>
                      <Text style={styles.credentialLabel}>Username:</Text>
                      <View style={styles.credentialValueContainer}>
                        <Text style={styles.credentialValue}>{createdGymData.username}</Text>
                        <TouchableOpacity
                          style={styles.copyButton}
                          onPress={() => copyToClipboard(createdGymData.username)}
                        >
                          <Copy size={16} color="#4F46E5" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.credentialItem}>
                      <Text style={styles.credentialLabel}>Password:</Text>
                      <View style={styles.credentialValueContainer}>
                        <Text style={styles.credentialValue}>{createdGymData.password}</Text>
                        <TouchableOpacity
                          style={styles.copyButton}
                          onPress={() => copyToClipboard(createdGymData.password)}
                        >
                          <Copy size={16} color="#4F46E5" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.copyAllButton}
                      onPress={() =>
                        copyToClipboard(
                          `Username: ${createdGymData.username}\nPassword: ${createdGymData.password}`
                        )
                      }
                    >
                      <Copy size={18} color="#fff" />
                      <Text style={styles.copyAllText}>Copy All Credentials</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.successFooter}>
              <TouchableOpacity
                style={styles.successButton}
                onPress={handleSuccessModalClose}
              >
                <LinearGradient colors={['#10B981', '#059669']} style={styles.successButtonGradient}>
                  <Text style={styles.successButtonText}>Done</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: '#FFFFFF',
  },
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
  brandRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  brandLogo: {
    width: 28,
    height: 28,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: '#111827',
    letterSpacing: 0.4,
  },
  topBarRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  profilePill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  header: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 32,
    alignItems: 'center' as const,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: '#fff',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#FEE2E2',
    marginTop: 8,
  },
  tabsContainer: {
    display: 'none',
  },
  tab: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#DC2626',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#DC2626',
  },
  content: {
    padding: 20,
  },
  pageHeaderBlock: {
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#111827',
    marginBottom: 2,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  statsGrid2x2: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 10,
  },
  statCardMinimal: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 16,
  },
  statLabelMinimal: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600' as const,
  },
  statValueMinimal: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: '800' as const,
    color: '#111827',
  },
  primaryCta: {
    marginTop: 16,
    backgroundColor: '#E31E24',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center' as const,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800' as const,
  },
  payoutRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  payoutGymName: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600' as const,
    flex: 1,
    paddingRight: 10,
  },
  payoutAmount: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '800' as const,
  },
  payoutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 12,
  },
  payoutHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  payoutStatusBadgePending: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
  },
  payoutStatusTextPending: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#92400E',
    textTransform: 'uppercase' as const,
  },
  payoutStatusBadgePaid: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
  },
  payoutStatusTextPaid: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#166534',
    textTransform: 'uppercase' as const,
  },
  payoutMetaRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: 4,
  },
  payoutLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500' as const,
  },
  payoutValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600' as const,
  },
  markPaidButton: {
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: '#111827',
    paddingVertical: 10,
    alignItems: 'center' as const,
  },
  markPaidButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  secondaryButton: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    paddingVertical: 14,
    alignItems: 'center' as const,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#111827',
  },
  listCount: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600' as const,
  },
  gymRowCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 12,
    marginBottom: 12,
  },
  gymThumb: {
    width: 72,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  gymRowInfo: {
    flex: 1,
    marginLeft: 12,
  },
  gymRowTop: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  amenitiesPills: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#111827',
  },
  editPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignSelf: 'flex-start' as const,
  },
  editPillText: {
    color: '#FFFFFF',
    fontWeight: '800' as const,
    fontSize: 12,
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
  bottomTabItem: {
    flex: 1,
    alignItems: 'center' as const,
    gap: 6,
  },
  bottomTabItemActive: {},
  bottomTabIconWrap: {
    width: 46,
    height: 34,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'transparent',
  },
  bottomTabIconWrapActive: {
    backgroundColor: '#111827',
  },
  bottomTabLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '700' as const,
  },
  bottomTabLabelActive: {
    color: '#111827',
  },
  statsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center' as const,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#111827',
    marginBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    paddingVertical: 2,
  },
  userFilterRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 12,
  },
  userFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  userFilterChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  userFilterChipText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#4B5563',
  },
  userFilterChipTextActive: {
    color: '#FFFFFF',
  },
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  activityHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 8,
  },
  activityInfo: {
    flex: 1,
  },
  activityUser: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  activityGym: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  dateFilterRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
    gap: 8,
  },
  dateFilterLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  dateFilterInput: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierText: {
    fontSize: 11,
    fontWeight: 'bold' as const,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  userHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 12,
  },
  userIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  userEmail: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 6,
  },
  userPhone: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  subscriptionInfo: {
    marginTop: 6,
  },
  expiredText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600' as const,
  },
  daysRemainingText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600' as const,
  },
  userStats: {
    flexDirection: 'row' as const,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  userStat: {
    flex: 1,
  },
  userStatLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  userStatValue: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  gymCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  gymHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 12,
  },
  gymIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  gymInfo: {
    flex: 1,
  },
  gymName: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  gymAddress: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  gymStats: {
    flexDirection: 'row' as const,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  gymStat: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  gymStatText: {
    fontSize: 14,
    color: '#6B7280',
  },
  checkInCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  checkInHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 8,
  },
  checkInInfo: {
    flex: 1,
  },
  checkInUser: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1F2937',
  },
  checkInGym: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  checkInTime: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600' as const,
  },
  checkInDate: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600' as const,
  },
  checkInTimeRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  todayCheckInsSection: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  todayHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  todayToggleText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500' as const,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#111827',
    marginBottom: 12,
  },
  allCheckInsTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#111827',
    marginTop: 8,
    marginBottom: 12,
  },
  moreCheckInsText: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic' as const,
    marginTop: 8,
    textAlign: 'center' as const,
  },
  checkInTime: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600' as const,
  },
  checkInDate: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600' as const,
  },
  checkInTimeRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginTop: 8,
  },
  // (duplicate keys removed above – keep single definition)
  addButton: {
    backgroundColor: '#DC2626',
    padding: 8,
    borderRadius: 8,
  },
  addButtonIcon: {
    backgroundColor: '#DC2626',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalScrollView: {
    maxHeight: 600,
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  checkInDetailModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#1F2937',
  },
  modalBody: {
    padding: 20,
  },
  checkInDetailBody: {
    padding: 20,
    gap: 8,
  },
  checkInDetailLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#6B7280',
    textTransform: 'uppercase' as const,
  },
  checkInDetailValue: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: '#111827',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#374151',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  row: {
    flexDirection: 'row' as const,
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  mapButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  mapButtonText: {
    color: '#fff',
    fontWeight: '600' as const,
  },
  locationSummary: {
    marginTop: 8,
    fontSize: 14,
    color: '#1F2937',
  },
  locationSummaryMuted: {
    marginTop: 8,
    fontSize: 14,
    color: '#9CA3AF',
  },
  categoryContainer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  categoryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryButtonActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  categoryTextActive: {
    color: '#fff',
  },
  tierContainer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  tierButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tierButtonActive: {
    backgroundColor: '#9333EA',
    borderColor: '#9333EA',
  },
  tierText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  tierTextActive: {
    color: '#fff',
  },
  timingRow: {
    marginTop: 12,
  },
  timingLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#111827',
    marginBottom: 8,
  },
  timingInputs: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  timingField: {
    flex: 1,
  },
  timingInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
  },
  periodToggleRow: {
    flexDirection: 'row' as const,
    gap: 6,
    marginTop: 6,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center' as const,
  },
  periodButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: '#4B5563',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  inputText: {
    fontSize: 14,
    color: '#111827',
  },
  inputPlaceholder: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  checkboxContainer: {
    marginTop: 16,
    gap: 12,
  },
  checkboxRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  checkboxChecked: {
    backgroundColor: '#E31E24',
    borderColor: '#E31E24',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold' as const,
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#111827',
  },
  openDaysContainer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 8,
  },
  openDayButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  openDayButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  openDayText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: '#4B5563',
  },
  openDayTextActive: {
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#DC2626',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center' as const,
    marginTop: 24,
    marginBottom: 20,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold' as const,
  },
  deleteButton: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center' as const,
    marginTop: 0,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteButtonText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '800' as const,
  },
  uploadButton: {
    marginTop: 8,
    backgroundColor: '#9333EA',
    paddingVertical: 12,
    borderRadius: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontWeight: '600' as const,
  },
  logoWrapper: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  logoPreview: {
    width: 160,
    height: 160,
    borderRadius: 12,
  },
  logoRemoveButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  mapModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '85%',
  },
  cityModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '70%',
  },
  cityOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  cityOptionSelected: {
    backgroundColor: '#F3F4F6',
  },
  cityOptionText: {
    fontSize: 14,
    color: '#111827',
  },
  cityOptionTextSelected: {
    fontWeight: '600' as const,
  },
  mapFooter: {
    padding: 16,
  },
  confirmButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center' as const,
    marginTop: 12,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  successModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    flex: 1,
  },
  successHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold' as const,
    color: '#1F2937',
  },
  successScrollView: {
    flex: 1,
  },
  successInfo: {
    padding: 20,
    alignItems: 'center' as const,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  successGymName: {
    fontSize: 22,
    fontWeight: 'bold' as const,
    color: '#1F2937',
    marginBottom: 4,
  },
  successSubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  qrSection: {
    padding: 20,
    alignItems: 'center' as const,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  qrTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginTop: 8,
    marginBottom: 4,
  },
  qrSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  qrContainer: {
    backgroundColor: '#F9FAFB',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
  },
  qrImage: {
    width: 250,
    height: 250,
  },
  qrData: {
    fontSize: 12,
    color: '#9CA3AF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 16,
  },
  downloadQRButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  downloadQRButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  credentialsSection: {
    padding: 20,
  },
  credentialsTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginBottom: 4,
  },
  credentialsSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  credentialItem: {
    marginBottom: 16,
  },
  credentialLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#374151',
    marginBottom: 8,
  },
  credentialValueContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  credentialValue: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  copyButton: {
    padding: 8,
    marginLeft: 8,
  },
  copyAllButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  copyAllText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  successFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  successButton: {
    borderRadius: 12,
    overflow: 'hidden' as const,
  },
  successButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center' as const,
  },
  successButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600' as const,
  },
  errorCard: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#DC2626',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#991B1B',
    marginBottom: 8,
    lineHeight: 20,
  },
  errorCode: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 6,
    color: '#991B1B',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#1F2937',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center' as const,
  },
  bannerOrderRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 8,
    gap: 8,
  },
  bannerOrderLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  bannerOrderInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    color: '#111827',
    textAlign: 'right' as const,
  },
  saveBannerOrderButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  saveBannerOrderButtonDisabled: {
    opacity: 0.6,
  },
  saveBannerOrderButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  stepIndicator: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D1D5DB',
  },
  stepDotActive: {
    backgroundColor: '#DC2626',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 8,
  },
  stepButtons: {
    flexDirection: 'row' as const,
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center' as const,
  },
  backButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center' as const,
  },
  nextButtonFull: {
    flex: 1,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  radioContainer: {
    marginBottom: 24,
  },
  radioRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#DC2626',
    marginRight: 12,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  radioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DC2626',
  },
  radioLabel: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500' as const,
  },
  reviewSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  reviewLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '500' as const,
  },
  reviewValue: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '600' as const,
  },
  spotlightPanel: {
    marginTop: 24,
    marginBottom: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  gymsSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  spotlightDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  uploadBannerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  uploadBannerButtonDisabled: {
    opacity: 0.6,
  },
  uploadBannerButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700' as const,
  },
  bannersList: {
    gap: 12,
  },
  bannerCard: {
    flexDirection: 'row' as const,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    overflow: 'hidden' as const,
    marginBottom: 12,
  },
  bannerPreview: {
    width: 120,
    height: 80,
    backgroundColor: '#F3F4F6',
  },
  bannerInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center' as const,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#111827',
    marginBottom: 4,
  },
  deleteBannerButton: {
    width: 40,
    height: 40,
    backgroundColor: '#DC2626',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  facilitiesContainer: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 8,
  },
  facilityButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  facilityButtonActive: {
    backgroundColor: '#9333EA',
    borderColor: '#9333EA',
  },
  facilityButtonText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  facilityButtonTextActive: {
    color: '#fff',
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  // Coupon styles
  pageHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 20,
  },
  couponsList: {
    flex: 1,
  },
  couponCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  couponHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    marginBottom: 12,
  },
  couponCodeRow: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  couponCode: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: '#111827',
    letterSpacing: 1,
  },
  activeToggle: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  activeToggleOn: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  activeToggleText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#6B7280',
  },
  activeToggleTextOn: {
    color: '#FFFFFF',
  },
  couponActions: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  iconButton: {
    padding: 8,
  },
  couponDetails: {
    gap: 8,
  },
  couponDetailRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  couponDetailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  couponDetailValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#111827',
  },
  expiredText: {
    color: '#DC2626',
  },
  warningBadge: {
    alignSelf: 'flex-start' as const,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  warningText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#DC2626',
  },
  // Revenue analytics styles
  revenueFilterRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  revenueChartLabel: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500' as const,
  },
  revenueChartValue: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600' as const,
  },
  revenueChartBarBackground: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    marginTop: 4,
    overflow: 'hidden' as const,
  },
  revenueChartBarFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#E31E24',
  },
  revenueRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  revenueRowPrimary: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500' as const,
  },
  revenueRowSecondary: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  checkboxRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 16,
    marginBottom: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    marginRight: 8,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#374151',
  },
  saveButton: {
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center' as const,
    marginTop: 20,
    marginBottom: 20,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
