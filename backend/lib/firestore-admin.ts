import { adminDb } from './firebase-admin';
import { User, Subscription, Gym, CheckIn, GymOwner } from '@/types';
import admin from 'firebase-admin';

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
    
    return {
      id: userDoc.id,
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      referralCode: data.referralCode || '',
      walletBalance: data.walletBalance || 0,
      createdAt: timestampToDate(data.createdAt),
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
      return {
        id: doc.id,
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        referralCode: data.referralCode || '',
        walletBalance: data.walletBalance || 0,
        createdAt: timestampToDate(data.createdAt),
      };
    });
  },
};

// Subscriptions collection
export const firestoreSubscriptions = {
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
    };
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

  async delete(gymId: string): Promise<void> {
    await adminDb.collection('gyms').doc(gymId).delete();
  },
};

// Check-ins collection
export const firestoreCheckIns = {
  async getByUserId(userId: string): Promise<CheckIn[]> {
    const snapshot = await adminDb
      .collection('checkIns')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .get();
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        gymId: data.gymId,
        timestamp: timestampToDate(data.timestamp),
        subscriptionId: data.subscriptionId,
      };
    });
  },

  async getByGymId(gymId: string): Promise<CheckIn[]> {
    const snapshot = await adminDb
      .collection('checkIns')
      .where('gymId', '==', gymId)
      .orderBy('timestamp', 'desc')
      .get();
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        gymId: data.gymId,
        timestamp: timestampToDate(data.timestamp),
        subscriptionId: data.subscriptionId,
      };
    });
  },

  async getAll(): Promise<CheckIn[]> {
    const snapshot = await adminDb.collection('checkIns').get();
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        gymId: data.gymId,
        timestamp: timestampToDate(data.timestamp),
        subscriptionId: data.subscriptionId,
      };
    });
  },

  async create(checkIn: CheckIn): Promise<void> {
    await adminDb.collection('checkIns').doc(checkIn.id).set({
      ...checkIn,
      timestamp: admin.firestore.Timestamp.fromDate(checkIn.timestamp),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },

  async getTodayCheckIn(userId: string): Promise<CheckIn | null> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const snapshot = await adminDb
      .collection('checkIns')
      .where('userId', '==', userId)
      .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(today))
      .where('timestamp', '<', admin.firestore.Timestamp.fromDate(tomorrow))
      .limit(1)
      .get();

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
export const firestoreGymOwners = {
  async getByUsername(username: string): Promise<GymOwner | null> {
    const snapshot = await adminDb
      .collection('gymOwners')
      .where('username', '==', username)
      .limit(1)
      .get();
    
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
    const snapshot = await adminDb
      .collection('gymOwners')
      .where('gymId', '==', gymId)
      .limit(1)
      .get();
    
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
    await adminDb.collection('gymOwners').doc(gymOwner.id).set({
      ...gymOwner,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },

  async getAll(): Promise<GymOwner[]> {
    const snapshot = await adminDb.collection('gymOwners').get();
    return snapshot.docs.map(doc => {
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
    });
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
    const data: any = {
      ...payment,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Avoid storing raw card numbers if accidentally passed in
    if (data.cardNumber) delete data.cardNumber;
    if (data.cvv) delete data.cvv;
    await adminDb.collection('payments').doc(id).set(data, { merge: true });
  },

  async update(paymentId: string, updates: any): Promise<void> {
    const data: any = {
      ...updates,
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
};

// Export all services
export default {
  users: firestoreUsers,
  subscriptions: firestoreSubscriptions,
  gyms: firestoreGyms,
  checkIns: firestoreCheckIns,
  gymOwners: firestoreGymOwners,
  payments: firestorePayments,
};

