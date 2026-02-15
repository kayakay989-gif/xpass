import { Tabs } from "expo-router";
import { Home, Dumbbell, QrCode, CreditCard } from "lucide-react-native";
import React from "react";
import Colors from "@/constants/colors";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.black,
        tabBarInactiveTintColor: Colors.textMuted,
        headerShown: true,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 86,
          paddingBottom: 16,
          paddingTop: 12,
          paddingHorizontal: 12,
        },
        tabBarItemStyle: {
          marginHorizontal: 2,
          borderRadius: 22,
          paddingHorizontal: 10,
          paddingVertical: 6,
        },
        tabBarActiveBackgroundColor: Colors.black,
        tabBarActiveTintColor: Colors.white,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
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
          tabBarIcon: ({ color }) => <Home size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="gyms"
        options={{
          title: "Gyms",
          tabBarIcon: ({ color }) => <Dumbbell size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="qr-scan"
        options={{
          title: "QR Scan",
          tabBarIcon: ({ color }) => <QrCode size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="subscription"
        options={{
          title: "Subscription",
          tabBarIcon: ({ color }) => <CreditCard size={24} color={color} />,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
