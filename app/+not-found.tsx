import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Home } from 'lucide-react-native';
import Colors from '@/constants/colors';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>404</Text>
      <Text style={styles.subtitle}>Page Not Found</Text>
      <Text style={styles.description}>
        The page you&apos;re looking for doesn&apos;t exist.
      </Text>
      
      <TouchableOpacity 
        style={styles.button}
        onPress={() => router.replace('/')}
      >
        <Home size={20} color={Colors.text} />
        <Text style={styles.buttonText}>Go Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  title: {
    fontSize: 72,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
});
