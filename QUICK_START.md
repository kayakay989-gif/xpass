# Quick Start - Testing Your App

## Windows CMD Commands

### Option 1: Run in Web Browser (Easiest & Fastest)

```cmd
npm run start-web
```

Then:
- Press `w` in the terminal to open in web browser
- Or visit the URL shown in the terminal

### Option 2: Run with Expo Go (Mobile Testing)

```cmd
npm run start
```

Then:
- Press `w` for web browser
- Scan the QR code with the Expo app (development only) or use an EAS build for production testing

### Option 3: Standard Expo Commands

If the npm scripts don't work, use standard Expo commands:

**For Web:**
```cmd
npx expo start --web
```

**For All Platforms:**
```cmd
npx expo start
```

### Option 4: Clear Cache and Start

If you encounter issues, clear cache first:

```cmd
npx expo start --clear
```

Or for web:
```cmd
npx expo start --web --clear
```

## Troubleshooting

### If `npm run start-web` doesn't work:

Try:
```cmd
npx expo start --web
```

### If you get "bunx command not found":

Use npm instead:
```cmd
npm run start-web
```

Or use npx directly:
```cmd
npx expo start --web
```

### If port is already in use:

Kill the process or use a different port:
```cmd
npx expo start --web --port 3000
```

## Recommended for First Time Testing

Start with the web version:
```cmd
npm run start-web
```

This is the fastest way to see your app running!







