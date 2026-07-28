import { User, Subscription, Gym, CheckIn } from '@/types';
import { MOCK_GYMS } from '@/mocks/gyms';
import { isSameAmmanCalendarDay } from '@/lib/jordan-time';

type InMemoryStore = {
  users: User[];
  subscriptions: Subscription[];
  gyms: Gym[];
  checkIns: CheckIn[];
  payments: any[];
  initialized: boolean;
};

const memoryStore: InMemoryStore = {
  users: [],
  subscriptions: [],
  gyms: [],
  checkIns: [],
  payments: [],
  initialized: false,
};

async function initializeDB(): Promise<void> {
  if (!memoryStore.initialized) {
    console.log('[DB] Initializing database with seed data...');
    
    const mockUser: User = {
      id: '1',
      name: 'Hamza',
      email: 'hamza@example.com',
      phone: '+962 79 123 4567',
      referralCode: 'XPASS123',
      walletBalance: 25,
      createdAt: new Date('2024-01-15'),
    };

    const mockSubscription: Subscription = {
      id: 'sub-1',
      userId: '1',
      tier: 'silver',
      duration: 3,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-04-01'),
      monthlyPrice: 50,
      totalPrice: 150,
      visitsUsed: 2,
      maxVisitsPerMonth: 30,
      isActive: true,
    };

    const mockCheckIns: CheckIn[] = [
      {
        id: 'ci-1',
        userId: '1',
        gymId: '1',
        timestamp: new Date('2025-01-05T08:30:00'),
        subscriptionId: 'sub-1',
      },
      {
        id: 'ci-2',
        userId: '1',
        gymId: '2',
        timestamp: new Date('2025-01-07T18:00:00'),
        subscriptionId: 'sub-1',
      },
      {
        id: 'ci-3',
        userId: '1',
        gymId: '1',
        timestamp: new Date(),
        subscriptionId: 'sub-1',
      },
      {
        id: 'ci-4',
        userId: '1',
        gymId: '1',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        subscriptionId: 'sub-1',
      },
      {
        id: 'ci-5',
        userId: '1',
        gymId: '1',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        subscriptionId: 'sub-1',
      },
      {
        id: 'ci-6',
        userId: '1',
        gymId: '1',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        subscriptionId: 'sub-1',
      },
    ];

    memoryStore.users = [mockUser];
    memoryStore.subscriptions = [mockSubscription];
    memoryStore.gyms = [...MOCK_GYMS];
    memoryStore.checkIns = mockCheckIns;
    memoryStore.initialized = true;

    console.log('[DB] Database initialized successfully');
  }
}

export const db = {
  async init(): Promise<void> {
    await initializeDB();
  },

  users: {
    async getById(id: string): Promise<User | null> {
      const user = memoryStore.users.find(u => u.id === id);
      return user || null;
    },

    async update(id: string, updates: Partial<User>): Promise<User | null> {
      const index = memoryStore.users.findIndex(u => u.id === id);
      
      if (index === -1) return null;
      
      memoryStore.users[index] = { ...memoryStore.users[index], ...updates };
      
      return memoryStore.users[index];
    },

    async create(user: User): Promise<User> {
      memoryStore.users.push(user);
      return user;
    },

    async getByPhone(phone: string): Promise<User | null> {
      const user = memoryStore.users.find(u => u.phone === phone);
      return user || null;
    },

    async getByEmail(email: string): Promise<User | null> {
      const user = memoryStore.users.find(u => u.email === email);
      return user || null;
    },

    async getAll(): Promise<User[]> {
      return memoryStore.users;
    },
  },

  subscriptions: {
    async getByUserId(userId: string): Promise<Subscription | null> {
      const subscription = memoryStore.subscriptions.find(s => s.userId === userId && s.isActive);
      return subscription || null;
    },

    async create(subscription: Subscription): Promise<Subscription> {
      const existingIndex = memoryStore.subscriptions.findIndex(
        s => s.userId === subscription.userId && s.isActive
      );
      
      if (existingIndex !== -1) {
        memoryStore.subscriptions[existingIndex] = { ...memoryStore.subscriptions[existingIndex], isActive: false };
      }
      
      memoryStore.subscriptions.push(subscription);
      
      return subscription;
    },

    async update(id: string, updates: Partial<Subscription>): Promise<Subscription | null> {
      const index = memoryStore.subscriptions.findIndex(s => s.id === id);
      
      if (index === -1) return null;
      
      memoryStore.subscriptions[index] = { ...memoryStore.subscriptions[index], ...updates };
      
      return memoryStore.subscriptions[index];
    },
  },

  gyms: {
    async getAll(): Promise<Gym[]> {
      return memoryStore.gyms;
    },

    async getById(id: string): Promise<Gym | null> {
      return memoryStore.gyms.find(g => g.id === id) || null;
    },

    async create(gym: Gym): Promise<Gym> {
      memoryStore.gyms.push(gym);
      return gym;
    },

    async delete(id: string): Promise<boolean> {
      const index = memoryStore.gyms.findIndex(g => g.id === id);
      if (index === -1) return false;
      memoryStore.gyms.splice(index, 1);
      return true;
    },
  },

  checkIns: {
    async getByUserId(userId: string): Promise<CheckIn[]> {
      return memoryStore.checkIns.filter(ci => ci.userId === userId);
    },

    async getByGymId(gymId: string): Promise<CheckIn[]> {
      return memoryStore.checkIns.filter(ci => ci.gymId === gymId);
    },

    async getAll(): Promise<CheckIn[]> {
      return memoryStore.checkIns;
    },

    async create(checkIn: CheckIn): Promise<CheckIn> {
      memoryStore.checkIns.push(checkIn);
      return checkIn;
    },

    async getTodayCheckIn(userId: string, gymId?: string): Promise<CheckIn | null> {
      const checkIns = await this.getByUserId(userId);
      const now = new Date();

      const todayCheckIn = checkIns.find((ci) => {
        const matchesGym = gymId ? ci.gymId === gymId : true;
        return matchesGym && isSameAmmanCalendarDay(new Date(ci.timestamp), now);
      });

      return todayCheckIn || null;
    },
  },

  payments: {
    async getByGymId(gymId: string): Promise<any[]> {
      const gymCheckIns = memoryStore.checkIns.filter(ci => ci.gymId === gymId);
      const userIds = Array.from(new Set(gymCheckIns.map(ci => ci.userId)));
      
      return memoryStore.payments.filter(p => userIds.includes(p.userId));
    },

    async create(payment: any) {
      memoryStore.payments.push(payment);
      return payment;
    },

    async update(id: string, updates: any) {
      const idx = memoryStore.payments.findIndex(p => p.id === id);
      if (idx === -1) return null;
      memoryStore.payments[idx] = { ...memoryStore.payments[idx], ...updates };
      return memoryStore.payments[idx];
    },

    async getById(id: string) {
      return memoryStore.payments.find(p => p.id === id) || null;
    },

    async list() {
      return memoryStore.payments;
    },
  },
};
