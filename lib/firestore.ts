import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { User, Subscription, Gym, CheckIn, GymOwner, SpotlightImage, Coupon } from '@/types';

// Helper to convert Firestore Timestamp to Date
const timestampToDate = (timestamp: any): Date => {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return new Date();
};

// Users collection
export const usersCollection = collection(db, 'users');

export const firestoreUsers = {
  async getById(userId: string): Promise<User | null> {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) return null;
    
    const data = userDoc.data();
    return {
      id: userDoc.id,
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      referralCode: data.referralCode || '',
      referredBy: typeof data.referredBy === 'string' ? data.referredBy : '',
      walletBalance: data.walletBalance || 0,
      createdAt: timestampToDate(data.createdAt),
    };
  },

  async update(userId: string, updates: Partial<User>): Promise<void> {
    await updateDoc(doc(db, 'users', userId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  },

  async getAll(): Promise<User[]> {
    const snapshot = await getDocs(usersCollection);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        referralCode: data.referralCode || '',
        referredBy: typeof data.referredBy === 'string' ? data.referredBy : '',
        walletBalance: data.walletBalance || 0,
        createdAt: timestampToDate(data.createdAt),
        // Optional admin fields (used by the admin dashboard for filtering)
        // Kept flexible so we don't depend on a strict User type including them.
        ...(typeof (data as any).status === 'string' && { status: (data as any).status }),
      } as any;
    });
  },
};

// Subscriptions collection
export const subscriptionsCollection = collection(db, 'subscriptions');

export const firestoreSubscriptions = {
  async getByUserId(userId: string): Promise<Subscription | null> {
    const q = query(
      subscriptionsCollection,
      where('userId', '==', userId),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      tier: data.tier,
      duration: data.duration,
      startDate: timestampToDate(data.startDate),
      endDate: timestampToDate(data.endDate),
      monthlyPrice: data.monthlyPrice,
      totalPrice: data.totalPrice,
      visitsUsed: data.visitsUsed || 0,
      maxVisitsPerMonth: data.maxVisitsPerMonth,
      isActive: data.isActive,
    };
  },

  async create(subscription: Subscription): Promise<void> {
    // Deactivate existing subscriptions
    const existingQ = query(
      subscriptionsCollection,
      where('userId', '==', subscription.userId),
      where('isActive', '==', true)
    );
    const existing = await getDocs(existingQ);
    existing.docs.forEach(async (doc) => {
      await updateDoc(doc.ref, { isActive: false });
    });

    // Create new subscription
    await setDoc(doc(db, 'subscriptions', subscription.id), {
      ...subscription,
      startDate: Timestamp.fromDate(subscription.startDate),
      endDate: Timestamp.fromDate(subscription.endDate),
      createdAt: serverTimestamp(),
    });
  },

  async update(subscriptionId: string, updates: Partial<Subscription>): Promise<void> {
    const updateData: any = { ...updates };
    if (updates.startDate) {
      updateData.startDate = Timestamp.fromDate(updates.startDate);
    }
    if (updates.endDate) {
      updateData.endDate = Timestamp.fromDate(updates.endDate);
    }
    updateData.updatedAt = serverTimestamp();
    
    await updateDoc(doc(db, 'subscriptions', subscriptionId), updateData);
  },

  async getAll(): Promise<Subscription[]> {
    const snapshot = await getDocs(subscriptionsCollection);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        tier: data.tier,
        duration: data.duration,
        startDate: timestampToDate(data.startDate),
        endDate: timestampToDate(data.endDate),
        monthlyPrice: data.monthlyPrice,
        totalPrice: data.totalPrice,
        visitsUsed: data.visitsUsed || 0,
        maxVisitsPerMonth: data.maxVisitsPerMonth,
        isActive: data.isActive,
      };
    });
  },
};

// Gyms collection
export const gymsCollection = collection(db, 'gyms');

