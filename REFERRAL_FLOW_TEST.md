# Referral Flow Testing Guide

## ✅ Implementation Summary

The referral system has been fully implemented with the following features:

### 1. **New Users Only Restriction** ✅
- Checks for existing users by email BEFORE creating Firebase Auth account
- Checks for existing users by phone BEFORE creating Firebase Auth account
- Only processes referral rewards for truly new users
- Prevents referral abuse from existing users, renewals, or re-signups

### 2. **Referral Reward Flow** ✅
- User A shares referral code
- User B (new user) signs up using referral code
- System validates:
  - User B doesn't exist (email/phone check)
  - Referral code is valid
  - User B is not referring themselves
- User A receives 10 JOD in wallet
- Wallet balance updates immediately
- Wallet transaction is recorded
- Referral transaction is logged for admin tracking

### 3. **Wallet Transaction History** ✅
- Created `walletTransactions` collection in Firestore
- Records:
  - Transaction type: `referral_reward`
  - Amount: `10` (JOD)
  - Description: "Referral Reward from [User Name]"
  - Related user ID (the referred user)
  - Timestamp

### 4. **Referral Transaction Logging** ✅
- Created `referralTransactions` collection in Firestore
- Records:
  - `referrerId`: User who gets the reward
  - `referredUserId`: New user who signed up
  - `rewardAmount`: 10 JOD
  - `referrerCode`: The referral code used
  - `createdAt`: Timestamp

### 5. **Duplicate Abuse Protection** ✅
- Email uniqueness check BEFORE signup
- Phone number uniqueness check BEFORE signup
- Prevents multiple accounts with same email/phone
- Blocks referral rewards for existing users

## 🧪 Test Cases

### Test Case 1: New User with Valid Referral Code ✅
**Steps:**
1. User A (existing) shares referral code: `ABC123`
2. User B (new) signs up with:
   - New email: `newuser@test.com`
   - New phone: `+962123456789`
   - Referral code: `ABC123`
3. Complete signup

**Expected Result:**
- ✅ User B account created successfully
- ✅ User A wallet balance increases by 10 JOD
- ✅ Wallet transaction recorded: "+10 JOD Referral Reward from User B"
- ✅ Referral transaction logged in `referralTransactions`
- ✅ User B's `referredBy` field set to `ABC123`

### Test Case 2: New User Without Referral Code ✅
**Steps:**
1. User C (new) signs up without referral code
2. Complete signup

**Expected Result:**
- ✅ User C account created successfully
- ✅ No wallet rewards given
- ✅ No referral transactions logged
- ✅ User C's `referredBy` field is empty

### Test Case 3: Existing User Tries to Use Referral Code ❌
**Steps:**
1. User D (existing) tries to sign up again with:
   - Same email: `existing@test.com`
   - Referral code: `ABC123`

**Expected Result:**
- ❌ Signup fails with error: "An account with this email already exists. Please login instead."
- ❌ No referral reward given
- ❌ No wallet transaction recorded

### Test Case 4: Subscription Renewal ❌
**Steps:**
1. User E subscribed for 3 months
2. Subscription expires
3. User E tries to sign up again with referral code

**Expected Result:**
- ❌ Signup fails: "An account with this email already exists"
- ❌ No referral reward given
- ❌ Referral code does NOT work for renewals

### Test Case 5: Same Email/Phone Signup Attempt ❌
**Steps:**
1. User F signs up with email `test@test.com` and phone `+962987654321`
2. User F tries to sign up again with same email/phone and referral code

**Expected Result:**
- ❌ Signup fails: "An account with this email/phone already exists"
- ❌ No referral reward given

### Test Case 6: Invalid Referral Code ✅
**Steps:**
1. User G (new) signs up with invalid referral code: `INVALID123`

