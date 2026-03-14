import { Tabs } from 'expo-router';
import { Platform, Text, View } from 'react-native';

const C = {
  bg: '#0D1117',
  border: '#1A2332',
  accent: '#00FF88',
  inactive: '#2A3A4A',
};

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 3, paddingTop: 4 }}>
      <Text style={{ fontSize: 19, opacity: focused ? 1 : 0.35 }}>{icon}</Text>
      <Text
        style={{
          fontSize: 8,
          fontWeight: focused ? '800' : '500',
          color: focused ? C.accent : C.inactive,
          letterSpacing: 1.2,
          fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
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
        sceneStyle: { backgroundColor: C.bg },
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopColor: C.border,
          borderTopWidth: 1,
          height: 68,
          paddingBottom: 8,
        },
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="👻" label="CHAT" focused={focused} /> }}
      />
      <Tabs.Screen
        name="remote"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🖥️" label="REMOTE" focused={focused} /> }}
      />
      <Tabs.Screen
        name="memory"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🧠" label="MEMORY" focused={focused} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⚙️" label="CFG" focused={focused} /> }}
      />
    </Tabs>
  );
}