export const firestoreGyms = {
  async getAll(): Promise<Gym[]> {
    const snapshot = await getDocs(gymsCollection);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Gym[];
  },

  async getById(gymId: string): Promise<Gym | null> {
    const gymDoc = await getDoc(doc(db, 'gyms', gymId));
    if (!gymDoc.exists()) return null;
    
    return {
      id: gymDoc.id,
      ...gymDoc.data(),
    } as Gym;
  },

  async create(gym: Gym): Promise<void> {
    await setDoc(doc(db, 'gyms', gym.id), {
      ...gym,
      createdAt: serverTimestamp(),
    });
  },

  async update(gymId: string, updates: Partial<Gym>): Promise<void> {
    await updateDoc(doc(db, 'gyms', gymId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(gymId: string): Promise<void> {
    await deleteDoc(doc(db, 'gyms', gymId));
  },
};

// Check-ins collection
export const checkInsCollection = collection(db, 'checkIns');

export const firestoreCheckIns = {
  async getByUserId(userId: string): Promise<CheckIn[]> {
    // Query without orderBy to avoid requiring a composite index
    // We'll sort in memory instead
    const q = query(
      checkInsCollection,
      where('userId', '==', userId)
    );
    
    const snapshot = await getDocs(q);
    const checkIns = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        gymId: data.gymId,
        timestamp: timestampToDate(data.timestamp),
        subscriptionId: data.subscriptionId,
        payoutAmount: data.payoutAmount || 0,
      };
    });
    
    // Sort by timestamp descending in memory
    return checkIns.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  },

  async getByGymId(gymId: string): Promise<CheckIn[]> {
    // Query without orderBy to avoid requiring a composite index
    // We'll sort in memory instead
    const q = query(
      checkInsCollection,
      where('gymId', '==', gymId)
    );
    
    const snapshot = await getDocs(q);
    const checkIns = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        gymId: data.gymId,
        timestamp: timestampToDate(data.timestamp),
        subscriptionId: data.subscriptionId,
        payoutAmount: data.payoutAmount || 0,
      };
    });
    
    // Sort by timestamp descending in memory
    return checkIns.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  },

  async getAll(): Promise<CheckIn[]> {
    const snapshot = await getDocs(checkInsCollection);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        gymId: data.gymId,
        timestamp: timestampToDate(data.timestamp),
        subscriptionId: data.subscriptionId,
        payoutAmount: data.payoutAmount || 0,
      };
    });
  },

  async create(checkIn: CheckIn): Promise<void> {
    await setDoc(doc(db, 'checkIns', checkIn.id), {
      ...checkIn,
      timestamp: Timestamp.fromDate(checkIn.timestamp),
      createdAt: serverTimestamp(),
    });
  },

  async getTodayCheckIn(userId: string): Promise<CheckIn | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const q = query(
      checkInsCollection,
      where('userId', '==', userId),
      where('timestamp', '>=', Timestamp.fromDate(today)),
      where('timestamp', '<', Timestamp.fromDate(tomorrow)),
      limit(1)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      gymId: data.gymId,
      timestamp: timestampToDate(data.timestamp),
      subscriptionId: data.subscriptionId,
    };
  },
};

// Gym Owners collection
export const gymOwnersCollection = collection(db, 'gymOwners');

