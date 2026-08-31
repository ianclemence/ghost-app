import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import { Platform, Text, View } from "react-native";
import {
  House,
  MessageCircle,
  Clock,
  Bookmark,
  MoreHorizontal,
} from "lucide-react-native";

import { Ghost } from "@/constants/theme";

function TabIcon({
  Icon,
  label,
  focused,
}: {
  Icon: React.ElementType;
  label: string;
  focused: boolean;
}) {
  const color = focused ? Ghost.accent.primary : Ghost.text.tertiary;
  return (
    <View style={{ alignItems: "center", gap: 2, paddingTop: 10 }}>
      <Icon size={22} color={color} strokeWidth={focused ? 2 : 1.5} />
      <Text
        numberOfLines={1}
        style={{
          fontSize: 10,
          fontWeight: focused ? "600" : "400",
          color,
          letterSpacing: 0.1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Ghost.bg.base },
        tabBarStyle: {
          backgroundColor: Ghost.bg.base,
          borderTopColor: Ghost.border.subtle,
          borderTopWidth: Platform.OS === "ios" ? 0.5 : 1,
          height: Platform.OS === "ios" ? 84 : 64,
          paddingBottom: Platform.OS === "ios" ? 24 : 8,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarHideOnKeyboard: Platform.OS === "ios",
        tabBarShowLabel: false,
      }}
      screenListeners={{
        state: () => {
          Haptics.selectionAsync();
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={House} label="Home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={MessageCircle} label="Chats" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Clock} label="Activity" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="memory"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Bookmark} label="Memory" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={MoreHorizontal} label="More" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
