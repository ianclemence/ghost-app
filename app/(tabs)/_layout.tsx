import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import { Platform, Text, View } from "react-native";
import { MessageCircle, Bookmark, ListChecks, SlidersHorizontal } from "lucide-react-native";
import { Colors, Fonts, Ghost } from "@/constants/theme";

const C = Colors.dark;
const FONT = Fonts.sans;
const ACCENT = Ghost.accent;

function TabIcon({
  Icon,
  label,
  focused,
}: {
  Icon: React.ElementType;
  label: string;
  focused: boolean;
}) {
  const color = focused ? ACCENT : C.icon;
  return (
    <View style={{ alignItems: "center", gap: 4, paddingTop: 12 }}>
      <Icon size={22} color={color} strokeWidth={focused ? 2.25 : 1.9} />
      <Text
        style={{
          fontSize: 11,
          fontWeight: focused ? "600" : "500",
          color,
          fontFamily: FONT,
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
        sceneStyle: { backgroundColor: C.background },
        tabBarStyle: {
          backgroundColor: Ghost.bg.base,
          borderTopColor: Ghost.hairline,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 84 : 64,
          paddingBottom: Platform.OS === "ios" ? 24 : 8,
          paddingTop: 8,
          elevation: 0,
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
            <TabIcon Icon={MessageCircle} label="Ghost" focused={focused} />
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
        name="cron"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={ListChecks} label="Activity" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={SlidersHorizontal} label="Settings" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
