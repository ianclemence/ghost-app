import React from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { GhostList, GhostRow } from "@/components/ghost";

/** The few things you set up once. Each row opens its own screen. */
const ROWS = [
  { title: "Intelligence", detail: "Which AI Ghost thinks with", path: "/intelligence" },
  { title: "Connected apps", detail: "Email, calendar, and logins", path: "/connections" },
  { title: "Your Pod", detail: "Health and the models on it", path: "/ghost" },
  { title: "About", detail: "What Ghost is and how it works", path: "/about" },
];

export default function SettingsScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Settings" subtitle="Set up once, then leave alone" />
      <View style={styles.list}>
        <GhostList>
          {ROWS.map((r) => (
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
