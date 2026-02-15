# Google Maps Integration Guide

This app has been integrated with Google Maps API for displaying gym locations on maps.

## What's Been Integrated

### 1. Google Maps API Configuration
- **API Key**: Configured in `app.json` and `lib/google-maps-config.ts`
- **Android Configuration**: Google Maps API key added to Android config
- **iOS Configuration**: Google Maps API key added to iOS config
- **Web Configuration**: Google Maps JavaScript API integration

### 2. MapView Components
- **Native (iOS/Android)**: Uses `react-native-maps` with `PROVIDER_GOOGLE`
- **Web**: Uses Google Maps JavaScript API directly
- **Features**: 
  - Interactive maps with markers
  - User location display
  - Gym location markers
  - Info windows on marker click

## Configuration

### API Key Location

The Google Maps API key is configured in:
- `app.json` - For native builds (Android & iOS)
- `lib/google-maps-config.ts` - Centralized configuration

```typescript
export const GOOGLE_MAPS_API_KEY = "AIzaSyAkJ16NXPlpTqFRUrLtlc80jJiTL-j3Tpg";
```

### App Configuration

**Android** (`app.json`):
```json
{
  "android": {
    "config": {
      "googleMaps": {
        "apiKey": "AIzaSyAkJ16NXPlpTqFRUrLtlc80jJiTL-j3Tpg"
      }
    }
  }
}
```

**iOS** (`app.json`):
```json
{
  "ios": {
    "config": {
      "googleMapsApiKey": "AIzaSyAkJ16NXPlpTqFRUrLtlc80jJiTL-j3Tpg"
    }
  }
}
```

## Usage

### MapView Component

The MapView component automatically detects the platform and uses the appropriate implementation:

```typescript
import MapViewComponent from '@/components/MapView';

<MapViewComponent 
  gyms={gyms}
  initialRegion={{
    latitude: 31.9539,
    longitude: 35.9106,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  }}
  onMarkerPress={() => {
    // Handle marker press
  }}
/>
```

### Features

1. **User Location**: Shows the user's current location on the map (native only)
2. **Gym Markers**: Displays markers for each gym with name and address
3. **Info Windows**: Clicking a marker shows an info window with gym details
4. **Interactive Maps**: Users can zoom, pan, and interact with the map

## Platform-Specific Behavior

### Native (iOS/Android)
- Uses `react-native-maps` with Google Maps provider
- Full native map features including:
  - User location tracking
  - Native map controls
  - Gesture support
  - Offline maps (if enabled)

### Web
- Uses Google Maps JavaScript API
- Loaded dynamically when component mounts
- Features:
  - Interactive map with zoom/pan
  - Marker clustering (can be added)
  - Info windows
  - Street view (can be enabled)

## Location Permissions

The app requests location permissions:

**Android** (`app.json`):
```json
{
  "android": {
    "permissions": [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION"
    ]
  }
}
```

**iOS** (`app.json`):
```json
{
  "ios": {
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "Allow $(PRODUCT_NAME) to access your location to show nearby gyms",
      "NSLocationAlwaysUsageDescription": "Allow $(PRODUCT_NAME) to access your location for map features"
    }
  }
}
```

## Google Cloud Console Setup

To ensure the API key works properly, make sure:

1. **Enable APIs**: In Google Cloud Console, enable:
   - Maps SDK for Android
   - Maps SDK for iOS
   - Maps JavaScript API

2. **API Restrictions**: Set up API key restrictions:
   - **Android**: Restrict by package name and SHA-1 certificate fingerprint
   - **iOS**: Restrict by bundle identifier
   - **Web**: Restrict by HTTP referrer

3. **Billing**: Ensure billing is enabled for your Google Cloud project

## Testing

### Android
1. Build the app: `npx expo run:android`
2. Test map display and marker interactions
3. Test user location (if permissions granted)

### iOS
1. Build the app: `npx expo run:ios`
2. Test map display and marker interactions
3. Test user location (if permissions granted)

### Web
1. Run: `npm run start-web`
2. Open browser and navigate to the app
3. Maps should load automatically with gym markers

## Troubleshooting

### "Google Maps API key not found"
- Verify the API key is correct in `app.json` and `lib/google-maps-config.ts`
- For native builds, rebuild the app after changing `app.json`

### "Maps not displaying on Android"
- Check that Maps SDK for Android is enabled in Google Cloud Console
- Verify API key restrictions allow your package name and SHA-1

### "Maps not displaying on iOS"
- Check that Maps SDK for iOS is enabled in Google Cloud Console
- Verify API key restrictions allow your bundle identifier

### "Maps not loading on web"
- Check browser console for errors
- Verify Maps JavaScript API is enabled in Google Cloud Console
- Check that HTTP referrer restrictions allow your domain

### "Location not showing"
- Request location permissions in app settings
- Check that location permissions are granted
- Verify `expo-location` package is installed

## Next Steps

### Optional Enhancements

1. **Marker Clustering**: Group nearby gym markers for better UX
2. **Custom Markers**: Use custom marker icons for different gym categories
3. **Directions**: Add navigation/directions functionality
4. **Places API**: Integrate Google Places API for gym search
5. **Geocoding**: Convert addresses to coordinates for gyms without coordinates
6. **Offline Maps**: Enable offline map caching for better performance

## Cost Considerations

Google Maps API has usage-based pricing:
- Maps SDK for Android: Free tier up to certain limits
- Maps SDK for iOS: Free tier up to certain limits  
- Maps JavaScript API: Free tier up to certain limits

Monitor usage in Google Cloud Console to stay within free tier or budget.

## Security Best Practices

1. **Restrict API Keys**: Always set restrictions on API keys
2. **Don't Commit Keys**: Use environment variables in production
3. **Monitor Usage**: Set up billing alerts in Google Cloud Console
4. **Rotate Keys**: Regularly rotate API keys if compromised

