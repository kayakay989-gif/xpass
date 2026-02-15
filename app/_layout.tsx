import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import Colors from "@/constants/colors";
import { trpc, trpcClient } from "@/lib/trpc";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { validateConfig } from "@/lib/config";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack 
      screenOptions={{ 
        headerBackTitle: "Back",
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontWeight: '700' as const,
        },
      }}
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
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Validate configuration on app start
    validateConfig();
    
    // Hide splash screen
    SplashScreen.hideAsync();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
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
