import { StyleSheet, Text, View, TouchableOpacity, Image, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

// Local splash background asset (as provided in assets/images)
const splashBackground = require('../assets/images/splash background.png');

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
        />

        {/* Subtle overlay to match the dark gradient at the bottom */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.75)']}
          locations={[0.2, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Image 
              source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/t5u7px23rxplxx8gfxveq' }} 
              style={styles.logo}
              resizeMode="contain"
            />
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 16,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '700' as const,
    color: '#DC143C',
    letterSpacing: 2,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: '#DC143C',
    letterSpacing: 1.5,
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
