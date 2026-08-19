
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import { Platform, Text, View } from "react-native";
import { Terminal, Server, Clock, Brain, Settings } from "lucide-react-native";
import { Colors, Fonts } from "@/constants/theme";
import { useGhostStore } from "@/lib/store";

const C = Colors.dark;
const FONT_MONO = Fonts.mono;

function TabIcon({
  Icon,
  label,
  focused,
  accent,
}: {
  Icon: React.ElementType;
  label: string;
  focused: boolean;
  accent: string;
}) {
  const color = focused ? accent : C.icon;
  return (
    <View style={{ alignItems: "center", gap: 4, paddingTop: 12 }}>
      <Icon size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
      <Text
        style={{
          fontSize: 10,
          fontWeight: focused ? "700" : "500",
          color,
          letterSpacing: 1,
          fontFamily: FONT_MONO,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const accentColor = useGhostStore((s) => s.accentColor);
  const accent =
    accentColor === "amber"
      ? C.terminalAmber
      : accentColor === "cyan"
        ? C.terminalCyan
        : C.terminalGreen;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: C.background },
        tabBarStyle: {
          backgroundColor: C.background,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 68,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
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
            <TabIcon Icon={Terminal} label="Chat" focused={focused} accent={accent} />
          ),
        }}
      />
      <Tabs.Screen
        name="remote"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Server} label="Device" focused={focused} accent={accent} />
          ),
        }}
      />
      <Tabs.Screen
        name="cron"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Clock} label="Tasks" focused={focused} accent={accent} />
          ),
        }}
      />
      <Tabs.Screen
        name="memory"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Brain} label="Data" focused={focused} accent={accent} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Settings} label="Settings" focused={focused} accent={accent} />
          ),
        }}
      />
    </Tabs>
  );
}
