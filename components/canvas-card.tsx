import React, { memo, useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { AlertTriangle, AppWindow, ChevronDown, ChevronUp, Maximize2 } from "lucide-react-native";
import { Text } from "@/components/text";
import { MADE_LOOK } from "@/components/made-look";
import { CanvasView, CANVAS_BG } from "@/components/canvas-view";
import { useCanvasSource } from "@/hooks/use-canvas-source";
import { useCanvasSaved } from "@/hooks/use-canvas-saved";
import { CANVAS_MAX_INLINE_HEIGHT, fixPrompt, withAlpha, type CanvasInfo } from "@/lib/canvas";
import type { Artifact, GhostConfig } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Something Ghost built, running in the conversation, as a window.
 *
 * The page runs at its own height in a rounded frame the width of the thread,
 * on its own ground (a page that sets no colour gets the canvas base), so what
 * the model drew always sits in the same shape whatever it chose. The frame's
 * floor is the window's bar: what it is (a badge, the title, which version) and
 * one Open button for the full-screen sheet (Change it, Copy code, Share,
 * versions). The bar is part of the frame, never a loose line under it.
 *
 * The newest canvas runs where it is; earlier ones fold to the bar alone, which
 * runs again on a tap. If the page throws, the window says so once, above its
 * bar, and offers to have Ghost fix it. The owner's choice to fold or unfold
 * wins over the automatic one.
 */
export const CanvasCard = memo(function CanvasCard({
  config,
  artifact,
  info,
}: {
  config: GhostConfig;
  artifact: Artifact;
  info: CanvasInfo | undefined;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [owner, setOwner] = useState<boolean | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const [ground, setGround] = useState<string>(CANVAS_BG);
  const open = owner ?? info?.latest ?? true;
  const { source, retry } = useCanvasSource(config, artifact, open);
  const kept = useCanvasSaved(config, artifact, open);
  const title = artifact.title || "Canvas";
  const version = info && info.total > 1 ? `v${info.version}` : null;
  const spokenVersion = info && info.total > 1 ? `, version ${info.version} of ${info.total}` : "";

  const openFull = useCallback(() => {
    router.push({ pathname: "/canvas", params: { id: artifact.id } } as never);
  }, [router, artifact.id]);

  const fix = useCallback(() => {
    if (!error) return;
    useGhostStore.getState().setIntent({ text: fixPrompt(title, error), send: true });
    setError(null);
  }, [error, title]);

  if (!open) {
    return (
      <View style={styles.wrap}>
        <Pressable
          onPress={() => setOwner(true)}
          style={({ pressed }) => [styles.frame, styles.bar, styles.barAlone, pressed && styles.barPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${title}${spokenVersion}. Run it again`}
        >
          <Badge />
          <View style={styles.titles}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.meta} numberOfLines={1}>{[version, "Tap to run it again"].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={styles.round}>
            <ChevronDown size={16} color={Ghost.text.secondary} strokeWidth={2} />
          </View>
        </Pressable>
      </View>
    );
  }

  const ready = source.state === "ready" && kept.ready;
  const clipped = pageHeight > CANVAS_MAX_INLINE_HEIGHT + 8;
  const meta = [version, clipped ? "More inside" : "Interactive"].filter(Boolean).join(" · ");
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(220).easing(EASE)} style={styles.wrap}>
      <View style={[styles.frame, { backgroundColor: ground }]}>
        {ready ? (
          <View>
            <CanvasView
              html={source.html}
              mode="inline"
              saved={kept.saved}
              onSave={kept.save}
              reloadKey={reload}
              onHeight={setPageHeight}
              onSurface={(s) => setGround(s.color ?? CANVAS_BG)}
              onError={(m) => setError((prev) => prev ?? m)}
              onReload={() => { setError(null); setReload((n) => n + 1); }}
            />
            {clipped ? (
              // The page goes on below the window: it melts into its own ground.
              <View style={styles.fade} pointerEvents="none">
                <LinearGradient colors={[withAlpha(ground, 0), ground]} style={StyleSheet.absoluteFill} />
              </View>
            ) : null}
          </View>
        ) : source.state !== "error" ? (
          <View style={[styles.state, { height: 180 }]} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={Ghost.text.secondary} />
            <Text style={styles.stateText}>Opening {title}…</Text>
          </View>
        ) : (
          <View style={[styles.state, { height: 160 }]} accessibilityLiveRegion="polite">
            <Text style={styles.stateText}>{source.reason}</Text>
            <Pressable
              onPress={retry}
              style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.pillText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {error ? (
          <Animated.View entering={reduce ? undefined : FadeIn.duration(180).easing(EASE)} style={styles.problem} accessibilityLiveRegion="polite">
            <AlertTriangle size={15} color={Ghost.status.warning} strokeWidth={2} />
            <Text style={styles.problemText} numberOfLines={2}>{error}</Text>
            <Pressable
              onPress={fix}
              hitSlop={8}
              style={({ pressed }) => [styles.fix, pressed && styles.pillPressed]}
              accessibilityRole="button"
              accessibilityLabel="Ask Ghost to fix it"
            >
              <Text style={styles.fixText}>Fix it</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* The window's floor: what this is, and the way into it. */}
        <Pressable
          onPress={ready ? openFull : undefined}
          disabled={!ready}
          style={({ pressed }) => [styles.bar, pressed && styles.barPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${title}${spokenVersion}. Open full screen`}
        >
          <Badge />
          <View style={styles.titles}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
          </View>
          {info && !info.latest ? (
            <Pressable
              onPress={() => setOwner(false)}
              hitSlop={6}
              style={({ pressed }) => [styles.round, pressed && styles.pillPressed]}
              accessibilityRole="button"
              accessibilityLabel="Fold this away"
            >
              <ChevronUp size={16} color={Ghost.text.secondary} strokeWidth={2} />
            </Pressable>
          ) : null}
          {ready ? (
            <Pressable
              onPress={openFull}
              hitSlop={6}
              style={({ pressed }) => [styles.open, pressed && styles.pillPressed]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${title} full screen`}
            >
              <Maximize2 size={13} color={Ghost.text.primary} strokeWidth={2.1} />
              <Text style={styles.openText}>Open</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </View>
    </Animated.View>
  );
});

/** What a canvas is, at a glance: a small window in the accent's light. */
function Badge() {
  return (
    <View style={styles.badge}>
      <AppWindow size={17} color={MADE_LOOK.pages.tint} strokeWidth={1.9} />
    </View>
  );
}

const RADIUS = 24;
const BAR = 60;

const styles = StyleSheet.create({
  wrap: { marginTop: Space.lg },
  frame: {
    borderRadius: RADIUS,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    backgroundColor: CANVAS_BG,
  },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 64 },
  state: { alignItems: "center", justifyContent: "center", gap: Space.md, paddingHorizontal: Space.xl },
  stateText: { fontSize: 13.5, lineHeight: 19, color: Ghost.text.tertiary, textAlign: "center" },
  // One fixed height, so a folded window and an open one share the same floor.
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    height: BAR,
    paddingLeft: 12,
    paddingRight: 10,
    backgroundColor: Ghost.bg.raised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Ghost.border.default,
  },
  barAlone: { borderTopWidth: 0 },
  barPressed: { backgroundColor: "#15151B" },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: alpha(MADE_LOOK.pages.tint, 0.13),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(MADE_LOOK.pages.tint, 0.32),
  },
  titles: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 14.5, lineHeight: 19, fontWeight: "500", letterSpacing: -0.1, color: Ghost.text.primary },
  meta: { fontSize: 12.5, lineHeight: 16, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  open: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: Ghost.glass.fillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  openText: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.primary },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  pill: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    justifyContent: "center",
    backgroundColor: Ghost.glass.fillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  pillText: { fontSize: 13.5, color: Ghost.text.primary, fontWeight: "500" },
  pillPressed: { opacity: 0.8, transform: [{ scale: 0.96 }] },
  problem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    backgroundColor: "#1A1508",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha(Ghost.status.warning, 0.28),
  },
  problemText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: Ghost.text.secondary, fontFamily: Fonts?.mono ?? "monospace" },
  fix: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    justifyContent: "center",
    backgroundColor: alpha(Ghost.status.warning, 0.14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(Ghost.status.warning, 0.4),
  },
  fixText: { fontSize: 13, fontWeight: "600", color: Ghost.status.warning },
});
