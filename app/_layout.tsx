import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Constants, { AppOwnership } from 'expo-constants';
import * as Linking from 'expo-linking';
import { onWSMessage } from '../lib/ghostApi';
import { notificationCopyFor, notificationKeyFor } from '../lib/notify';
import { parsePairingURI } from '../lib/pairing';
import {
  initializeConnection,
  isPaired,
  handlePairingDeepLink,
} from '../lib/connection';
import { useGhostStore } from '../lib/store';

const isExpoGo = Constants.appOwnership === AppOwnership.Expo;

// Stable dedup for runtime events already notified this session. The
// conversation (reloaded from backend history) is the source of truth;
// this set only suppresses repeat tray noise for the same canonical event.
const notifiedEventIds = new Set<string>();

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
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
              relayServer: payload.relayServer ?? '',
              ghostId: payload.ghostId ?? '',
            },
          });
        } else if (payload.type === 'legacy') {
          // Legacy relay deep link — adopted through the credentials system.
          await handlePairingDeepLink(url);
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

      // Runtime event → tray notification → canonical conversation.
      // The tray carries fixed product copy only (never message content).
      // Tapping returns to the normal Ghost conversation, which reloads
      // authoritative history from the backend. No second message store.
      const unsub = onWSMessage((msg) => {
        let isCurrentSession = false;
        try {
          const current = useGhostStore.getState().currentSession;
          if (msg.session_id && current && msg.session_id === current) isCurrentSession = true;
        } catch {}
        if (isCurrentSession) return;
        const copy = notificationCopyFor(msg);
        if (!copy || !notifications) return;
        const key = notificationKeyFor(msg);
        if (!key || notifiedEventIds.has(key)) return;
        notifiedEventIds.add(key);
        if (notifiedEventIds.size > 200) {
          const oldest = notifiedEventIds.values().next().value;
          if (oldest) notifiedEventIds.delete(oldest);
        }
        notifications.scheduleNotificationAsync({
          content: {
            title: copy.title,
            body: copy.body,
          },
          trigger: null,
        });
      });

      // Tapping a Ghost notification opens the canonical conversation.
      let tapSub: { remove: () => void } | undefined;
      if (notifications) {
        try {
          tapSub = notifications.addNotificationResponseReceivedListener(() => {
            router.replace('/conversation' as never);
          });
        } catch {}
      }

      cleanup = () => {
        unsub();
        sub.remove();
        try {
          tapSub?.remove();
        } catch {}
      };
    })();
    return () => cleanup?.();
  }, [router]);

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
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="pairing-success"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="manual"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />

        {/* Error states */}
        <Stack.Screen
          name="auth-failure"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="revoked"
          options={{ animation: 'fade' }}
        />

        {/* Settings */}
        <Stack.Screen
          name="intelligence"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="connections"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="goals"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="device"
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
