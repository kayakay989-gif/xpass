export type SubscriptionTier = 'silver' | 'gold' | 'diamond' | 'elite';
export type SubscriptionDuration = 1 | 3 | 6 | 9 | 12;
export type GymCategory = 'standard' | 'premium' | 'diamond' | 'elite';

export interface SavedCard {
  id: string; // Unique ID for this saved card
  token: string; // MPGS card token (never store raw card numbers)
  last4: string; // Last 4 digits of card
  brand?: string; // Card brand (VISA, MASTERCARD, etc.)
  expiryMonth?: string; // Expiry month (MM)
  expiryYear?: string; // Expiry year (YY)
  cardholderName?: string; // Cardholder name
  isDefault?: boolean; // Whether this is the default card
  createdAt: Date; // When the card was saved
}

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
  phoneVerified?: boolean;
  phoneVerifiedAt?: Date;
  savedCards?: SavedCard[]; // Saved payment cards (Version 1 feature)
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
  // Optional lifecycle / billing metadata (for admin analytics)
  status?: string | null; // e.g. "active", "active_until_expiry"
  paymentStatus?: string | null; // e.g. "paid", "pending"
  autoRenew?: boolean | null;
  createdAt?: Date;
  lastCheckInDate?: Date;
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
   // Optional detailed timings and open days
  // Stored as a free-form object on the gym document, used mainly by the admin UI
  // Example shape:
  // timings: {
  //   men: { from: '6:00 AM', to: '10:00 PM' },
  //   women: { from: '6:00 AM', to: '10:00 PM' },
  //   mixed: { from: '6:00 AM', to: '10:00 PM' }
  // }
  // openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  timings?: any;
  openDays?: string[];
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

export interface SpotlightImage {
  id: string;
  imageUrl: string;
  position: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
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
  // Wallet payment fields
  walletUsed?: number; // Amount paid from wallet
  cardAmount?: number; // Amount paid via card (deprecated, use externalPaymentAmount)
  totalAmount?: number; // Total amount (walletUsed + cardAmount)
  // Payment method fields
  paymentMethod?: 'card' | 'apple_pay' | 'google_pay' | 'wallet'; // Payment method used
  externalPaymentAmount?: number; // Amount paid via external payment method (Apple Pay, Google Pay, or Card)
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

export interface Coupon {
  id: string;
  code: string; // uppercase unique coupon code
  discountPercent: number; // 1 - 100
  isActive: boolean;
  createdAt: Date;
  usageLimit: number | null; // optional, null means unlimited
  usedCount: number;
  expiresAt: Date | null; // optional expiration date
}

export type PayoutStatus = 'pending' | 'paid';

export interface Payout {
  id: string;
  gymId: string;
  gymName: string;
  month: string; // e.g. "2026-03"
  totalCheckins: number;
  amount: number;
  payPerVisitRate?: number; // Average rate per visit (JOD)
  status: PayoutStatus;
  paidAt: Date | null;
  createdAt: Date;
}

export type WalletTransactionType = 'referral_reward' | 'payment' | 'refund' | 'adjustment' | 'subscription_payment';

export interface WalletTransaction {
  id: string;
  userId: string;
  type: WalletTransactionType;
  amount: number; // Positive for credit, negative for debit
  description: string;
  relatedUserId?: string; // For referral rewards, the referred user's ID
  subscriptionId?: string; // For subscription payments, the subscription ID
  createdAt: Date;
}

export interface ReferralTransaction {
  id: string;
  referrerId: string; // User who gets the reward
  referredUserId: string; // New user who signed up
  rewardAmount: number; // Always 10 JOD
  referrerCode: string; // The referral code used
  createdAt: Date;
}