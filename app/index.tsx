import { Redirect } from "expo-router";
import { Platform } from "react-native";
import MobileWebApp from "@/components/MobileWebApp";

export default function Index() {
  if (Platform.OS !== "web") {
    return <MobileWebApp />;
  }
  return <Redirect href="/splash" />;
}
