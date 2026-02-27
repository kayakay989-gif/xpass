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
import { firestoreUsers, firestoreSubscriptions, firestoreCheckIns, firestoreSpotlightBanners } from '@/lib/firestore';
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

type TabType = 'overview' | 'users' | 'gyms' | 'checkins' | 'payouts' | 'spotlight';

const TIER_COLORS = {
  silver: '#C0C0C0',
  gold: '#FFD700',
  diamond: '#B9F2FF',
  elite: '#9333EA',
  none: '#9CA3AF',
} as const;

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { isLoading: isAuthLoading, isCheckingAdmin, isAdmin, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddGymModal, setShowAddGymModal] = useState<boolean>(false);
  const [showSpotlightModal, setShowSpotlightModal] = useState<boolean>(false);
  const [spotlightBanners, setSpotlightBanners] = useState<any[]>([]);
  const [isLoadingSpotlight, setIsLoadingSpotlight] = useState(false);
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
    imageUrl: '',
    allowedTiers: [] as SubscriptionTier[],
    email: '',
    ownerName: '',
    membershipModel: 'pay_per_visit' as 'pay_per_visit',
    pricePerVisit: '',
    gymImages: [] as string[],
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
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'inactive'>('all');
  const [checkInsDateFilter, setCheckInsDateFilter] = useState<string>('');

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

  // Load spotlight banners
  const loadSpotlightBanners = useCallback(async () => {
    try {
      setIsLoadingSpotlight(true);
      const banners = await firestoreSpotlightBanners.getAll();
      setSpotlightBanners(banners);
    } catch (error) {
      console.error('[Admin] Error loading spotlight banners:', error);
      Alert.alert('Error', 'Failed to load spotlight banners');
    } finally {
      setIsLoadingSpotlight(false);
    }
  }, []);

  // Load data on mount and when refreshing
  useEffect(() => {
    loadData();
  }, []);

  // Load spotlight banners when modal opens
  useEffect(() => {
    if (showSpotlightModal) {
      loadSpotlightBanners();
    }
  }, [showSpotlightModal, loadSpotlightBanners]);

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
    const norm = (v: any) =>
      typeof v === 'string' ? v.trim().toLowerCase() : '';

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

    // Helper: determine if a user is inactive/expired
    const isInactiveOrExpired = (user: any) => {
      const subscription = user.subscription;
      const now = new Date();

      let isExpired = false;
      if (subscription?.endDate) {
        const end = new Date(subscription.endDate);
        isExpired = end.getTime() < now.getTime();
      }

      const status = norm(user.status);
      const isInactiveStatus = status === 'inactive';

      return isExpired || isInactiveStatus;
    };

    if (userStatusFilter === 'inactive') {
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

    // Date filter (YYYY-MM-DD). Uses check-in timestamp but keeps existing sort.
    const trimmedDate = checkInsDateFilter.trim();
    if (trimmedDate) {
      const parseDate = (value: string): Date | null => {
        // Prefer YYYY-MM-DD; fall back to Date parsing if needed.
        const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
          const [_, y, m, d] = isoMatch;
          const parsed = new Date(
            Number(y),
            Number(m) - 1,
            Number(d),
            0,
            0,
            0,
            0
          );
          return isNaN(parsed.getTime()) ? null : parsed;
        }

        const fallback = new Date(value);
        return isNaN(fallback.getTime()) ? null : fallback;
      };

      const selectedDate = parseDate(trimmedDate);
      if (selectedDate) {
        selectedDate.setHours(0, 0, 0, 0);
        result = result.filter((ci: any) => {
          const ciDate = new Date(ci.timestamp);
          ciDate.setHours(0, 0, 0, 0);
          return ciDate.getTime() === selectedDate.getTime();
        });
      }
    }

    return result;
  }, [enrichedCheckIns, searchQuery, checkInsDateFilter]);

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
      imageUrl: '',
      allowedTiers: [],
      email: '',
      ownerName: '',
      membershipModel: 'pay_per_visit',
      pricePerVisit: '',
      gymImages: [],
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
        imageUrl: gym.imageUrl || '',
        allowedTiers: Array.isArray(gym.allowedTiers) ? gym.allowedTiers : [],
        // Prefer values stored on the gym doc (if present), then try gymOwners lookup below.
        email: gym.ownerEmail || gym.email || '',
        ownerName: gym.ownerName || '',
        membershipModel: gym.membershipModel || 'pay_per_visit',
        pricePerVisit: gym.pricePerVisit ? String(gym.pricePerVisit) : '',
        gymImages: Array.isArray(gym.gymImages) ? gym.gymImages : [],
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
    
    // Final validation before submission
    if (!validateDetailsStep() || !validatePricingStep()) {
      return;
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
    };

    console.log('[Admin] Submitting gym data:', gymData);
    
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
            input.removeEventListener('cancel', handleCancel);
            document.body.removeChild(input);
            resolve(file);
          };
          
          const handleCancel = () => {
            input.removeEventListener('change', handleChange);
            input.removeEventListener('cancel', handleCancel);
            document.body.removeChild(input);
            resolve(null);
          };
          
          input.addEventListener('change', handleChange);
          document.body.appendChild(input);
          input.click();
          
          // Handle cancellation (when user closes file picker)
          setTimeout(() => {
            if (document.body.contains(input)) {
              input.removeEventListener('change', handleChange);
              document.body.removeChild(input);
              resolve(null);
            }
          }, 100);
        });
        
        if (!file) {
          setIsUploadingBanner(false);
          return;
        }

        console.log('[Admin] Uploading file:', file.name, file.size);
        const storage = getStorage(app);
        const timestamp = Date.now();
        const bannerId = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${timestamp}-${file.name}`);
        const objectRef = ref(storage, `spotlightBanners/${bannerId}.jpg`);
        
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
        const bannerId = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${timestamp}-spotlight`);
        const objectRef = ref(storage, `spotlightBanners/${bannerId}.jpg`);
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
      const bannerId = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${timestamp}-${imageUri}`);
      const newBanner = {
        id: bannerId,
        imageUrl: imageUri,
        title: '',
        linkUrl: '',
        isActive: true,
        order: spotlightBanners.length,
        position: spotlightBanners.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      console.log('[Admin] Banner data:', newBanner);
      await firestoreSpotlightBanners.create(newBanner);
      console.log('[Admin] Banner created, reloading list...');
      await loadSpotlightBanners();
      Alert.alert('Success', 'Spotlight banner uploaded successfully!');
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

  const handleUpdateSpotlightOrder = async (bannerId: string, newOrderRaw: string) => {
    const trimmed = newOrderRaw.trim();
    if (!trimmed) return;
    const parsed = parseInt(trimmed, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return;

    // Optimistic local update
    setSpotlightBanners((prev) =>
      [...prev]
        .map((b) =>
          b.id === bannerId ? { ...b, order: parsed, position: parsed } : b
        )
        .sort((a, b) => (a.order || 0) - (b.order || 0))
    );

    try {
      await firestoreSpotlightBanners.update(bannerId, {
        order: parsed,
        position: parsed,
      });
    } catch (error: any) {
      console.error('[Admin] Failed to update spotlight banner order:', error);
      Alert.alert('Error', error?.message || 'Failed to update banner position. Please try again.');
      // Reload from server to ensure consistency
      loadSpotlightBanners();
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
              await firestoreSpotlightBanners.delete(bannerId);
              
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

              await loadSpotlightBanners();
              Alert.alert('Success', 'Banner deleted successfully!');
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
        {activeTab === 'overview' && (
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
                <Text style={styles.statValueMinimal}>0</Text>
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

            <TouchableOpacity
              style={styles.primaryCta}
              activeOpacity={0.9}
              onPress={() => setShowAddGymModal(true)}
            >
              <Text style={styles.primaryCtaText}>Add a New Gym</Text>
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

            {/* Subscribers status filter: All vs Inactive / Expired */}
            <View style={styles.userFilterRow}>
              <TouchableOpacity
                style={[
                  styles.userFilterChip,
                  userStatusFilter === 'all' && styles.userFilterChipActive,
                ]}
                activeOpacity={0.85}
                onPress={() => setUserStatusFilter('all')}
              >
                <Text
                  style={[
                    styles.userFilterChipText,
                    userStatusFilter === 'all' && styles.userFilterChipTextActive,
                  ]}
                >
                  All
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
                <View key={user.id} style={styles.userCard}>
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
                      <Text style={styles.userStatValue}>${user.walletBalance || 0}</Text>
                    </View>
                    <View style={styles.userStat}>
                      <Text style={styles.userStatLabel}>Code</Text>
                      <Text style={styles.userStatValue}>{user.referralCode || 'N/A'}</Text>
                    </View>
                  </View>
                </View>
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

            <TouchableOpacity
              style={styles.spotlightButton}
              onPress={() => setShowSpotlightModal(true)}
            >
              <ImageIcon size={18} color="#fff" />
              <Text style={styles.spotlightButtonText}>Spotlight Images</Text>
            </TouchableOpacity>

            <Text style={styles.listCount}>Showing {filteredGyms.length} gyms</Text>

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
                    <Text style={styles.sectionTitle}>Check-ins Today: {todayCheckIns.length}</Text>
                    {todayCheckIns.slice(0, 5).map((checkIn: any) => {
                      const checkInDate = new Date(checkIn.timestamp);
                      return (
                        <View key={checkIn.id} style={styles.checkInCard}>
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
                              {checkInDate.toLocaleDateString('en-US', { 
                                weekday: 'short', 
                                month: 'short', 
                                day: 'numeric' 
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
                        </View>
                      );
                    })}
                    {todayCheckIns.length > 5 && (
                      <Text style={styles.moreCheckInsText}>
                        +{todayCheckIns.length - 5} more today
                      </Text>
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

            {/* Date filter for check-ins (YYYY-MM-DD or any parsable date) */}
            <View style={styles.dateFilterRow}>
              <Text style={styles.dateFilterLabel}>Filter by date</Text>
              <TextInput
                style={styles.dateFilterInput}
                placeholder="YYYY-MM-DD"
                value={checkInsDateFilter}
                onChangeText={setCheckInsDateFilter}
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <Text style={styles.allCheckInsTitle}>All Check-ins</Text>

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
                <View key={checkIn.id} style={styles.checkInCard}>
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
                </View>
              );
            })}
          </View>
        )}

        {activeTab === 'payouts' && (
          <View style={styles.content}>
            <Text style={styles.pageTitle}>Payouts</Text>
            <Text style={styles.pageSubtitle}>
              Monthly payouts are calculated from check-ins. (Currently showing placeholders: JOD 0)
            </Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Monthly Payouts</Text>

              {(gymsWithStats || []).map((g: any) => (
                <View key={g.id} style={styles.payoutRow}>
                  <Text style={styles.payoutGymName}>{g.name}</Text>
                  <Text style={styles.payoutAmount}>JOD {g.totalPayout?.toFixed(2) || '0.00'}</Text>
                </View>
              ))}

              {(gymsWithStats || []).length === 0 && (
                <View style={styles.emptyState}>
                  <DollarSign size={48} color="#9CA3AF" />
                  <Text style={styles.emptyTitle}>No payouts</Text>
                  <Text style={styles.emptyText}>Add gyms and check-ins to generate payouts.</Text>
                </View>
              )}
            </View>
          </View>
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
                style={styles.selectInput}
                onPress={() => setIsCityModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={newGym.city ? styles.selectInputText : styles.selectInputPlaceholder}>
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
                  <TextInput
                    style={styles.timingInput}
                    value={newGym.timings.men.from}
                    onChangeText={(text) =>
                      setNewGym({
                        ...newGym,
                        timings: { ...newGym.timings, men: { ...newGym.timings.men, from: text } },
                      })
                    }
                    placeholder="From"
                    placeholderTextColor="#9CA3AF"
                  />
                  <TextInput
                    style={styles.timingInput}
                    value={newGym.timings.men.to}
                    onChangeText={(text) =>
                      setNewGym({
                        ...newGym,
                        timings: { ...newGym.timings, men: { ...newGym.timings.men, to: text } },
                      })
                    }
                    placeholder="To"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Women Timings */}
              <View style={styles.timingRow}>
                <Text style={styles.timingLabel}>Women</Text>
                <View style={styles.timingInputs}>
                  <TextInput
                    style={styles.timingInput}
                    value={newGym.timings.women.from}
                    onChangeText={(text) =>
                      setNewGym({
                        ...newGym,
                        timings: { ...newGym.timings, women: { ...newGym.timings.women, from: text } },
                      })
                    }
                    placeholder="From"
                    placeholderTextColor="#9CA3AF"
                  />
                  <TextInput
                    style={styles.timingInput}
                    value={newGym.timings.women.to}
                    onChangeText={(text) =>
                      setNewGym({
                        ...newGym,
                        timings: { ...newGym.timings, women: { ...newGym.timings.women, to: text } },
                      })
                    }
                    placeholder="To"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Mixed Timings */}
              <View style={styles.timingRow}>
                <Text style={styles.timingLabel}>Mixed</Text>
                <View style={styles.timingInputs}>
                  <TextInput
                    style={styles.timingInput}
                    value={newGym.timings.mixed.from}
                    onChangeText={(text) =>
                      setNewGym({
                        ...newGym,
                        timings: { ...newGym.timings, mixed: { ...newGym.timings.mixed, from: text } },
                      })
                    }
                    placeholder="From"
                    placeholderTextColor="#9CA3AF"
                  />
                  <TextInput
                    style={styles.timingInput}
                    value={newGym.timings.mixed.to}
                    onChangeText={(text) =>
                      setNewGym({
                        ...newGym,
                        timings: { ...newGym.timings, mixed: { ...newGym.timings.mixed, to: text } },
                      })
                    }
                    placeholder="To"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Access Checkboxes */}
              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setNewGym({ ...newGym, menOnly: !newGym.menOnly })}
                >
                  <View style={[styles.checkbox, newGym.menOnly && styles.checkboxChecked]}>
                    {newGym.menOnly && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Men only</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setNewGym({ ...newGym, womenOnly: !newGym.womenOnly })}
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
                <Image source={{ uri: newGym.imageUrl }} style={styles.logoPreview} resizeMode="cover" />
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
                    placeholder="2"
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

      {/* City Picker Modal */}
      <Modal
        visible={isCityModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsCityModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.filterOverlay}
          activeOpacity={1}
          onPress={() => setIsCityModalVisible(false)}
        >
          <View style={styles.filterSheet}>
            <Text style={styles.filterSheetTitle}>City</Text>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {FIXED_CITIES.map((city) => (
                <TouchableOpacity
                  key={city}
                  style={[
                    styles.filterOption,
                    newGym.city === city && styles.filterOptionSelected,
                  ]}
                  onPress={() => {
                    setNewGym({ ...newGym, city });
                    setIsCityModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.filterOptionText,
                      newGym.city === city && styles.filterOptionTextSelected,
                    ]}
                  >
                    {city}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.filterClose}
              onPress={() => setIsCityModalVisible(false)}
            >
              <Text style={styles.filterCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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

      {/* Spotlight Banners Modal */}
      <Modal
        visible={showSpotlightModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSpotlightModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Spotlight Images</Text>
              <TouchableOpacity onPress={() => setShowSpotlightModal(false)}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.uploadBannerButton, isUploadingBanner && styles.uploadBannerButtonDisabled]}
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
                  <Text style={styles.loadingText}>Loading banners...</Text>
                </View>
              ) : spotlightBanners.length === 0 ? (
                <View style={styles.emptyCard}>
                  <ImageIcon size={48} color="#9CA3AF" />
                  <Text style={styles.emptyText}>No spotlight banners</Text>
                  <Text style={styles.emptySubtext}>Upload a banner to display in the spotlight section</Text>
                </View>
              ) : (
                <View style={styles.bannersList}>
                  {spotlightBanners.map((banner, index) => (
                    <View key={banner.id} style={styles.bannerCard}>
                      <Image
                        source={{ uri: banner.imageUrl }}
                        style={styles.bannerPreview}
                        resizeMode="cover"
                      />
                      <View style={styles.bannerInfo}>
                        <Text style={styles.bannerTitle} numberOfLines={1}>
                          {banner.title || 'No title'}
                        </Text>
                        {banner.linkUrl ? (
                          <Text style={styles.bannerLink} numberOfLines={1}>
                            Link: {banner.linkUrl}
                          </Text>
                        ) : null}
                        <View style={styles.bannerOrderRow}>
                          <Text style={styles.bannerOrderLabel}>Position</Text>
                          <TextInput
                            style={styles.bannerOrderInput}
                            keyboardType="number-pad"
                            defaultValue={
                              typeof banner.order === 'number'
                                ? String(banner.order)
                                : String(index)
                            }
                            onEndEditing={(e) =>
                              handleUpdateSpotlightOrder(
                                banner.id,
                                e.nativeEvent.text || String(index)
                              )
                            }
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteBannerButton}
                        onPress={() => handleDeleteSpotlightBanner(banner.id, banner.imageUrl)}
                      >
                        <X size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
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
  langPill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  langText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800' as const,
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
  todayCheckInsSection: {
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
  addButton: {
    backgroundColor: '#DC2626',
    padding: 8,
    borderRadius: 8,
    marginLeft: 8,
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
  logoPreview: {
    width: 160,
    height: 160,
    borderRadius: 12,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  mapModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '85%',
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
  spotlightButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: '#9333EA',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
  },
  spotlightButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700' as const,
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
  bannerLink: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  bannerOrder: {
    fontSize: 11,
    color: '#9CA3AF',
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
});
