# Mobile Build Fix Status

## Current Issue

Android build is failing due to `expo-firebase-core` Gradle configuration issues:
1. Missing `compileSdk` specification
2. `androidSourcesJar` task using deprecated `classifier` property (not compatible with Gradle 8.x)

## Attempted Solutions

### ✅ Solution 1: Expo Config Plugin (Created)
- **File**: `plugins/withExpoFirebaseCoreFix.js`
- **Status**: Created and added to `app.json`
- **Approach**: 
  - Adds `subprojects` block to root `build.gradle` to set `compileSdk` for all subprojects
  - Fixes `androidSourcesJar` classifier issue
  - Attempts to directly patch `expo-firebase-core/build.gradle` if it exists

### ⚠️ Current Status
- Plugin is created and configured
- Build still failing (may need different approach)

## Recommended Next Steps

### Option 1: Use patch-package (Recommended)

1. **Install patch-package**:
   ```bash
   npm install --save-dev patch-package
   ```

2. **Manually patch expo-firebase-core**:
   - Run `npx expo prebuild` to generate `android/` folder
   - Navigate to `node_modules/expo-firebase-core/android/build.gradle`
   - Add `compileSdk 36` to the `android {}` block
   - Remove `classifier` property from `androidSourcesJar` task
   - Run `npx patch-package expo-firebase-core`
   - This creates a patch file in `patches/`

3. **Add postinstall script to package.json**:
   ```json
   "scripts": {
     "postinstall": "patch-package"
   }
   ```

### Option 2: Update expo-firebase-recaptcha

Check if a newer version fixes the issue:
```bash
npm install expo-firebase-recaptcha@latest
```

### Option 3: Alternative Phone Verification

If the above don't work, consider using Firebase JS SDK's phone auth directly without `expo-firebase-recaptcha`:
- Use web-based reCAPTCHA for both web and mobile
- This would require modifying `app/security.tsx` and `app/profile-edit.tsx`

## Files Modified

1. ✅ `plugins/withExpoFirebaseCoreFix.js` - Created config plugin
2. ✅ `app.json` - Added plugin to plugins array

## Phone Verification Status

✅ **Phone verification flow remains fully functional** - No changes to verification logic, only build configuration fixes.

The verification code in:
- `app/security.tsx`
- `app/profile-edit.tsx`

Remains unchanged and will work once the build issues are resolved.

## Testing

After applying fixes, test:
1. Android build completes successfully
2. Phone verification works on Android device
3. OTP sending and verification flow works
4. Verified status persists correctly
