# Gym Dashboard Documentation

## Overview
The Gym Dashboard is a management portal for gym owners to monitor their facility's activity, check-ins, and payments.

## Features

### 1. **Check-in Monitoring**
- View all check-ins at your gym
- Filter by:
  - All time
  - Today
  - This week
- Search by member name or email
- See member tier (Silver, Gold, Diamond, Elite)
- Real-time updates every 10 seconds

### 2. **Statistics Dashboard**
- **Today's Check-ins**: Number of members who checked in today
- **This Week**: Total check-ins for the current week
- **This Month**: Total check-ins for the current month
- **Pending Payments**: Number of outstanding payments

### 3. **QR Code Display**
- Generate and display gym's unique QR code
- Members can scan this code to check in
- Shows gym ID for manual entry

### 4. **Member Information**
For each check-in, you can see:
- Member name
- Member email
- Subscription tier
- Check-in date and time

## How to Access

### For Gym Owners:
1. Navigate to `/gym-login` route in your app
2. Select your gym from the list
3. You'll be taken to your gym's dashboard

### Direct Access:
- You can directly access a gym dashboard by navigating to:
  - `/gym-dashboard?gymId=1` (for Fitness First Abdali)
  - `/gym-dashboard?gymId=2` (for Gold's Gym Sweifieh)
  - Replace the gymId with your gym's ID

## Available Gyms
1. Fitness First Abdali (ID: 1)
2. Gold's Gym Sweifieh (ID: 2)
3. Elite Performance Center (ID: 3)
4. Body Masters Jabal Amman (ID: 4)
5. PowerHouse Gym Shmeisani (ID: 5)
6. Flex Gym Mecca Street (ID: 6)

## Future Enhancements
- Export check-in reports
- Payment tracking and management
- Gym analytics and trends
- Member communication tools
- Staff management

## Admin Dashboard
The admin dashboard for managing all gyms, adding new gyms, and full system control will be created separately and will provide:
- All gym management
- Add/edit/remove gyms
- View all check-ins across all gyms
- Payment management
- User management
- System settings
