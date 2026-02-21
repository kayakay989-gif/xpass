import { Tabs } from "expo-router";
import { Home, Dumbbell, QrCode, CreditCard } from "lucide-react-native";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarShowLabel: false,
        headerShown: true,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 72 + insets.bottom,
          paddingBottom: Math.max(10, insets.bottom),
          paddingTop: 10,
          paddingHorizontal: 14,
        },
        tabBarItemStyle: {
          flex: 1,
          marginHorizontal: 6,
        },
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontWeight: '700' as const,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Home" focused={focused} icon={<Home size={22} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="gyms"
        options={{
          title: "Gyms",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Gyms" focused={focused} icon={<Dumbbell size={22} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="qr-scan"
        options={{
          title: "QR Scan",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="QR Scan" focused={focused} icon={<QrCode size={22} />} />
          ),
        }}
      />
      <Tabs.Screen
        name="subscription"
        options={{
          title: "Subscription",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="Subscription"
              focused={focused}
              icon={<CreditCard size={22} />}
            />
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
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
  },
  itemActive: {
    backgroundColor: Colors.black,
  },
  label: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: Colors.textMuted,
  },
  labelActive: {
    color: Colors.white,
  },
});
