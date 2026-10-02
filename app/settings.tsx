import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Ghost, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";

/** The few things you set up once. Each row opens its own screen. */
const ROWS = [
  { title: "Intelligence", detail: "Which AI Ghost thinks with", path: "/intelligence" },
  { title: "Connected apps", detail: "Email, calendar, and logins", path: "/connections" },
  { title: "Your Pod", detail: "Health and the models on it", path: "/ghost" },
  { title: "About", detail: "", path: "/about" },
];

export default function SettingsScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <ScreenHeader title="Settings" />
      <View style={styles.group}>
        {ROWS.map((r, i) => (
          <Pressable
            key={r.path}
            onPress={() => router.push(r.path as never)}
            style={({ pressed }) => [styles.row, i < ROWS.length - 1 && styles.line, pressed && { opacity: 0.55 }]}
            accessibilityRole="button"
            accessibilityLabel={[r.title, r.detail].filter(Boolean).join(", ")}
          >
            <View style={styles.text}>
              <Text style={styles.title}>{r.title}</Text>
              {r.detail ? <Text style={styles.detail}>{r.detail}</Text> : null}
            </View>
            <ChevronRight size={18} color={Ghost.text.tertiary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  group: {
    margin: Space.lg,
    borderRadius: 24,
    borderCurve: "continuous",
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: Space.md, paddingHorizontal: Space.xl, paddingVertical: 16, minHeight: 60 },
  line: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Ghost.border.subtle },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16.5, lineHeight: 22, color: Ghost.text.primary },
  detail: { fontSize: 13.5, lineHeight: 18, color: Ghost.text.secondary },
});
