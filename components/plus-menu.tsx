import { usePathname, useRouter } from "expo-router";
import { Plus, X } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Space } from "@/constants/theme";

const ITEMS = [
  { route: "/(tabs)" as const, label: "Conversation", match: "index" },
  { route: "/(tabs)/activity" as const, label: "Activity", match: "activity" },
  { route: "/(tabs)/memory" as const, label: "Memory", match: "memory" },
  { route: "/(tabs)/more" as const, label: "More", match: "more" },
];

export function PlusMenu({ hidden }: { hidden?: boolean }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  const go = (route: string) => {
    setOpen(false);
    router.push(route as never);
  };
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.scrim}>
          <Pressable style={styles.scrimTouch} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
          <View style={styles.list}>
            {ITEMS.map((item) => {
              const active = pathname.endsWith(item.match) || (item.match === "index" && pathname.endsWith("(tabs)"));
              return (
                <Pressable
                  key={item.label}
                  style={styles.row}
                  onPress={() => go(item.route)}
                  accessibilityLabel={`Go to ${item.label}`}
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.dot, active && styles.dotActive]} />
                  <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      ) : null}
      <View style={styles.glow} pointerEvents="none" />
      <Pressable
        style={styles.fab}
        onPress={() => setOpen((v) => !v)}
        accessibilityLabel={open ? "Close menu" : "Open menu"}
        accessibilityRole="button"
      >
        {open ? <X size={20} color="#FAFAF6" /> : <Plus size={20} color="#FAFAF6" />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(250,250,247,0.92)",
    justifyContent: "center",
    paddingHorizontal: Space.xxxl,
  },
  scrimTouch: {
    ...StyleSheet.absoluteFill,
  },
  list: {
    gap: Space.xl,
    marginBottom: 120,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.lg,
    minHeight: 44,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1A1611",
    opacity: 0.92,
  },
  dotActive: {
    opacity: 1,
  },
  label: {
    fontSize: 17,
    fontWeight: "500",
    color: "#1A1611",
    letterSpacing: -0.1,
  },
  labelActive: {
    fontWeight: "700",
  },
  glow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: "rgba(255,196,92,0.10)",
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "#1A1611",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 34,
  },
});
