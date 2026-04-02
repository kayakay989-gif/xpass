import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MobileWebApp from "@/components/MobileWebApp";

/**
 * Native (iOS/Android): minimal shell.
 *
 * To avoid "black empty screen" we render the WebView directly here (no reliance on
 * expo-router `Slot` being resolved before the splash can hide).
 */
export default function RootLayout() {
  useEffect(() => {
    // Keep native splash until we hide explicitly.
    SplashScreen.preventAutoHideAsync().catch(() => undefined);

    // Hard timeout fallback: in release builds, if anything blocks React mounting,
    // the OS splash can otherwise stay visible as a black screen forever.
    const fallback = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => undefined);
    }, 10000);

    return () => clearTimeout(fallback);
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.root}>
          <StatusBar style="dark" />
          <MobileWebApp />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
