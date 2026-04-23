import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { Home } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { agentLog } from '@/lib/agent-debug-log';
import { useAuth } from '@/contexts/AuthContext';

export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isGuest, isLoading } = useAuth();

  useEffect(() => {
    // #region agent log
    agentLog('H1', '+not-found.tsx:mount', 'not_found_screen_visible', {});
    fetch('http://127.0.0.1:7259/ingest/afbf0a1a-8b00-4ff6-b84b-01802a5b1f64', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'dba73f' },
      body: JSON.stringify({
        sessionId: 'dba73f',
        runId: 'pre-fix',
        hypothesisId: 'H2',
        location: 'app/+not-found.tsx:mount',
        message: 'Not found screen mounted',
        data: { pathname },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [pathname]);

  useEffect(() => {
    if (isLoading) return;
    // During auth/browser callback handoff we can briefly land here.
    // Redirect silently for signed-in or guest users instead of flashing a 404 screen.
    if (isAuthenticated || isGuest) {
      router.replace('/(tabs)/home');
    }
  }, [isAuthenticated, isGuest, isLoading, router]);

  if ((isAuthenticated || isGuest) && !isLoading) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>404</Text>
      <Text style={styles.subtitle}>Page Not Found</Text>
      <Text style={styles.description}>
        The page you&apos;re looking for doesn&apos;t exist.
      </Text>
      
      <TouchableOpacity 
        style={styles.button}
        onPress={() => router.replace('/(tabs)/home')}
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
