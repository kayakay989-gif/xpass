# XPASS Authentication System

## Overview
The XPASS app now has a fully functional authentication system supporting multiple login methods: email/password, phone/password, and Google login.

## Features

### Sign Up
Users can register with:
- **Full Name** (required)
- **Email** (required)
- **Phone Number** (Jordan numbers only - 9 digits without +962)
- **Password** (minimum 6 characters)

### Login
Users can login using:
1. **Email + Password**
2. **Phone Number + Password** (with or without +962 prefix)
3. **Google Login** (mock implementation - can be replaced with real Google OAuth)

## Backend Routes

### 1. Register (`auth.register`)
- **Input**: `{ name, email, phone, password }`
- **Phone Format**: Must be Jordan number in format `+962XXXXXXXXX`
- **Validation**: 
  - Checks for duplicate email
  - Checks for duplicate phone
  - Creates new user with auto-generated referral code
- **Output**: `{ success, user, token }`

### 2. Login (`auth.login`)
- **Input**: `{ identifier, password }`
- **Identifier**: Can be email OR phone number
- **Auto-detection**: Checks if identifier contains '@' to determine email vs phone
- **Output**: `{ success, user, token }`

### 3. Google Login (`auth.googleLogin`)
- **Input**: `{ email, name, googleId }`
- **Behavior**: 
  - Creates new user if doesn't exist
  - Returns existing user if email matches
- **Output**: `{ success, user, token }`

## Database Updates

### User Model
```typescript
interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  password?: string;      // NEW: For email/password login
  googleId?: string;      // NEW: For Google OAuth
  referralCode: string;
  walletBalance: number;
  createdAt: Date;
}
```

### New DB Methods
- `db.users.getByEmail(email)` - Find user by email
- `db.users.getAll()` - Get all users

## Authentication Context

### Changes to AuthContext
- Now stores `userId` in AsyncStorage for persistence
- `login(userId)` - Takes user ID instead of email/password
- Session persists across app restarts
- Guest mode still supported

### Usage Example
```typescript
const { login, logout, user, isAuthenticated, isGuest } = useAuth();

// After successful registration/login
await login(user.id);

// Check authentication
if (isAuthenticated) {
  // User is logged in
}

// Logout
await logout();
```

## UI Flow

### Login Screen (`/login`)
1. **Default**: Shows login form
2. **Toggle to Sign Up**: User can switch between login and signup modes
3. **Sign Up Mode**: Shows additional fields (name, phone)
4. **Login Mode**: Only shows email and password
5. **Google Button**: Available in both modes
6. **Validation**: 
   - Jordan phone numbers only (9 digits)
   - Email format validation
   - Password minimum length (6 characters)

## Testing the System

### Test Sign Up
1. Open app and navigate to `/login`
2. Click "Sign Up" toggle
3. Fill in:
   - Full Name: "Test User"
   - Email: "test@example.com"
   - Phone: "791234567" (9 digits only)
   - Password: "password123"
4. Click "Sign Up"
5. User created and auto-logged in

### Test Login with Email
1. Navigate to `/login`
2. Enter:
   - Email: "test@example.com"
   - Password: "password123"
3. Click "Login"
4. Should navigate to home screen

### Test Login with Phone
1. Navigate to `/login`
2. Enter:
   - Email field: "791234567" OR "+962791234567"
   - Password: "password123"
3. Click "Login"
4. Should navigate to home screen

### Test Google Login
1. Click "Continue with Google"
2. Mock Google user created/fetched
3. Auto-logged in and navigated to home

## Security Notes

⚠️ **Important**: This is a development implementation with the following considerations:

1. **Passwords**: Currently stored in plain text. In production, use:
   - bcrypt/argon2 for password hashing
   - Salt each password before hashing

2. **Tokens**: Currently using simple string tokens. In production, use:
   - JWT (JSON Web Tokens)
   - Proper token expiration
   - Refresh token mechanism

3. **Google OAuth**: Currently mocked. In production:
   - Implement proper Google OAuth 2.0
   - Use `expo-auth-session` or similar library
   - Validate Google tokens server-side

4. **AsyncStorage**: Suitable for development. In production:
   - Use secure storage for tokens (expo-secure-store)
   - Consider using real database (Firebase, Supabase, etc.)

## Phone Number Format

### Jordan Phone Numbers
- **Format**: +962 followed by 9 digits
- **Examples**: 
  - +962791234567
  - +962781234567
  - +962771234567
- **Input**: Users enter only 9 digits (without +962)
- **Storage**: Stored with +962 prefix in database
- **Login**: Accepts both formats (with or without +962)

## Error Messages

### Registration Errors
- "Please fill all fields" - Missing required field
- "Email already registered" - Duplicate email
- "Phone number already registered" - Duplicate phone
- "Please enter a valid 9-digit Jordan phone number" - Invalid phone format
- "Password must be at least 6 characters" - Short password

### Login Errors
- "Please enter your email/phone and password" - Missing fields
- "User not found" - No user with that email/phone
- "Invalid password" - Wrong password

## Next Steps

To make this production-ready:

1. **Add Email Verification**
   - Send verification email on registration
   - Verify email before allowing full access

2. **Add Password Reset**
   - "Forgot Password" flow
   - Email-based password reset

3. **Add Real Google OAuth**
   - Integrate expo-auth-session
   - Configure Google OAuth credentials

4. **Add Phone OTP**
   - SMS verification for phone numbers
   - Use Twilio or similar service

5. **Implement Token Management**
   - JWT tokens with expiration
   - Refresh token mechanism
   - Secure token storage

6. **Add Security Features**
   - Rate limiting on login attempts
   - Account lockout after failed attempts
   - 2FA/MFA support
