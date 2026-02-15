# Admin Panel Guide

## Overview
The Admin Panel provides complete system oversight and control for managing the entire gym subscription platform.

## How to Access

### Admin Login
1. Navigate to `/admin-login` route in your app
2. Use the following credentials:
   - **Username**: `admin`
   - **Password**: `admin123`

### Direct Access
- You can bookmark the admin login for quick access: `/admin-login`
- After login, you'll be taken to the admin dashboard

## Features

### 1. Overview Tab
**System-wide statistics and monitoring**
- **Total Users**: Number of registered users in the system
- **Total Gyms**: Number of gyms in the network
- **All Check-ins**: Total number of check-ins ever recorded
- **Today's Check-ins**: Check-ins that happened today
- **Active Subscriptions**: Currently active user subscriptions
- **Total Revenue**: Sum of all subscription payments

**Recent Activity**
- Shows the last 5 check-ins across all gyms
- Displays user name, gym name, tier, and timestamp

### 2. Users Tab
**Complete user management**

For each user, you can see:
- Full name and email
- Current subscription tier and duration
- Wallet balance
- Referral code
- Subscription status (if active)

**Features:**
- Search users by name or email
- View subscription details at a glance
- Monitor wallet balances
- Track referral codes

### 3. Gyms Tab
**Gym network management**

For each gym, you can see:
- Gym name and address
- Today's check-in count
- Total check-ins all-time
- Gym category

**Features:**
- Search gyms by name or address
- Monitor gym activity
- View check-in statistics

**Future Enhancements:**
- Add new gyms (UI coming soon)
- Edit gym details
- Delete gyms
- Upload gym photos
- Set gym operating hours

### 4. Check-ins Tab
**Monitor all system check-ins**

For each check-in, you can see:
- User name and subscription tier
- Gym name
- Date and time of check-in

**Features:**
- Search check-ins by user name or gym name
- View real-time check-in activity
- Track user behavior patterns

## Data Refresh
- Pull down to refresh data in any section
- Data automatically refreshes when navigating between tabs
- Check-ins are updated in real-time (when viewing the tab)

## Three Access Levels

### 1. User Access (Regular Members)
- Main app interface with tabs: Home, Gyms, QR Scan, Subscription
- Subscribe to gym memberships
- Scan QR codes to check in at gyms
- View personal subscription and check-in history
- **Entry Point**: Main app (default)

### 2. Gym Owner Access
- Gym-specific dashboard
- View check-ins at your gym(s)
- Filter by today/week/all time
- Search by member name or email
- Display QR code for member check-ins
- View statistics (today, this week, this month)
- Monitor pending payments
- **Entry Point**: `/gym-login` → Select your gym

### 3. Admin Access (Full System Control)
- System-wide dashboard with 4 tabs
- Manage all users across the platform
- Manage all gyms in the network
- View all check-ins from all gyms
- System statistics and analytics
- Complete oversight of the platform
- **Entry Point**: `/admin-login` → Username: admin, Password: admin123

## Testing Different Roles

### To Test as a Regular User:
1. Open the main app (default view)
2. Navigate through the tabs: Home, Gyms, QR Scan, Subscription
3. Subscribe to a plan if not already subscribed
4. Go to QR Scan tab and scan a gym's QR code
5. View your check-in history on the Home tab

### To Test as a Gym Owner:
1. Navigate to `/gym-login`
2. Select a gym from the list (e.g., "Fitness First Abdali")
3. You'll see the gym dashboard with:
   - Check-in statistics
   - Member check-ins with filtering
   - QR code display
   - Payment information

### To Test as an Admin:
1. Navigate to `/admin-login`
2. Enter credentials: `admin` / `admin123`
3. Access the full system dashboard with 4 tabs:
   - **Overview**: System stats and recent activity
   - **Users**: All registered users
   - **Gyms**: All gyms in the network
   - **Check-ins**: All check-ins across all gyms

## Navigation Tips

- **User App**: Always accessible, this is the default view
- **Gym Dashboard**: Go to `/gym-login` → Select gym
- **Admin Dashboard**: Go to `/admin-login` → Enter credentials
- Use the back button to return to previous screens
- Admin and Gym dashboards can be accessed simultaneously by opening in different browser tabs (web) or by navigating back and forth (mobile)

## Security Note
The demo credentials are hardcoded for testing purposes. In production, these should be replaced with:
- Proper authentication system
- Secure password storage
- Role-based access control (RBAC)
- JWT or session-based authentication
- Multi-factor authentication for admin access

## Future Enhancements

### Admin Panel Coming Soon:
- **User Management**
  - Edit user details
  - Manage subscriptions
  - Adjust wallet balances
  - View user activity timeline
  
- **Gym Management**
  - Add new gyms via form
  - Edit gym information
  - Delete/deactivate gyms
  - Upload gym images
  - Set tier restrictions
  
- **Advanced Analytics**
  - Revenue charts and trends
  - User growth metrics
  - Popular gyms ranking
  - Peak usage times
  - Subscription conversion rates
  
- **Payment Management**
  - View all transactions
  - Process refunds
  - Handle disputes
  - Export financial reports
  
- **System Settings**
  - Configure subscription tiers
  - Set pricing rules
  - Manage referral program
  - System-wide notifications
  - Email templates

## Support
For any issues or questions about the admin panel, please contact the development team.
