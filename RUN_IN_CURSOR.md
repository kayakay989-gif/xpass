# How to Run This App in Cursor

This guide will help you run your Expo/React Native app directly in Cursor.

## Prerequisites

Before running the app, make sure you have:

1. **Node.js** installed (v18 or higher)
   - Download from [nodejs.org](https://nodejs.org/)
   - Or use [nvm](https://github.com/nvm-sh/nvm) to manage versions

2. **Bun** installed (recommended for this project)
   - Install from [bun.sh](https://bun.sh/docs/installation)
   - Or use: `npm install -g bun`

3. **Dependencies** installed
   ```bash
   bun install
   # or if you prefer npm
   npm install
   ```

## Option 1: Run in Web Browser (Easiest)

This is the fastest way to see your app running:

```bash
# Open terminal in Cursor (View > Terminal or Ctrl+`)
bun run start-web

# Or if you don't have bun:
npm run start-web
```

This will:
- Start the development server
- Open your app in a web browser
- Auto-reload when you make changes

The app will open at a URL shown in the terminal.

## Option 2: Run for Mobile Development

### For iOS Simulator (Mac only):

```bash
bun run start

# Then in the terminal menu, press:
# - 'i' to open iOS Simulator
# - 'a' to open Android device/emulator (development only)
# - 'w' to open in web browser
```

### For Android Emulator:

```bash
bun run start

# Then press 'a' in the terminal
```

### For Physical Device:

1. Install **Expo Go** app on your phone:
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. Run:
   ```bash
   bun run start
   ```

3. Scan the QR code that appears in the terminal with:
   - iOS: Camera app
   - Android: Expo Go app

## Option 3: Using Standard Expo Commands

If the Rork commands don't work, you can use standard Expo commands:

```bash
# Install Expo CLI globally (if needed)
npm install -g expo-cli

# Start the development server
npx expo start

# Or for web
npx expo start --web

# Or with tunnel (for physical devices)
npx expo start --tunnel
```

## Troubleshooting

### Issue: "bunx: command not found"

**Solution:** Use npm instead:
```bash
npm run start-web
```

### Issue: Port already in use

**Solution:** Clear the port or use a different one:
```bash
# Kill process on port 8080 (Windows PowerShell)
netstat -ano | findstr :8080
taskkill /PID <PID> /F

# Or use a different port
PORT=3000 bun run start-web
```

### Issue: Dependencies not installed

**Solution:** Reinstall dependencies:
```bash
# Remove node_modules and lock files
rm -rf node_modules
rm -rf bun.lockb  # or package-lock.json if using npm

# Reinstall
bun install
# or
npm install
```

### Issue: Firebase connection errors

**Solution:** Make sure your Firebase configuration is correct:
- Check `lib/firebase.ts` has the correct API keys
- Ensure Firebase project is set up in Firebase Console

### Issue: Google Maps not showing

**Solution:** 
- Verify Google Maps API key is configured in `app.json`
- Check that Maps JavaScript API is enabled in Google Cloud Console
- For native builds, you may need to rebuild: `npx expo prebuild`

## Quick Commands Reference

| Command | Description |
|---------|-------------|
| `bun run start-web` | Run in web browser |
| `bun run start` | Start dev server (then press i/a/w) |
| `bun install` | Install dependencies |
| `npm run lint` | Check for code errors |
| `npx expo start --clear` | Clear cache and start |

## Development Tips

1. **Hot Reloading**: Changes to your code will automatically reload in the browser/app
2. **Debugging**: Use browser DevTools for web, or React Native Debugger for mobile
3. **TypeScript Errors**: Fix TypeScript errors before running - they'll show in Cursor's Problems panel
4. **Terminal Shortcuts**: 
   - `Ctrl+` ` to open/close terminal in Cursor
   - `Cmd/Ctrl + Shift + P` for command palette

## Next Steps

Once the app is running:
- Make changes to files in `app/` directory
- Changes will hot-reload automatically
- Test features like Firebase auth and Google Maps
- Use Cursor's AI features to help with development

## Need Help?

- Check the main `README.md` for more details
- Visit [Expo Documentation](https://docs.expo.dev/)
- Check Firebase and Google Maps setup in their respective integration guides

