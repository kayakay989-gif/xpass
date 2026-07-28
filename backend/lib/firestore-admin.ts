import { adminDb } from './firebase-admin';
import { User, Subscription, Gym, CheckIn, GymOwner, Coupon, Payout, WalletTransaction } from '@/types';
import admin from 'firebase-admin';
import {
  normalizeGymOwnerUsername,
  sanitizeGymOwnerUsernameInput,
  usernamesMatchForLogin,
} from '@/lib/gym-owner-username';
import { getAmmanDayRange, isExpiredInAmman, startOfAmmanDay, toAmmanDateString } from '@/lib/jordan-time';

// Helper to convert Firestore Timestamp to Date
const timestampToDate = (timestamp: any): Date => {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  if (timestamp instanceof Date) {
    return timestamp;
  }
  if (timestamp && typeof timestamp === 'object' && timestamp._seconds) {
    return new Date(timestamp._seconds * 1000);
  }
  return new Date();
};

// Users collection
export const firestoreUsers = {
  async getById(userId: string): Promise<User | null> {
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) return null;
    
    const data = userDoc.data();
    if (!data) return null;
    
    // Convert savedCards from Firestore format
    const savedCards = data.savedCards ? data.savedCards.map((card: any) => ({
      id: card.id || '',
      token: card.token || '',
      last4: card.last4 || '',
      brand: card.brand || '',
      expiryMonth: card.expiryMonth || '',
      expiryYear: card.expiryYear || '',
      cardholderName: card.cardholderName || '',
      isDefault: card.isDefault || false,
      createdAt: timestampToDate(card.createdAt) || new Date(),
    })) : undefined;

    return {
      id: userDoc.id,
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      age: typeof data.age === 'number' ? data.age : undefined,
      referralCode: data.referralCode || '',
      walletBalance: data.walletBalance || 0,
      createdAt: timestampToDate(data.createdAt),
      savedCards: savedCards,
    };
  },

  async update(userId: string, updates: Partial<User>): Promise<void> {
    await adminDb.collection('users').doc(userId).update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },

  async getAll(): Promise<User[]> {
    const snapshot = await adminDb.collection('users').get();
    return snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Convert savedCards from Firestore format
      const savedCards = data.savedCards ? data.savedCards.map((card: any) => ({
        id: card.id || '',
        token: card.token || '',
        last4: card.last4 || '',
        brand: card.brand || '',
        expiryMonth: card.expiryMonth || '',
        expiryYear: card.expiryYear || '',
        cardholderName: card.cardholderName || '',
        isDefault: card.isDefault || false,
        createdAt: timestampToDate(card.createdAt) || new Date(),
      })) : undefined;

      return {
        id: doc.id,
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        age: typeof data.age === 'number' ? data.age : undefined,
        referralCode: data.referralCode || '',
        walletBalance: data.walletBalance || 0,
        createdAt: timestampToDate(data.createdAt),
        savedCards: savedCards,
      };
    });
  },
};

