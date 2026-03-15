import { StyleSheet, Text, View, TouchableOpacity, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

// Local splash background asset (as provided in assets/images)
// The logo is already embedded in this image
const splashBackground = require('../assets/images/splash.jpeg');

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
            {/* Logo is already embedded in the splash image, no separate logo needed */}
            
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
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 40,
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
