import React, { memo, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { Clapperboard, Maximize2 } from "lucide-react-native";
import { Text } from "@/components/text";
import { CanvasView, CANVAS_BG } from "@/components/canvas-view";
import { fetchMotion, type Artifact, type GhostConfig } from "@/lib/ghostApi";
import { clock } from "@/lib/motion";
import { alpha, Ghost, Space } from "@/constants/theme";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const cache = new Map<string, { html: string; duration: number }>();

/**
 * An animated explainer Ghost made, playing in the conversation in the same
 * window a canvas runs in: it plays once on its own and again on a tap. The
 * bar says what it is and how long, and Open leads to where every word,
 * number and timing can be changed and the video made.
 */
export const MotionCard = memo(function MotionCard({ config, artifact }: { config: GhostConfig; artifact: Artifact }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [m, setM] = useState(() => cache.get(artifact.id) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (cache.has(artifact.id)) return;
    let live = true;
    fetchMotion(config, artifact.id).then((r) => {
      if (!live) return;
      if (r.ok) {
        const v = { html: r.data.html, duration: r.data.duration };
        cache.set(artifact.id, v);
        setM(v);
        setError(null);
      } else setError(r.error);
    });
    return () => { live = false; };
  }, [config, artifact.id, attempt]);

  const open = useCallback(() => router.push({ pathname: "/motion", params: { id: artifact.id } } as never), [router, artifact.id]);
  const title = artifact.title || "Motion";

  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(220).easing(EASE)} style={styles.wrap}>
      <View style={styles.frame}>
        {m ? (
          <CanvasView html={m.html} mode="inline" />
        ) : error ? (
          <View style={[styles.state, { height: 160 }]}>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable onPress={() => setAttempt((n) => n + 1)} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <Text style={styles.pillText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.state, { height: 220 }]}>
            <ActivityIndicator size="small" color={Ghost.text.secondary} />
          </View>
        )}
        <Pressable onPress={open} style={({ pressed }) => [styles.bar, pressed && styles.barPressed]} accessibilityRole="button" accessibilityLabel={`${title}, an animation${m ? ` of ${Math.round(m.duration)} seconds` : ""}. Open to change it or make the video`}>
          <View style={styles.badge}>
            <Clapperboard size={17} color={Ghost.accent.primary} strokeWidth={1.9} />
          </View>
          <View style={styles.titles}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.meta} numberOfLines={1}>{["Motion", m ? clock(m.duration) : null, "Tap it to play"].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={styles.open}>
            <Maximize2 size={13} color={Ghost.text.primary} strokeWidth={2.1} />
            <Text style={styles.openText}>Open</Text>
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginTop: Space.lg },
  frame: { borderRadius: 24, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border, backgroundColor: CANVAS_BG },
  state: { alignItems: "center", justifyContent: "center", gap: Space.md, paddingHorizontal: Space.xl },
  stateText: { fontSize: 13.5, lineHeight: 19, color: Ghost.text.tertiary, textAlign: "center" },
  pill: { height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  pillText: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.primary },
  bar: { flexDirection: "row", alignItems: "center", gap: Space.md, height: 60, paddingLeft: 12, paddingRight: 10, backgroundColor: Ghost.bg.raised, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.default },
  barPressed: { backgroundColor: "#15151B" },
  badge: { width: 36, height: 36, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: alpha(Ghost.accent.primary, 0.13), borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(Ghost.accent.primary, 0.32) },
  titles: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 14.5, lineHeight: 19, fontWeight: "500", letterSpacing: -0.1, color: Ghost.text.primary },
  meta: { fontSize: 12.5, lineHeight: 16, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  open: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  openText: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.primary },
});
