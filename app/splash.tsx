import { StyleSheet, Text, View, TouchableOpacity, Image, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

// Use a true full-screen splash image to match the web look.
const splashBackground = require('../assets/images/splash background.png');
const mainLogo = require('../assets/images/main logo.png');

export default function SplashScreen() {
  const router = useRouter();
  const { continueAsGuest } = useAuth();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <ImageBackground
          source={splashBackground}
          resizeMode="cover"
          style={styles.backgroundImage}
        >
          <View style={styles.content}>
            <View style={styles.logoWrap}>
              <Image source={mainLogo} style={styles.logo} resizeMode="contain" />
            </View>

            <View style={styles.buttonsContainer}>
              <TouchableOpacity 
                style={styles.loginButton}
                onPress={() => router.push('/login')}
              >
                <Text style={styles.buttonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  Login/Register
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.discoverButton}
                onPress={() => {
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 100,
    paddingBottom: 48,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  logo: {
    width: '92%',
    maxWidth: 340,
    height: 84,
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
