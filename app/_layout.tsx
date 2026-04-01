import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import Colors from "@/constants/colors";
import { trpc, trpcClient } from "@/lib/trpc";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { validateConfig } from "@/lib/config";
import { ChevronLeft } from "lucide-react-native";

// Keep the native splash until we hide explicitly; hiding in the first tick leaves a black
// window on Android release before the first React frame is painted.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient();

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
          fontWeight: '700' as const,
        },
        headerLeft: () => {
          // Back button on all stack screens, except splash, gym-login, and gym-dashboard.
          if (route.name === 'splash' || route.name === 'gym-login' || route.name === 'gym-dashboard') {
            return null;
          }
          return (
            <TouchableOpacity
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  // If there's no history (common on web/mobile), go to splash as the safe fallback.
                  navigation.navigate('splash' as never);
                }
              }}
              style={{ paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <ChevronLeft size={22} color={Colors.text} />
            </TouchableOpacity>
          );
        },
      })}
    >
      <Stack.Screen name="splash" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen 
        name="qr-scanner" 
        options={{ 
          title: "Scan QR Code",
          presentation: "modal",
        }} 
      />
      <Stack.Screen 
        name="subscription" 
        options={{ 
          title: "Choose Plan",
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

    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          registrations.forEach((registration) => {
            registration.unregister().catch((err) => {
              console.warn('[RootLayout] Failed to unregister service worker:', err);
            });
          });
        })
        .catch((err) => {
          console.warn('[RootLayout] Error querying service workers:', err);
        });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let delayedHide: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      if (!cancelled) {
        SplashScreen.hideAsync().catch(() => undefined);
      }
    };

    // Do not hide in the same tick as mount: Android release often shows a black window
    // if the native splash is removed before the first React frame is painted.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        delayedHide = setTimeout(hide, 48);
      });
    });

    const fallback = setTimeout(hide, 5000);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (delayedHide) clearTimeout(delayedHide);
      clearTimeout(fallback);
    };
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
            <AuthProvider>
              <AppProvider>
                <RootLayoutNav />
              </AppProvider>
            </AuthProvider>
          </GestureHandlerRootView>
        </trpc.Provider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