// Subscriptions collection
export const firestoreSubscriptions = {
  async getById(subscriptionId: string): Promise<Subscription | null> {
    const doc = await adminDb.collection('subscriptions').doc(subscriptionId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (!data) return null;
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
      status: data.status ?? null,
      paymentStatus: data.paymentStatus ?? null,
      autoRenew: data.autoRenew ?? null,
      createdAt: data.createdAt ? timestampToDate(data.createdAt) : undefined,
    };
  },

  async getByUserId(userId: string): Promise<Subscription | null> {
    // Note: orderBy on createdAt requires a composite index if used with where clauses
    // For now, we'll get all active subscriptions and sort in memory
    const snapshot = await adminDb
      .collection('subscriptions')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();
    
    if (snapshot.empty) return null;
    
    // Sort by createdAt in memory and get the most recent
    const sorted = snapshot.docs.sort((a, b) => {
      const aTime = timestampToDate(a.data().createdAt).getTime();
      const bTime = timestampToDate(b.data().createdAt).getTime();
      return bTime - aTime; // Descending order
    });
    
    const doc = sorted[0];
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
      status: data.status ?? null,
      paymentStatus: data.paymentStatus ?? null,
      autoRenew: data.autoRenew ?? null,
      createdAt: data.createdAt ? timestampToDate(data.createdAt) : undefined,
    };
  },

  /**
   * Member-facing subscription: active row first, else latest unexpired doc (handles stale `isActive` in DB).
   * Single Firestore query; both selection rules are applied in memory (a user has very few
   * subscription docs). Previously this could issue two sequential queries per request.
   */
  async getMemberViewSubscription(userId: string): Promise<Subscription | null> {
    const queryStart = Date.now();
    const snapshot = await adminDb
      .collection('subscriptions')
      .where('userId', '==', userId)
      .get();
    console.log(
      '[Perf] getMemberViewSubscription firestore:',
      JSON.stringify({ ms: Date.now() - queryStart, docs: snapshot.size })
    );

    if (snapshot.empty) return null;

    const toSub = (doc: { id: string; data: () => any }): Subscription => {
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
        status: data.status ?? null,
        paymentStatus: data.paymentStatus ?? null,
        autoRenew: data.autoRenew ?? null,
        createdAt: data.createdAt ? timestampToDate(data.createdAt) : undefined,
      };
    };

    // Rule 1 (same as getByUserId): most recently created doc with isActive === true.
    const activeDocs = snapshot.docs
      .filter((doc) => doc.data().isActive === true)
      .sort((a, b) => {
        const aTime = timestampToDate(a.data().createdAt).getTime();
        const bTime = timestampToDate(b.data().createdAt).getTime();
        return bTime - aTime;
      });
    if (activeDocs.length > 0) return toSub(activeDocs[0]);

    const all = snapshot.docs.map(toSub);

    // Rule 2: latest unexpired doc whose isActive is not explicitly false.
    const now = Date.now();
    const candidates = all
      .filter((s) => {
        if (!s.endDate) return false;
        return !isExpiredInAmman(s.endDate, new Date(now)) && s.isActive !== false;
      })
      .sort((a, b) => {
        const aT = a.endDate ? new Date(a.endDate).getTime() : 0;
        const bT = b.endDate ? new Date(b.endDate).getTime() : 0;
        return bT - aT;
      });

    return candidates[0] ?? null;
  },

  async create(subscription: Subscription): Promise<void> {
    // Deactivate existing subscriptions
    const existingSnapshot = await adminDb
      .collection('subscriptions')
      .where('userId', '==', subscription.userId)
      .where('isActive', '==', true)
      .get();
    
    const batch = adminDb.batch();
    existingSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { isActive: false });
    });
    await batch.commit();

    // Create new subscription
    await adminDb.collection('subscriptions').doc(subscription.id).set({
      ...subscription,
      startDate: admin.firestore.Timestamp.fromDate(subscription.startDate),
      endDate: admin.firestore.Timestamp.fromDate(subscription.endDate),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },

  async update(subscriptionId: string, updates: Partial<Subscription>): Promise<void> {
    const updateData: any = { ...updates };
    if (updates.startDate) {
      updateData.startDate = admin.firestore.Timestamp.fromDate(updates.startDate);
    }
    if (updates.endDate) {
      updateData.endDate = admin.firestore.Timestamp.fromDate(updates.endDate);
    }
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    
    await adminDb.collection('subscriptions').doc(subscriptionId).update(updateData);
  },

  async getAll(): Promise<Subscription[]> {
    const snapshot = await adminDb.collection('subscriptions').get();
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
        status: data.status ?? null,
        paymentStatus: data.paymentStatus ?? null,
        autoRenew: data.autoRenew ?? null,
        createdAt: data.createdAt ? timestampToDate(data.createdAt) : undefined,
      };
    });
  },

  async getAllActive(): Promise<Subscription[]> {
    const snapshot = await adminDb
      .collection('subscriptions')
      .where('isActive', '==', true)
      .get();
    return snapshot.docs.map((doc) => {
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
        status: data.status ?? null,
        paymentStatus: data.paymentStatus ?? null,
        autoRenew: data.autoRenew ?? null,
        createdAt: data.createdAt ? timestampToDate(data.createdAt) : undefined,
      };
    });
  },
};

