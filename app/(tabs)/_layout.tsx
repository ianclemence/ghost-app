import { Stack } from "expo-router";
import { Ghost } from "@/constants/theme";

export default function TabLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Ghost.bg.base },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="chats" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="memory" />
      <Stack.Screen name="more" />
    </Stack>
  );
}
