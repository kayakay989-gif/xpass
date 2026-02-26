export type SubscriptionTier = 'silver' | 'gold' | 'diamond' | 'elite';
export type SubscriptionDuration = 1 | 3 | 6 | 9 | 12;
export type GymCategory = 'standard' | 'premium' | 'diamond' | 'elite';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  age?: number;
  photoUrl?: string;
  password?: string;
  googleId?: string;
  referralCode: string;
  // Referral code used at signup (referrer's code)
  referredBy?: string;
  walletBalance: number;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  duration: SubscriptionDuration;
  startDate: Date;
  endDate: Date;
  monthlyPrice: number;
  totalPrice: number;
  visitsUsed: number;
  maxVisitsPerMonth: number;
  isActive: boolean;
}

export interface Gym {
  id: string;
  name: string;
  category: GymCategory;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  amenities: string[];
  facilities?: string[]; // New field for facilities filter
  hours: string;
  imageUrl: string;
  allowedTiers: SubscriptionTier[];
  membershipModel?: 'pay_per_visit' | string; // Pricing model
  pricePerVisit?: number; // Amount XPASS pays gym per check-in (JOD)
  gymImages?: string[]; // Additional gallery images for the gym
}

export interface CheckIn {
  id: string;
  userId: string;
  gymId: string;
  timestamp: Date;
  subscriptionId: string;
  payoutAmount?: number; // Amount earned by gym for this check-in (stored at check-in time)
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface SpotlightBanner {
  id: string;
  imageUrl: string;
  title?: string;
  linkUrl?: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';

export interface Payment {
  id: string;
  userId: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentIntentId: string;
  tier: SubscriptionTier;
  duration: SubscriptionDuration;
  createdAt: Date;
  completedAt?: Date;
}

export interface GymOwner {
  id: string;
  gymId: string;
  username: string;
  // Legacy (do not use in production): plaintext password
  password?: string;
  // Production: hashed password string (pbkdf2:...)
  passwordHash?: string;
  email?: string;
  name?: string;
  createdAt: Date;
}