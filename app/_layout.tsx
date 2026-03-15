import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Constants, { AppOwnership } from 'expo-constants';
import { useGhostStore } from '../lib/store';
import { loadConfig, checkHealth, connectWebSocket, onWSMessage } from '../lib/ghostApi';

const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

export default function RootLayout() {
  const { setConfig, setConnected } = useGhostStore();

  useEffect(() => {
    (async () => {
      let notifications: typeof import('expo-notifications') | null = null;
      if (!isExpoGo) {
        notifications = await import('expo-notifications');
        notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
      }

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
        const msgType = typeof msg.type === 'string'
          ? msg.type
          : typeof msg.metadata?.type === 'string'
            ? msg.metadata.type
            : '';
        if (msgType === 'assistant_message' && notifications && msg.content) {
          notifications.scheduleNotificationAsync({
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
