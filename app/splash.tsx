import { StyleSheet, Text, View, TouchableOpacity, Image, ImageBackground } from 'react-native';
import { useRouter, Stack, Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { agentLog } from '@/lib/agent-debug-log';

const splashBackground = require('../assets/images/splash background.png');
const mainLogoWhite = require('../assets/images/main logo white.png');

export default function SplashScreen() {
  const router = useRouter();
  const { continueAsGuest, firebaseUser, isGuest, isAdmin, bootstrapNavigationReady } = useAuth();

  // Splash is only for fully logged-out users. Redirect synchronously so logged-in users never see this screen.
  if (bootstrapNavigationReady && firebaseUser && !isGuest) {
    return <Redirect href={(isAdmin ? '/admin-dashboard' : '/(tabs)/home') as never} />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ImageBackground source={splashBackground} style={styles.background} resizeMode="cover">
        <View style={styles.inner}>
          <View style={styles.center}>
            <Image source={mainLogoWhite} style={styles.logo} resizeMode="contain" />
          </View>

          <View style={styles.buttonsContainer}>
            <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')}>
              <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                Login/Register
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.discoverButton}
              onPress={() => {
                // #region agent log
                agentLog('H5', 'splash.tsx:discover', 'guest_replace_home', {});
                // #endregion
                continueAsGuest();
                router.replace('/(tabs)/home');
              }}
            >
              <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                Discover
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  inner: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '60%',
    maxWidth: 320,
    minHeight: 240,
    maxHeight: 280,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  loginButton: {
    borderWidth: 1.5,
    borderColor: '#DC143C',
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: 'transparent',
    width: '48%',
  },
  discoverButton: {
    borderWidth: 1.5,
    borderColor: '#DC143C',
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: 'transparent',
    width: '48%',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
});
