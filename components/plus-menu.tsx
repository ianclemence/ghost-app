import { usePathname, useRouter } from "expo-router";
import { Activity, Brain, MessageCircle, SlidersHorizontal } from "lucide-react-native";
import { ScreenGlow } from "@/components/screen-glow";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Space } from "@/constants/theme";

const ITEMS = [
  { route: "/conversation" as const, label: "Conversation", match: "conversation", Icon: MessageCircle },
  { route: "/(tabs)/activity" as const, label: "Activity", match: "activity", Icon: Activity },
  { route: "/(tabs)/memory" as const, label: "Memory", match: "memory", Icon: Brain },
  { route: "/(tabs)/more" as const, label: "More", match: "more", Icon: SlidersHorizontal },
];

const SPRING_EASE = Easing.bezier(0.32, 0.72, 0, 1);

function FabGlyph({ open }: { open: boolean }) {
  const rot = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    rot.value = withTiming(open ? 45 : 0, {
      duration: reduceMotion ? 0 : 340,
      easing: SPRING_EASE,
      reduceMotion: ReduceMotion.System,
    });
  }, [open, rot, reduceMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <Animated.View style={[styles.glyph, style]} pointerEvents="none">
      <View style={styles.barH} />
      <View style={styles.barV} />
    </Animated.View>
  );
}

export function PlusMenu({ hidden }: { hidden?: boolean }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  const go = (route: string) => {
    setOpen(false);
    router.push(route as never);
  };
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {open ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(220).easing(SPRING_EASE)}
          exiting={reduceMotion ? undefined : FadeOut.duration(160)}
          style={styles.scrim}
        >
          <Pressable style={styles.scrimTouch} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
          <View style={styles.list}>
            {ITEMS.map((item, i) => {
              const active = pathname.includes(item.match);
              const Icon = item.Icon;
              return (
                <Animated.View
                  key={item.label}
                  entering={reduceMotion ? undefined : FadeInUp.duration(420).delay(90 + i * 75).easing(SPRING_EASE)}
                >
                  <Pressable
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => go(item.route)}
                    accessibilityLabel={`Go to ${item.label}`}
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[styles.iconWell, active && styles.iconWellActive]}>
                      <Icon size={18} color={active ? "#FAFAF6" : "#1A1611"} strokeWidth={1.5} />
                    </View>
                    <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      ) : null}
      <ScreenGlow />
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setOpen((v) => !v)}
        accessibilityLabel={open ? "Close menu" : "Open menu"}
        accessibilityRole="button"
      >
        <FabGlyph open={open} />
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
    backgroundColor: "rgba(250,250,247,0.94)",
    justifyContent: "center",
    paddingHorizontal: Space.xxxl,
  },
  scrimTouch: {
    ...StyleSheet.absoluteFill,
  },
  list: {
    gap: Space.lg,
    marginBottom: 120,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.lg,
    minHeight: 48,
  },
  rowPressed: {
    opacity: 0.55,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EDEBE6",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWellActive: {
    backgroundColor: "#1A1611",
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
  fab: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "#1A1611",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.edge,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.9,
  },
  glyph: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  barH: {
    position: "absolute",
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#FAFAF6",
  },
  barV: {
    position: "absolute",
    width: 2,
    height: 18,
    borderRadius: 1,
    backgroundColor: "#FAFAF6",
  },
});
