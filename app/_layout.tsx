import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MobileWebApp from "@/components/MobileWebApp";

/**
 * Native (iOS/Android): minimal shell.
 *
 * If the JS bundle fails to mount, you will still see this debug overlay.
 * That tells us whether the issue is "RN not mounting" vs "WebView not loading".
 */
if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

export default function RootLayout() {
  useEffect(() => {
    // Aggressive splash-hide:
    // - hide after a short delay to avoid black-window flashes
    // - also keep a longer fallback in case WebView never finishes
    const t1 = setTimeout(() => SplashScreen.hideAsync().catch(() => undefined), 2500);
    const t2 = setTimeout(() => SplashScreen.hideAsync().catch(() => undefined), 7000);
    const t3 = setTimeout(() => SplashScreen.hideAsync().catch(() => undefined), 12000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.root}>
          <StatusBar style="dark" />
          <View pointerEvents="none" style={styles.debugOverlay}>
            <Text style={styles.debugText}>APP IS RUNNING</Text>
          </View>
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
  debugOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFDD55",
    paddingVertical: 8,
    paddingHorizontal: 12,
    zIndex: 9999,
  },
  debugText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111",
    textAlign: "center",
  },
});
