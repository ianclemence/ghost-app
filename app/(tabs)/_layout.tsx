
import { Tabs } from "expo-router";
import { Platform, Text, View } from "react-native";
import { Terminal, Server, Clock, Brain, Settings } from "lucide-react-native";
import { Colors, Fonts } from "@/constants/theme";

const C = Colors.dark;
const FONT_MONO = Fonts.mono;

function TabIcon({
  Icon,
  label,
  focused,
}: {
  Icon: React.ElementType;
  label: string;
  focused: boolean;
}) {
  const color = focused ? C.terminalGreen : C.icon;
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
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Terminal} label="Chat" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="remote"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Server} label="Remote" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="cron"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Clock} label="Tasks" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="memory"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Brain} label="Memory" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={Settings} label="Settings" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