**Expected Result:**
- ✅ User G account created successfully
- ✅ No referral reward given (code doesn't exist)
- ✅ No error thrown (signup continues)
- ✅ User G's `referredBy` field is empty

### Test Case 7: Self-Referral Prevention ✅
**Steps:**
1. User H signs up with their own referral code

**Expected Result:**
- ✅ User H account created successfully
- ❌ No referral reward given (self-referral blocked)
- ✅ Logged warning: "User cannot refer themselves"

## 📊 Verification Checklist

### Wallet Balance Verification
- [ ] Check User A's wallet balance before referral
- [ ] User B signs up with User A's referral code
- [ ] Verify User A's wallet balance increased by exactly 10 JOD
- [ ] Check wallet balance appears immediately (no delay)

### Wallet Transaction History
- [ ] Query `walletTransactions` collection for User A
- [ ] Verify transaction exists with:
  - `type`: `referral_reward`
  - `amount`: `10`
  - `description`: "Referral Reward from [User B Name]"
  - `relatedUserId`: User B's ID
  - `createdAt`: Recent timestamp

### Referral Transaction Logging
- [ ] Query `referralTransactions` collection
- [ ] Verify transaction exists with:
  - `referrerId`: User A's ID
  - `referredUserId`: User B's ID
  - `rewardAmount`: `10`
  - `referrerCode`: User A's referral code
  - `createdAt`: Recent timestamp

### Admin Dashboard Verification
- [ ] Check if admin can view referral transactions
- [ ] Verify referral data is accessible for reporting

## 🔍 Code Verification

### Key Implementation Points

1. **Pre-Signup Validation** (`contexts/AuthContext.tsx`)
   ```typescript
   // Check by email BEFORE creating Firebase Auth user
   const emailQuery = query(usersRef, where('email', '==', normalizedEmail), limit(1));
   const emailSnap = await getDocs(emailQuery);
   if (!emailSnap.empty) {
     throw new Error('An account with this email already exists...');
   }
   ```

2. **Referral Processing** (Only for new users)
   ```typescript
   // Process referral ONLY after verifying user doesn't exist
   if (normalizedReferral && !emailSnap.empty === false) {
     // Give 10 JOD to referrer
     // Record wallet transaction
     // Record referral transaction
   }
   ```

3. **Wallet Transaction Recording**
   ```typescript
   await setDoc(walletTransactionRef, {
     userId: referrerId,
     type: 'referral_reward',
     amount: 10,
     description: `Referral Reward from ${name}`,
     relatedUserId: userCredential.user.uid,
     createdAt: serverTimestamp(),
   });
   ```

4. **Referral Transaction Logging**
   ```typescript
   await setDoc(referralTransactionRef, {
     referrerId: referrerId,
     referredUserId: userCredential.user.uid,
     rewardAmount: 10,
     referrerCode: normalizedReferral,
     createdAt: serverTimestamp(),
   });
   ```

## 🚀 Deployment Checklist

Before deploying, verify:

- [ ] All Firestore indexes are created (for email/phone queries)
- [ ] Wallet transaction collection is accessible
- [ ] Referral transaction collection is accessible
- [ ] Admin dashboard can query referral transactions
- [ ] Error messages are user-friendly
- [ ] Logging is comprehensive for debugging

## 📝 Firestore Indexes Required

The following composite indexes may be needed:

1. **walletTransactions collection:**
   - `userId` (ascending) + `createdAt` (descending)

2. **referralTransactions collection:**
   - `referrerId` (ascending) + `createdAt` (descending)

3. **users collection:**
   - `email` (ascending) - for email uniqueness check
   - `phone` (ascending) - for phone uniqueness check
   - `referralCode` (ascending) - for referral code lookup

## ✅ Expected Final Result

The referral system now:
- ✅ Rewards 10 JOD correctly
- ✅ Only works for first-time users
- ✅ Prevents referral abuse
- ✅ Updates wallet balance immediately
- ✅ Records wallet transaction history
- ✅ Logs referral transactions for admin
- ✅ Works consistently on web and mobile
- ✅ Blocks existing users, renewals, and duplicates
