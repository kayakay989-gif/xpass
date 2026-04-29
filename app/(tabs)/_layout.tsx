import { Tabs, useRouter } from "expo-router";
import { Home, Dumbbell, QrCode, CreditCard, ChevronLeft } from "lucide-react-native";
import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isGuest, firebaseUser } = useAuth();

  return (
    <Tabs
      screenOptions={({ route, navigation }) => ({
        // Only mount the focused tab's screen. Prevents Fabric crashes when MapView (home)
        // would otherwise stay mounted under another tab (e.g. subscription).
        lazy: true,
        tabBarShowLabel: false,
        headerShown: true,
        tabBarHideOnKeyboard: true,
        tabBarScrollEnabled: true,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          minHeight: 72 + insets.bottom,
          paddingBottom: Math.max(10, insets.bottom),
          paddingTop: 8,
          paddingHorizontal: 6,
        },
        tabBarItemStyle: {
          minWidth: 72,
          maxWidth: 128,
          paddingHorizontal: 4,
          marginHorizontal: 2,
          justifyContent: "center",
        },
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontWeight: '700' as const,
        },
        headerLeft: () => {
          // Home: show back only for guest flow (lands on splash).
          if (route.name === 'home') {
            if (!isGuest && firebaseUser) return null;
            return (
              <TouchableOpacity
                onPress={() => router.replace('/splash')}
                style={{ paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <ChevronLeft size={22} color={Colors.text} />
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                  return;
                }
                // If there's no back history (tab root), choose a safe fallback.
                if (isGuest || !firebaseUser) {
                  router.replace('/splash');
                } else {
                  router.replace('/(tabs)/home');
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
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Home" focused={focused} icon={<Home size={20} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="gyms"
        options={{
          title: "Gyms",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Gyms" focused={focused} icon={<Dumbbell size={20} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="qr-scan"
        options={{
          title: "QR Scan",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Scan" focused={focused} icon={<QrCode size={20} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="subscription"
        listeners={
          isGuest
            ? {
                tabPress: (e) => {
                  e.preventDefault();
                  router.push("/login");
                },
              }
            : undefined
        }
        options={{
          title: "Subscription",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Plans" focused={focused} icon={<CreditCard size={20} />} />
          ),
          headerShown: false,
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  label,
  focused,
  icon,
}: {
  label: string;
  focused: boolean;
  icon: React.ReactElement<{ color?: string }>;
}) {
  const color = focused ? Colors.white : Colors.textMuted;
  const renderedIcon = React.cloneElement(icon, { color });

  return (
    <View style={[styles.item, focused && styles.itemActive]}>
      {renderedIcon}
      <Text
        style={[styles.label, focused && styles.labelActive]}
        numberOfLines={1}
        ellipsizeMode="tail"
        allowFontScaling
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    minWidth: 64,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  itemActive: {
    backgroundColor: Colors.black,
    paddingHorizontal: 14,
  },
  label: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: Colors.textMuted,
    textAlign: "center",
    maxWidth: 104,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  },
  labelActive: {
    color: Colors.white,
  },
});