export const firestoreGymOwners = {
  async getByUsername(username: string): Promise<GymOwner | null> {
    const q = query(
      gymOwnersCollection,
      where('username', '==', username),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      gymId: data.gymId,
      username: data.username,
      password: data.password,
      passwordHash: data.passwordHash,
      email: data.email,
      name: data.name,
      createdAt: timestampToDate(data.createdAt),
    };
  },

  async getByGymId(gymId: string): Promise<GymOwner | null> {
    const q = query(
      gymOwnersCollection,
      where('gymId', '==', gymId),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      gymId: data.gymId,
      username: data.username,
      password: data.password,
      passwordHash: data.passwordHash,
      email: data.email,
      name: data.name,
      createdAt: timestampToDate(data.createdAt),
    };
  },

  async create(gymOwner: GymOwner): Promise<void> {
    await setDoc(doc(db, 'gymOwners', gymOwner.id), {
      ...gymOwner,
      createdAt: serverTimestamp(),
    });
  },

  async getAll(): Promise<GymOwner[]> {
    const snapshot = await getDocs(gymOwnersCollection);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        gymId: data.gymId,
        username: data.username,
        password: data.password,
        email: data.email,
        name: data.name,
        createdAt: timestampToDate(data.createdAt),
      };
    });
  },

  async delete(gymOwnerId: string): Promise<void> {
    await deleteDoc(doc(db, 'gymOwners', gymOwnerId));
  },

  async update(gymOwnerId: string, updates: Partial<GymOwner>): Promise<void> {
    await updateDoc(doc(db, 'gymOwners', gymOwnerId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  },
};

// Spotlight Images collection
export const spotlightImagesCollection = collection(db, 'spotlightImages');

export const firestoreSpotlightImages = {
  // For admin: return all spotlight images ordered by position
  async getAll(): Promise<SpotlightImage[]> {
    const q = query(spotlightImagesCollection, orderBy('position', 'asc'));
    const snapshot = await getDocs(q);
    const images: SpotlightImage[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as any;
      return {
        id: docSnap.id,
        imageUrl: data.imageUrl,
        position: typeof data.position === 'number' ? data.position : 0,
        isActive: !!data.isActive,
        createdAt: timestampToDate(data.createdAt),
        updatedAt: data.updatedAt ? timestampToDate(data.updatedAt) : undefined,
      };
    });
    console.log('[Firestore] spotlightImages.getAll -> images:', images);
    return images.sort((a, b) => a.position - b.position);
  },

  async create(image: SpotlightImage): Promise<void> {
    await setDoc(doc(db, 'spotlightImages', image.id), {
      imageUrl: image.imageUrl,
      position: image.position,
      isActive: image.isActive,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  async update(imageId: string, updates: Partial<SpotlightImage>): Promise<void> {
    await updateDoc(doc(db, 'spotlightImages', imageId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  },

  async delete(imageId: string): Promise<void> {
    await deleteDoc(doc(db, 'spotlightImages', imageId));
  },

  // Real-time subscription helper for active images (used by user Home)
  subscribeToAllActive(
    onChange: (images: SpotlightImage[]) => void,
    onError?: (error: any) => void
  ): () => void {
    // Primary query: filter active + order by position
    const orderedQuery = query(
      spotlightImagesCollection,
      where('isActive', '==', true),
      orderBy('position', 'asc')
    );

    let unsubscribe: () => void;

    const attachListener = (q: any, isFallback: boolean) => {
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const images: SpotlightImage[] = snapshot.docs
            .map((docSnap) => {
              const data = docSnap.data() as any;
              return {
                id: docSnap.id,
                imageUrl: data.imageUrl,
                position: typeof data.position === 'number' ? data.position : 0,
                isActive: !!data.isActive,
                createdAt: timestampToDate(data.createdAt),
                updatedAt: data.updatedAt ? timestampToDate(data.updatedAt) : undefined,
              };
            })
            .sort((a, b) => a.position - b.position);

          console.log(
            `[Firestore] spotlightImages.subscribeToAllActive${
              isFallback ? ' (fallback)' : ''
            } -> images:`,
            images
          );
          onChange(images);
        },
        (error) => {
          // If index is missing for the ordered query, fall back to a simple where query
          if (!isFallback && error?.code === 'failed-precondition') {
            console.warn(
              '[Firestore] spotlightImages.subscribeToAllActive missing index, falling back without orderBy'
            );
            const simpleQuery = query(
              spotlightImagesCollection,
              where('isActive', '==', true)
            );
            attachListener(simpleQuery, true);
            return;
          }
          console.error('[Firestore] spotlightImages.subscribeToAllActive error:', error);
          onError?.(error);
        }
      );
    };

    attachListener(orderedQuery, false);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  },
};

// Coupons collection
export const couponsCollection = collection(db, 'coupons');

export const firestoreCoupons = {
  async getAll(): Promise<Coupon[]> {
    const q = query(couponsCollection, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as any;
      return {
        id: docSnap.id,
        code: data.code || '',
        discountPercent: data.discountPercent || 0,
        isActive: !!data.isActive,
        createdAt: timestampToDate(data.createdAt),
        usageLimit: data.usageLimit ?? null,
        usedCount: data.usedCount || 0,
        expiresAt: data.expiresAt ? timestampToDate(data.expiresAt) : null,
      };
    });
  },

  async getByCode(code: string): Promise<Coupon | null> {
    const upperCode = code.toUpperCase().trim();
    const q = query(couponsCollection, where('code', '==', upperCode), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    const docSnap = snapshot.docs[0];
    const data = docSnap.data() as any;
    return {
      id: docSnap.id,
      code: data.code || '',
      discountPercent: data.discountPercent || 0,
      isActive: !!data.isActive,
      createdAt: timestampToDate(data.createdAt),
      usageLimit: data.usageLimit ?? null,
      usedCount: data.usedCount || 0,
      expiresAt: data.expiresAt ? timestampToDate(data.expiresAt) : null,
    };
  },

  async create(coupon: Coupon): Promise<void> {
    await setDoc(doc(db, 'coupons', coupon.id), {
      code: coupon.code.toUpperCase().trim(),
      discountPercent: coupon.discountPercent,
      isActive: coupon.isActive,
      createdAt: serverTimestamp(),
      usageLimit: coupon.usageLimit ?? null,
      usedCount: coupon.usedCount || 0,
      expiresAt: coupon.expiresAt ? coupon.expiresAt : null,
    });
  },

  async update(couponId: string, updates: Partial<Coupon>): Promise<void> {
    const updateData: any = { ...updates };
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase().trim();
    }
    await updateDoc(doc(db, 'coupons', couponId), updateData);
  },

  async delete(couponId: string): Promise<void> {
    await deleteDoc(doc(db, 'coupons', couponId));
  },

  async incrementUsage(couponId: string): Promise<void> {
    const couponDoc = await getDoc(doc(db, 'coupons', couponId));
    if (!couponDoc.exists()) {
      throw new Error('Coupon not found');
    }
    const currentCount = couponDoc.data()?.usedCount || 0;
    await updateDoc(doc(db, 'coupons', couponId), {
      usedCount: currentCount + 1,
    });
  },
};

// Export all services
export default {
  users: firestoreUsers,
  subscriptions: firestoreSubscriptions,
  gyms: firestoreGyms,
  checkIns: firestoreCheckIns,
  gymOwners: firestoreGymOwners,
  spotlightImages: firestoreSpotlightImages,
  coupons: firestoreCoupons,
};

