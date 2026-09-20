import { usePathname, useRouter } from "expo-router";
import { Blocks, CalendarClock, Cpu, Flag, House, Info, MessageCircle, PhoneCall, Smartphone, Sparkles } from "lucide-react-native";
import { ScreenBackground } from "@/components/screen-glow";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { useGhostStore } from "@/lib/store";

// The app is the daily driver. The menu is grouped by role so the everyday
// verbs (talk) stay at the top and management/connection live below — the
// control plane itself is Ghost Web, not this menu.
//
// "Things Ghost does" replaces the old split between routines and
// automations: the owner has one mental model, so there is one destination.
const ITEMS = [
  { group: "Talk", route: "/(tabs)" as const, label: "Home", match: "(tabs)", Icon: House },
  { group: "Talk", route: "/conversation" as const, label: "Conversation", match: "conversation", Icon: MessageCircle },
  { group: "Talk", route: "/live" as const, label: "Live voice", match: "live", Icon: PhoneCall },
  { group: "Your Ghost", route: "/things" as const, label: "Routines", match: "things", Icon: CalendarClock },
  { group: "Your Ghost", route: "/intelligence" as const, label: "Intelligence", match: "intelligence", Icon: Sparkles },
  { group: "Your Ghost", route: "/local-models" as const, label: "Ghost Local", match: "local-models", Icon: Smartphone },
  { group: "Your Ghost", route: "/connections" as const, label: "Connected Apps", match: "connections", Icon: Blocks },
  { group: "Your Ghost", route: "/goals" as const, label: "Goals", match: "goals", Icon: Flag },
  { group: "Your Ghost", route: "/device" as const, label: "Ghost Pod", match: "device", Icon: Cpu },
  { group: "More", route: "/about" as const, label: "About", match: "about", Icon: Info },
];

const SPRING_EASE = Easing.bezier(0.32, 0.72, 0, 1);

function FabGlyph({ open }: { open: boolean }) {
  const rot = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    rot.set(withTiming(open ? 45 : 0, {
      duration: reduceMotion ? 0 : 340,
      easing: SPRING_EASE,
      reduceMotion: ReduceMotion.System,
    }));
  }, [open, rot, reduceMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }] }));
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
  const config = useGhostStore((s) => s.config);
  // Without a Pod, Pod-only destinations have nothing to show, so they are
  // replaced by the one action that matters: adding a Pod later. A Pod stays
  // optional and can be connected at any time.
  const items = config
    ? ITEMS
    : [
        { group: "Talk", route: "/(tabs)" as const, label: "Home", match: "(tabs)", Icon: House },
        { group: "Talk", route: "/conversation" as const, label: "Conversation", match: "conversation", Icon: MessageCircle },
        { group: "Your Ghost", route: "/local-models" as const, label: "Ghost Local", match: "local-models", Icon: Smartphone },
        { group: "Your Ghost", route: "/connect" as const, label: "Connect a Ghost Pod", match: "connect", Icon: Cpu },
        { group: "More", route: "/about" as const, label: "About", match: "about", Icon: Info },
      ];
  const fabRot = useSharedValue(0);
  useEffect(() => {
    fabRot.set(withTiming(open ? 45 : 0, {
      duration: reduceMotion ? 0 : 340,
      easing: SPRING_EASE,
      reduceMotion: ReduceMotion.System,
    }));
  }, [open, fabRot, reduceMotion]);
  const fabSpin = useAnimatedStyle(() => ({ transform: [{ rotate: `${fabRot.get()}deg` }] }));
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
          <ScreenBackground />
          <Pressable style={styles.scrimTouch} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {items.map((item, i) => {
              const active = item.route === "/(tabs)"
                ? (pathname === "/" || pathname.includes("(tabs)"))
                : pathname.includes(item.match);
              const Icon = item.Icon;
              const showGroup = i === 0 || items[i - 1].group !== item.group;
              return (
                <React.Fragment key={item.label}>
                  {showGroup ? (
                    <Animated.View
                      entering={reduceMotion ? undefined : FadeInUp.duration(260).delay(90 + i * 70).easing(SPRING_EASE)}
                    >
                      <Text style={styles.groupLabel}>{item.group}</Text>
                    </Animated.View>
                  ) : null}
                  <Animated.View
                    entering={reduceMotion ? undefined : FadeInUp.duration(260).delay(90 + i * 70).easing(SPRING_EASE)}
                  >
                    <Pressable
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      pressRetentionOffset={16}
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
                </React.Fragment>
              );
            })}
          </ScrollView>
        </Animated.View>
      ) : null}
      <Animated.View style={fabSpin}>
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={() => setOpen((v) => !v)}
          accessibilityLabel={open ? "Close menu" : "Open menu"}
          accessibilityRole="button"
        >
          <FabGlyph open={open} />
        </Pressable>
      </Animated.View>
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
  listScroll: {
    maxHeight: "72%",
    marginBottom: 120,
  },
  list: {
    gap: Space.lg,
    paddingVertical: Space.sm,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#8A847C",
    marginTop: Space.sm,
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
