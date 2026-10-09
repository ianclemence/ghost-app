import React, { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { GhostList, GhostRow } from "@/components/ghost";
import { useGhostStore } from "@/lib/store";
import { pushLine, syncPushToken, type PushState } from "@/lib/push";

/** The few things you set up once. Each row opens its own screen. */
const ROWS = [
  { title: "Jobs", detail: "What Ghost takes on for you", path: "/jobs" },
  { title: "Intelligence", detail: "Ghost's thinking model", path: "/intelligence" },
  { title: "Connected apps", detail: "Email, calendar, and logins", path: "/connections" },
  { title: "Data sources", detail: "What dashboards can read", path: "/datasources" },
  { title: "Phone", detail: "Notifications, health, places", path: "/phone" },
  { title: "Your Pod", detail: "Health and the models on it", path: "/ghost" },
  { title: "About", detail: "What Ghost is and how it works", path: "/about" },
];

export default function SettingsScreen() {
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  // Whether Ghost can reach this phone when the app is closed. It used to be
  // checked silently and the answer thrown away, so nobody knew reminders
  // only arrived while the app was open.
  const [push, setPush] = useState<PushState | null>(null);
  const check = useCallback(async () => {
    if (config) setPush(await syncPushToken(config));
  }, [config]);
  useEffect(() => {
    void check();
  }, [check]);
  const fixPush = async () => {
    if (push === "denied") {
      try {
        const N = await import("expo-notifications");
        const r = await N.requestPermissionsAsync();
        if (r.status !== "granted") await Linking.openSettings();
      } catch {
        await Linking.openSettings();
      }
      void check();
    }
  };
  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Settings" subtitle="Make Ghost yours" />
      <View style={styles.list}>
        <GhostList>
          {ROWS.filter((r) => r.path !== "/about").map((r) => (
            <GhostRow key={r.path} title={r.title} subtitle={r.detail} chevron onPress={() => router.push(r.path as never)} />
          ))}
          <GhostRow
            title="Notifications"
            subtitle={pushLine(push)}
            chevron={push === "denied"}
            onPress={push === "denied" ? fixPush : undefined}
          />
          {ROWS.filter((r) => r.path === "/about").map((r) => (
            <GhostRow key={r.path} title={r.title} subtitle={r.detail} chevron onPress={() => router.push(r.path as never)} />
          ))}
        </GhostList>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  list: { paddingTop: Space.sm },
});