// Gyms collection
export const firestoreGyms = {
  async getAll(): Promise<Gym[]> {
    const snapshot = await adminDb.collection('gyms').get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Gym[];
  },

  async getById(gymId: string): Promise<Gym | null> {
    const gymDoc = await adminDb.collection('gyms').doc(gymId).get();
    if (!gymDoc.exists) return null;
    
    return {
      id: gymDoc.id,
      ...gymDoc.data(),
    } as Gym;
  },

  async create(gym: Gym): Promise<void> {
    await adminDb.collection('gyms').doc(gym.id).set({
      ...gym,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },

  async update(gymId: string, updates: Partial<Gym>): Promise<void> {
    // If pricePerVisit is being updated, store the change timestamp
    const updateData: any = { ...updates };
    if (updates.pricePerVisit !== undefined) {
      updateData.payoutRateChangedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    await adminDb.collection('gyms').doc(gymId).update(updateData);
  },

  async delete(gymId: string): Promise<void> {
    await adminDb.collection('gyms').doc(gymId).delete();
  },
};

function mapCheckInDoc(doc: admin.firestore.QueryDocumentSnapshot | admin.firestore.DocumentSnapshot): CheckIn {
  const data = doc.data() as Record<string, unknown> | undefined;
  if (!data) {
    throw new Error(`Check-in document ${doc.id} has no data`);
  }
  return {
    id: doc.id,
    userId: String(data.userId ?? ''),
    gymId: String(data.gymId ?? '').trim(),
    timestamp: timestampToDate(data.timestamp),
    subscriptionId: String(data.subscriptionId ?? ''),
    payoutAmount: typeof data.payoutAmount === 'number' ? data.payoutAmount : undefined,
  };
}

function sortCheckInsDesc(checkIns: CheckIn[]): CheckIn[] {
  return [...checkIns].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// Check-ins collection
export const firestoreCheckIns = {
  async getById(checkInId: string): Promise<CheckIn | null> {
    const doc = await adminDb.collection('checkIns').doc(checkInId).get();
    if (!doc.exists) return null;
    return mapCheckInDoc(doc);
  },

  async getByUserId(userId: string): Promise<CheckIn[]> {
    // Single-field query + in-memory sort avoids composite index failures.
    const snapshot = await adminDb
      .collection('checkIns')
      .where('userId', '==', userId)
      .get();

    return sortCheckInsDesc(snapshot.docs.map(mapCheckInDoc));
  },

  async getByGymId(gymId: string): Promise<CheckIn[]> {
    const normalizedGymId = gymId.trim();
    const snapshot = await adminDb
      .collection('checkIns')
      .where('gymId', '==', normalizedGymId)
      .get();

    return sortCheckInsDesc(snapshot.docs.map(mapCheckInDoc));
  },

  async getAll(): Promise<CheckIn[]> {
    const snapshot = await adminDb.collection('checkIns').get();
    return sortCheckInsDesc(snapshot.docs.map(mapCheckInDoc));
  },

  /**
   * Atomically persist check-in and subscription visit count.
   */
  async createWithSubscriptionUpdate(
    checkIn: CheckIn,
    subscriptionUpdate: {
      subscriptionId: string;
      visitsUsed: number;
      lastCheckInDate: Date;
      maxVisitsPerMonth?: number;
    }
  ): Promise<void> {
    const normalizedGymId = checkIn.gymId.trim();
    const checkInRef = adminDb.collection('checkIns').doc(checkIn.id);
    const subRef = adminDb.collection('subscriptions').doc(subscriptionUpdate.subscriptionId);

    const batch = adminDb.batch();
    batch.set(checkInRef, {
      ...checkIn,
      gymId: normalizedGymId,
      timestamp: admin.firestore.Timestamp.fromDate(checkIn.timestamp),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.update(subRef, {
      visitsUsed: subscriptionUpdate.visitsUsed,
      lastCheckInDate: admin.firestore.Timestamp.fromDate(subscriptionUpdate.lastCheckInDate),
      ...(subscriptionUpdate.maxVisitsPerMonth != null &&
      subscriptionUpdate.visitsUsed >= subscriptionUpdate.maxVisitsPerMonth
        ? { isActive: false, status: 'passes_exhausted' }
        : {}),
    });
    await batch.commit();
  },

  async create(checkIn: CheckIn): Promise<void> {
    await adminDb.collection('checkIns').doc(checkIn.id).set({
      ...checkIn,
      gymId: checkIn.gymId.trim(),
      timestamp: admin.firestore.Timestamp.fromDate(checkIn.timestamp),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },

  async getTodayCheckIn(userId: string, gymId?: string): Promise<CheckIn | null> {
    const { start: today, end: tomorrow } = getAmmanDayRange(new Date());

    // Query only by userId to avoid composite index requirements,
    // then filter today's check-ins in memory.
    const snapshot = await adminDb
      .collection('checkIns')
      .where('userId', '==', userId)
      .get();

    if (snapshot.empty) return null;

    const todayDocs = snapshot.docs.filter((doc) => {
      const data: any = doc.data();
      const ts = timestampToDate(data.timestamp);
      const matchesGym = gymId ? data.gymId === gymId : true;
      return matchesGym && ts >= today && ts < tomorrow;
    });

    if (todayDocs.length === 0) return null;

    // If multiple docs exist for today, take the latest by timestamp.
    const latestDoc = todayDocs.sort((a, b) => {
      const aTime = timestampToDate((a.data() as any).timestamp).getTime();
      const bTime = timestampToDate((b.data() as any).timestamp).getTime();
      return bTime - aTime;
    })[0];

    const data = latestDoc.data() as any;
    return {
      id: latestDoc.id,
      userId: data.userId,
      gymId: data.gymId,
      timestamp: timestampToDate(data.timestamp),
      subscriptionId: data.subscriptionId,
    };
  },

  async hasCheckInOnDate(userId: string, targetDate: Date): Promise<boolean> {
    const start = startOfAmmanDay(toAmmanDateString(targetDate));
    const end = getAmmanDayRange(start).end;

    const snapshot = await adminDb
      .collection('checkIns')
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.some((doc) => {
      const data: any = doc.data();
      const ts = timestampToDate(data.timestamp);
      return ts >= start && ts < end;
    });
  },
};

function mapGymOwnerDoc(doc: admin.firestore.QueryDocumentSnapshot): GymOwner {
  const data = doc.data();
  return {
    id: doc.id,
    gymId: data.gymId,
    username: data.username,
    usernameNormalized: data.usernameNormalized,
    password: data.password,
    passwordHash: data.passwordHash,
    email: data.email,
    name: data.name,
    createdAt: timestampToDate(data.createdAt),
  };
}

export type GymOwnerLoginLookupResult = {
  owner: GymOwner | null;
  lookupMethod: string;
};

export type GymOwnerLoginLookupAllResult = {
  owners: GymOwner[];
  lookupMethod: string;
};

// Gym Owners collection
export const firestoreGymOwners = {
  async getByUsername(username: string): Promise<GymOwner | null> {
    const result = await this.findByLoginUsername(username);
    return result.owner;
  },

  /**
   * Return every gym owner record that matches the submitted username after normalization.
   * Used by login to verify passwords against all duplicates (Firestore query order is not stable).
   */
  async findAllByLoginUsername(rawUsername: string): Promise<GymOwnerLoginLookupAllResult> {
    const trimmed = sanitizeGymOwnerUsernameInput(rawUsername);
    const normalized = normalizeGymOwnerUsername(trimmed);

    if (!normalized) {
      return { owners: [], lookupMethod: 'empty' };
    }

    const owners: GymOwner[] = [];
    const seenIds = new Set<string>();

    const addDocs = (docs: admin.firestore.QueryDocumentSnapshot[], method: string) => {
      for (const doc of docs) {
        if (seenIds.has(doc.id)) continue;
        seenIds.add(doc.id);
        owners.push(mapGymOwnerDoc(doc));
      }
      return method;
    };

    const queryField = async (
      field: 'username' | 'usernameNormalized',
      value: string
    ): Promise<admin.firestore.QueryDocumentSnapshot[]> => {
      const snapshot = await adminDb.collection('gymOwners').where(field, '==', value).get();
      return snapshot.docs;
    };

    // 1. Canonical indexed lookup (case-insensitive login)
    let lookupMethod = 'usernameNormalized';
    addDocs(await queryField('usernameNormalized', normalized), lookupMethod);
    if (owners.length > 0) {
      return { owners, lookupMethod };
    }

    // 2. Lowercase username field (legacy records missing usernameNormalized)
    lookupMethod = 'username_lowercase';
    addDocs(await queryField('username', normalized), lookupMethod);
    if (owners.length > 0) {
      return { owners, lookupMethod };
    }

    // 3. Exact trimmed username (legacy mixed-case records)
    if (trimmed !== normalized) {
      lookupMethod = 'exact_trimmed';
      addDocs(await queryField('username', trimmed), lookupMethod);
      if (owners.length > 0) {
        return { owners, lookupMethod };
      }
    }

    // 4. Full scan for whitespace / invisible-character legacy mismatches
    lookupMethod = 'scan_normalized';
    const all = await adminDb.collection('gymOwners').get();
    const matches = all.docs.filter((doc) => {
      const stored = doc.data().username;
      return typeof stored === 'string' && usernamesMatchForLogin(stored, trimmed);
    });
    addDocs(matches, lookupMethod);

    if (owners.length === 0) {
      return { owners: [], lookupMethod: 'not_found' };
    }

    return { owners, lookupMethod };
  },

  /**
   * Resilient login lookup: usernameNormalized index first, then legacy fallbacks.
   * Prefer findAllByLoginUsername for authentication (handles duplicate records safely).
   */
  async findByLoginUsername(rawUsername: string): Promise<GymOwnerLoginLookupResult> {
    const result = await this.findAllByLoginUsername(rawUsername);
    if (result.owners.length === 0) {
      return { owner: null, lookupMethod: result.lookupMethod };
    }
    if (result.owners.length > 1) {
      console.warn(
        '[GymOwnerAuth] Multiple owners normalize to same username; returning first of',
        result.owners.length
      );
    }
    return { owner: result.owners[0], lookupMethod: result.lookupMethod };
  },

  /** Backfill canonical username fields after a successful normalized match. */
  async ensureUsernameCanonical(owner: GymOwner): Promise<void> {
    const usernameNormalized = normalizeGymOwnerUsername(owner.username);
    if (!usernameNormalized) return;

    const updates: Record<string, string> = {};
    if (owner.usernameNormalized !== usernameNormalized) {
      updates.usernameNormalized = usernameNormalized;
    }
    if (owner.username !== usernameNormalized) {
      updates.username = usernameNormalized;
    }
    if (Object.keys(updates).length === 0) return;

    await adminDb.collection('gymOwners').doc(owner.id).set(updates, { merge: true });
  },

  async getByGymId(gymId: string): Promise<GymOwner | null> {
    const snapshot = await adminDb
      .collection('gymOwners')
      .where('gymId', '==', gymId)
      .limit(1)
      .get();
    
    if (snapshot.empty) return null;
    return mapGymOwnerDoc(snapshot.docs[0]);
  },

  async create(gymOwner: GymOwner): Promise<void> {
    const usernameNormalized = normalizeGymOwnerUsername(gymOwner.username);
    await adminDb.collection('gymOwners').doc(gymOwner.id).set({
      ...gymOwner,
      username: usernameNormalized || gymOwner.username,
      usernameNormalized,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },

  async getAll(): Promise<GymOwner[]> {
    const snapshot = await adminDb.collection('gymOwners').get();
    return snapshot.docs.map(mapGymOwnerDoc);
  },

  async delete(gymOwnerId: string): Promise<void> {
    await adminDb.collection('gymOwners').doc(gymOwnerId).delete();
  },
};

// Payments collection (for MPGS transactions)
export const firestorePayments = {
  async getById(paymentId: string): Promise<any | null> {
    const doc = await adminDb.collection('payments').doc(paymentId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  async create(payment: any): Promise<void> {
    const id = payment?.id;
    if (!id || typeof id !== 'string') {
      throw new Error('[firestorePayments] Missing payment.id');
    }
    // Filter out undefined values (Firestore doesn't allow undefined)
    const filteredPayment: any = {};
    for (const [key, value] of Object.entries(payment)) {
      if (value !== undefined) {
        filteredPayment[key] = value;
      }
    }
    
    const data: any = {
      ...filteredPayment,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Avoid storing raw card numbers if accidentally passed in
    if (data.cardNumber) delete data.cardNumber;
    if (data.cvv) delete data.cvv;
    await adminDb.collection('payments').doc(id).set(data, { merge: true });
  },

  async update(paymentId: string, updates: any): Promise<void> {
    // Filter out undefined values (Firestore doesn't allow undefined)
    const filteredUpdates: any = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    
    const data: any = {
      ...filteredUpdates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (data.cardNumber) delete data.cardNumber;
    if (data.cvv) delete data.cvv;
    await adminDb.collection('payments').doc(paymentId).set(data, { merge: true });
  },

  async listByUser(userId: string): Promise<any[]> {
    const snapshot = await adminDb
      .collection('payments')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  async listAll(): Promise<any[]> {
    const snapshot = await adminDb
      .collection('payments')
      .where('status', '==', 'succeeded')
      .get();

    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
};

// Coupons collection
export const firestoreCoupons = {
  async getAll(): Promise<Coupon[]> {
    const snapshot = await adminDb.collection('coupons').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
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

  async getAllPaginated(limit: number = 20, offset: number = 0): Promise<{ coupons: Coupon[]; total: number; hasMore: boolean }> {
    // Get total count (optimized - only count documents)
    const countSnapshot = await adminDb.collection('coupons').count().get();
    const total = countSnapshot.data().count;

    // Get paginated results
    let query = adminDb.collection('coupons').orderBy('createdAt', 'desc');
    
    if (offset > 0) {
      // Get the offset document for cursor-based pagination
      const offsetSnapshot = await adminDb
        .collection('coupons')
        .orderBy('createdAt', 'desc')
        .limit(offset)
        .get();
      
      if (!offsetSnapshot.empty) {
        const lastDoc = offsetSnapshot.docs[offsetSnapshot.docs.length - 1];
        query = query.startAfter(lastDoc);
      }
    }
    
    const snapshot = await query.limit(limit).get();
    
    const coupons = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        code: data.code || '',
        discountPercent: data.discountPercent || 0,
        isActive: !!data.isActive,
        createdAt: timestampToDate(data.createdAt),
        usageLimit: data.usageLimit ?? null,
        usedCount: data.usedCount || 0,
        expiresAt: data.expiresAt ? timestampToDate(data.expiresAt) : null,
      };
    });

    return {
      coupons,
      total,
      hasMore: offset + coupons.length < total,
    };
  },

  async getByCode(code: string): Promise<Coupon | null> {
    const upperCode = code.toUpperCase().trim();
    const snapshot = await adminDb
      .collection('coupons')
      .where('code', '==', upperCode)
      .limit(1)
      .get();
    
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      code: data.code || '',
      discountPercent: data.discountPercent || 0,
      isActive: !!data.isActive,
      createdAt: timestampToDate(data.createdAt),
      usageLimit: data.usageLimit ?? null,
      usedCount: data.usedCount || 0,
      expiresAt: data.expiresAt ? timestampToDate(data.expiresAt) : null,
    };
  },

  async getById(couponId: string): Promise<Coupon | null> {
    const doc = await adminDb.collection('coupons').doc(couponId).get();
    if (!doc.exists) return null;
    
    const data = doc.data();
    if (!data) return null;
    
    return {
      id: doc.id,
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
    await adminDb.collection('coupons').doc(coupon.id).set({
      code: coupon.code.toUpperCase().trim(),
      discountPercent: coupon.discountPercent,
      isActive: coupon.isActive,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      usageLimit: coupon.usageLimit ?? null,
      usedCount: coupon.usedCount || 0,
      expiresAt: coupon.expiresAt ? admin.firestore.Timestamp.fromDate(coupon.expiresAt) : null,
    });
  },

  async update(couponId: string, updates: Partial<Coupon>): Promise<void> {
    const updateData: any = { ...updates };
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase().trim();
    }
    if (updateData.expiresAt && updateData.expiresAt instanceof Date) {
      updateData.expiresAt = admin.firestore.Timestamp.fromDate(updateData.expiresAt);
    }
    await adminDb.collection('coupons').doc(couponId).update(updateData);
  },

  async delete(couponId: string): Promise<void> {
    await adminDb.collection('coupons').doc(couponId).delete();
  },

  async incrementUsage(couponId: string): Promise<void> {
    const couponDoc = await adminDb.collection('coupons').doc(couponId).get();
    if (!couponDoc.exists) {
      throw new Error('Coupon not found');
    }
    const currentCount = couponDoc.data()?.usedCount || 0;
    await adminDb.collection('coupons').doc(couponId).update({
      usedCount: currentCount + 1,
    });
  },
};

// Payouts collection
export const firestorePayouts = {
  async getAll(): Promise<Payout[]> {
    const snapshot = await adminDb.collection('payouts').get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        gymId: data.gymId,
        gymName: data.gymName,
        month: data.month,
        totalCheckins: data.totalCheckins || 0,
        amount: data.amount || 0,
        payPerVisitRate: data.payPerVisitRate || 0,
        status: (data.status as 'pending' | 'paid') || 'pending',
        paidAt: data.paidAt ? timestampToDate(data.paidAt) : null,
        createdAt: data.createdAt ? timestampToDate(data.createdAt) : new Date(),
      };
    });
  },

  async create(payout: Omit<Payout, 'id' | 'createdAt'>): Promise<string> {
    const ref = adminDb.collection('payouts').doc();
    await ref.set({
      ...payout,
      status: payout.status || 'pending',
      paidAt: payout.paidAt ? admin.firestore.Timestamp.fromDate(payout.paidAt) : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async update(payoutId: string, updates: Partial<Payout>): Promise<void> {
    const updateData: any = { ...updates };
    if (updates.paidAt) {
      updateData.paidAt = admin.firestore.Timestamp.fromDate(updates.paidAt);
    }
    await adminDb.collection('payouts').doc(payoutId).update(updateData);
  },

  async markPaid(payoutId: string): Promise<void> {
    await adminDb.collection('payouts').doc(payoutId).update({
      status: 'paid',
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },
};

// Wallet Transactions collection
export const firestoreWalletTransactions = {
  async create(transaction: Omit<WalletTransaction, 'id'>): Promise<string> {
    const ref = adminDb.collection('walletTransactions').doc();
    await ref.set({
      ...transaction,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async getByUserId(userId: string): Promise<WalletTransaction[]> {
    const snapshot = await adminDb
      .collection('walletTransactions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        type: data.type,
        amount: data.amount,
        description: data.description,
        relatedUserId: data.relatedUserId,
        subscriptionId: data.subscriptionId,
        createdAt: timestampToDate(data.createdAt),
      };
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
  payments: firestorePayments,
  coupons: firestoreCoupons,
  walletTransactions: firestoreWalletTransactions,
};

