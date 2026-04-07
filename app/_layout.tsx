import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppProvider } from "@/contexts/AppContext";
import Colors from "@/constants/colors";
import { trpc, trpcClient } from "@/lib/trpc";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { validateConfig } from "@/lib/config";
import { ChevronLeft } from "lucide-react-native";

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
        headerLeft: () => {
          if (route.name === "splash" || route.name === "gym-login" || route.name === "gym-dashboard") {
            return null;
          }
          return (
            <TouchableOpacity
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.navigate("splash" as never);
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
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
