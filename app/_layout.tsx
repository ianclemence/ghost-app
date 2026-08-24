import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
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
import {
  initializeConnection,
  isPaired,
  handlePairingDeepLink,
} from '../lib/connection';

const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

export default function RootLayout() {
  const { setConfig, setConnected } = useGhostStore();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      // Set up notification handler
      let notifications: typeof import('expo-notifications') | null = null;
      if (!isExpoGo) {
        try {
          notifications = await import('expo-notifications');
          notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            }),
          });
        } catch {}
      }

      // Check if paired
      const paired = await isPaired();

      if (!paired) {
        // First launch — show connect flow
        router.replace('/onboarding');
      } else {
        // Paired — initialize connection in background, load Home immediately
        initializeConnection();
      }

      // Handle deep links (QR scan or external link)
      const handleDeepLink = async (url: string) => {
        const payload = parsePairingURI(url);
        if (!payload) return;

        if (payload.type === 'secure') {
          // Secure pairing via deep link
          router.replace({
            pathname: '/confirm',
            params: {
              token: payload.token,
              host: payload.host,
              port: payload.port,
              transport: payload.transport,
            },
          });
        } else if (payload.type === 'legacy') {
          // Legacy pairing (deprecated)
          const cfg = payload.config;
          await saveConfig(cfg);
          setConfig(cfg);
          const ok = await checkHealth(cfg);
          setConnected(ok);
          if (ok) connectWebSocket(cfg);
          router.replace('/(tabs)');
        }
      };

      const initial = await Linking.getInitialURL();
      if (initial) {
        await handleDeepLink(initial);
      }
      const sub = Linking.addEventListener('url', ({ url }) => {
        handleDeepLink(url);
      });

      // Listen for WS push and send local notification
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
        {/* Tabs — main app */}
        <Stack.Screen name="(tabs)" />

        {/* Conversation */}
        <Stack.Screen
          name="conversation"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />

        {/* First launch / connect flow */}
        <Stack.Screen
          name="onboarding"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="connect"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="scan"
          options={{ presentation: 'fullScreenModal', animation: 'fade' }}
        />
        <Stack.Screen
          name="confirm"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="pairing-success"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="manual"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />

        {/* Settings */}
        <Stack.Screen
          name="connection"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="ghost-pod"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="advanced"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="permissions"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="about"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
