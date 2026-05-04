import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import Colors from "@/constants/colors";
import { trpc, trpcClient } from "@/lib/trpc";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { validateConfig } from "@/lib/config";
import { ChevronLeft } from "lucide-react-native";

function RootStackHeaderBack({
  navigation,
  routeName,
}: {
  navigation: { canGoBack: () => boolean; goBack: () => void };
  routeName: string;
}) {
  const router = useRouter();
  const { firebaseUser, isGuest, isLoading: isLoadingAuth } = useAuth();

  if (routeName === "splash" || routeName === "gym-login" || routeName === "gym-dashboard") {
    return null;
  }

  return (
    <TouchableOpacity
      onPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        // Never treat a transient "no user" during auth init as logged-out (avoids splash/login flash).
        if (isLoadingAuth) {
          return;
        }
        const authed = !!(firebaseUser && !isGuest);
        if (authed) {
          router.replace("/(tabs)/home" as never);
        } else {
          router.replace("/splash" as never);
        }
      }}
      style={{ paddingHorizontal: 12, paddingVertical: 8 }}
    >
      <ChevronLeft size={22} color={Colors.text} />
    </TouchableOpacity>
  );
}

const queryClient = new QueryClient();

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={({ navigation, route }) => ({
        headerBackTitle: "Back",
        headerBackTitleVisible: false,
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontWeight: "700" as const,
        },
        headerLeft: () => (
          <RootStackHeaderBack navigation={navigation} routeName={route.name} />
        ),
      })}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="splash" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="payment" options={{ headerShown: false, title: 'Payment' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="my-subscription" options={{ headerShown: false }} />
      <Stack.Screen name="gym-details" options={{ title: 'Gym' }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen
        name="qr-scanner"
        options={{
          title: "Scan QR Code",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="gym-login"
        options={{
          headerShown: false,
          gestureEnabled: false,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="gym-dashboard"
        options={{
          headerShown: false,
          gestureEnabled: false,
          headerBackVisible: false,
          headerLeft: () => null,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    validateConfig();
  }, []);

  useEffect(() => {
    const hide = () => SplashScreen.hideAsync().catch(() => undefined);
    const t1 = setTimeout(hide, 300);
    const t2 = setTimeout(hide, 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
              <StatusBar style="dark" />
              <AuthProvider>
                <AppProvider>
                  <RootLayoutNav />
                </AppProvider>
              </AuthProvider>
            </GestureHandlerRootView>
          </trpc.Provider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
