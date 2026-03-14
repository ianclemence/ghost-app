import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { useGhostStore } from '../lib/store';
import { loadConfig, checkHealth, connectWebSocket, onWSMessage } from '../lib/ghostApi';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const { setConfig, setConnected } = useGhostStore();

  useEffect(() => {
    (async () => {
      // Load saved config on start
      const cfg = await loadConfig();
      if (cfg) {
        setConfig(cfg);
        const ok = await checkHealth(cfg);
        setConnected(ok);
        if (ok) connectWebSocket(cfg);
      }

      // Listen for WS push and send local notification
      const unsub = onWSMessage((msg) => {
        if (msg.type === 'assistant_message') {
          Notifications.scheduleNotificationAsync({
            content: {
              title: '👻 Ghost',
              body: msg.content.slice(0, 100),
            },
            trigger: null,
          });
        }
      });

      return unsub;
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="#080C0F" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}