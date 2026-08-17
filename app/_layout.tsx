import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Constants, { AppOwnership } from 'expo-constants';
import * as Linking from 'expo-linking';
import { useGhostStore } from '../lib/store';
import {
  loadConfig,
  checkHealth,
  connectWebSocket,
  saveConfig,
  GhostConfig,
  onWSMessage,
} from '../lib/ghostApi';

const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

function parseConnectURL(url: string): GhostConfig | null {
  const { hostname, queryParams } = Linking.parse(url);
  const qp = (key: string): string | undefined => {
    const v = queryParams?.[key];
    return Array.isArray(v) ? v[0] : (v as string | undefined);
  };
  const host = qp("host") || (hostname && hostname !== "connect" ? hostname : undefined);
  const secret = qp("secret");
  if (!host || !secret) return null;
  const parsedPort = qp("port") ?? "8766";
  return {
    piHost: host,
    piPort: parsedPort,
    secret,
    session: "mobile:default",
    sendLocation: true,
  };
}

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

      const applyConnectParams = async (cfg: GhostConfig | null) => {
        if (!cfg) return;
        await saveConfig(cfg);
        setConfig(cfg);
        const ok = await checkHealth(cfg);
        setConnected(ok);
        if (ok) connectWebSocket(cfg);
      };

      // Load saved config on start
      const cfg = await loadConfig();
      if (cfg) {
        setConfig(cfg);
        const ok = await checkHealth(cfg);
        setConnected(ok);
      }

      // Deep-link pairing: ghost://connect?host=...&port=8766&secret=...
      const initial = await Linking.getInitialURL();
      if (initial) {
        await applyConnectParams(parseConnectURL(initial));
      }
      const sub = Linking.addEventListener('url', ({ url }) => {
        applyConnectParams(parseConnectURL(url));
      });

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

      return () => {
        unsub();
        sub.remove();
      };
    })();
  }, [setConfig, setConnected]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}
