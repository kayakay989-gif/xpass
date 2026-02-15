import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, RotateCw } from 'lucide-react-native';
import Colors from '@/constants/colors';

export default function QRErrorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleTryAgain = () => {
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR to Check-in</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Image
                source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/w6rj0oqwm5ffm7oc19l1f' }}
                style={styles.icon}
              />
            </View>
            <Text style={styles.message}>Check in unsuccessful</Text>
          </View>

          <TouchableOpacity style={styles.tryAgainButton} onPress={handleTryAgain}>
            <RotateCw size={20} color={Colors.white} />
            <Text style={styles.tryAgainText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 24,
  },
  iconContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    width: 200,
    height: 200,
  },
  message: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: '#6B7280',
    textAlign: 'center',
  },
  tryAgainButton: {
    width: '100%',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tryAgainText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.white,
  },
});
