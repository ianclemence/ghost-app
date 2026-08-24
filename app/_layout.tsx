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
import { parsePairingURI } from '../lib/pairing';
import { initializeConnection, completePairing } from '../lib/connection';

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

      // Initialize connection from stored credentials.
      await initializeConnection();

      // Deep-link / QR pairing handling.
      const handleDeepLink = async (url: string) => {
        const payload = parsePairingURI(url);
        if (!payload) return;

        if (payload.type === 'secure') {
          // Secure pairing: redeem token and connect.
          const result = await completePairing(
            payload.host,
            payload.port,
            payload.token,
          );
          if (result.ok) {
            setConnected(true);
          }
        } else if (payload.type === 'legacy') {
          // Legacy pairing (direct config).
          const cfg = payload.config;
          await saveConfig(cfg);
          setConfig(cfg);
          const ok = await checkHealth(cfg);
          setConnected(ok);
          if (ok) connectWebSocket(cfg);
        }
      };

      const initial = await Linking.getInitialURL();
      if (initial) {
        await handleDeepLink(initial);
      }
      const sub = Linking.addEventListener('url', ({ url }) => {
        handleDeepLink(url);
      });

      // Listen for WS push and send local notification.
      const unsub = onWSMessage((msg) => {
        const msgType = typeof msg.type === 'string'
          ? msg.type
          : typeof msg.metadata?.type === 'string'
            ? msg.metadata.type
            : '';
        if (!notifications) return;
        if (msgType === 'assistant_message' && msg.content) {
          notifications.scheduleNotificationAsync({
            content: {
              title: 'Ghost',
              body: msg.content.slice(0, 100),
            },
            trigger: null,
          });
        } else if (msgType === 'clarify_request' && msg.content) {
          notifications.scheduleNotificationAsync({
            content: {
              title: 'Ghost has a question',
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
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="conversation"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="onboarding"
          options={{
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="ghost-pod"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="connection"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="advanced"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="permissions"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="about"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
