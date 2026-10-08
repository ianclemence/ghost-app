import React, { memo, useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { AlertTriangle, ChevronDown, ChevronUp, Code2, Maximize2 } from "lucide-react-native";
import { Text } from "@/components/text";
import { CanvasView } from "@/components/canvas-view";
import { useCanvasSource } from "@/hooks/use-canvas-source";
import { CANVAS_MAX_INLINE_HEIGHT, fixPrompt, type CanvasInfo } from "@/lib/canvas";
import type { Artifact, GhostConfig } from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import { Fonts, Ghost, Space } from "@/constants/theme";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Something Ghost built, running in the conversation.
 *
 * The page IS the thing: no card around it, no frame, no header bar. A dark
 * page sits straight on the conversation (its own ground is made clear, so a
 * page that draws a card of its own shows only that card); a light page keeps
 * its colour in rounded corners. A small glass button floats at its corner to
 * open it full screen, and one quiet caption line below names it, like a figure
 * in a book. The newest canvas runs where it is; earlier ones fold to one line
 * that runs again on a tap. If the page throws, the card says so once and offers
 * to have Ghost fix it. The owner's choice to fold or unfold wins over the
 * automatic one.
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
  const [light, setLight] = useState<string | null>(null);
  const open = owner ?? info?.latest ?? true;
  const { source, retry } = useCanvasSource(config, artifact, open);
  const title = artifact.title || "Canvas";
  const version = info && info.total > 1 ? `v${info.version}` : null;

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
      <Pressable
        onPress={() => setOwner(true)}
        style={({ pressed }) => [styles.folded, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={`${title}${version ? `, version ${info?.version}` : ""}. Run it again`}
      >
        <Code2 size={15} color={Ghost.text.tertiary} strokeWidth={1.9} />
        <Text style={styles.foldedTitle} numberOfLines={1}>{title}</Text>
        {version ? <Text style={styles.foldedVersion}>{version}</Text> : null}
        <View style={{ flex: 1 }} />
        <ChevronDown size={15} color={Ghost.text.tertiary} />
      </Pressable>
    );
  }

  const clipped = pageHeight > CANVAS_MAX_INLINE_HEIGHT + 8;
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(220).easing(EASE)} style={styles.wrap}>
      <View style={[styles.frame, light ? { backgroundColor: light, borderRadius: 22, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border } : null]}>
        {source.state === "ready" ? (
          <CanvasView
            html={source.html}
            mode="inline"
            reloadKey={reload}
            onHeight={setPageHeight}
            onSurface={(s) => setLight(s.dark ? null : s.color)}
            onError={(m) => setError((prev) => prev ?? m)}
            onReload={() => { setError(null); setReload((n) => n + 1); }}
          />
        ) : source.state === "loading" ? (
          <View style={[styles.state, { height: 160 }]}><Text style={styles.stateText}>Opening…</Text></View>
        ) : (
          <View style={[styles.state, { height: 140 }]}>
            <Text style={styles.stateText}>{source.reason}</Text>
            <Pressable onPress={retry} style={styles.retry} accessibilityRole="button" accessibilityLabel="Try again">
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}
        {clipped ? (
          <View style={styles.fade} pointerEvents="none">
            <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.78)"]} style={StyleSheet.absoluteFill} />
          </View>
        ) : null}
      </View>

      <View style={styles.caption}>
        <Pressable
          onPress={openFull}
          style={({ pressed }) => [styles.captionMain, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`${title}${version ? `, version ${info?.version}` : ""}. Open full screen`}
        >
          <Code2 size={13} color={Ghost.text.tertiary} strokeWidth={1.9} />
          <Text style={styles.captionTitle} numberOfLines={1}>{title}</Text>
          {version ? <Text style={styles.captionVersion}>{version}</Text> : null}
          {clipped ? <Text style={styles.captionMore} numberOfLines={1}>· more inside</Text> : null}
        </Pressable>
        {info && !info.latest ? (
          <Pressable onPress={() => setOwner(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fold this away">
            <ChevronUp size={16} color={Ghost.text.tertiary} />
          </Pressable>
        ) : null}
        {source.state === "ready" ? (
          // The way into the full-screen sheet: a quiet glass button at the end
          // of the caption, never over the page. Pressed it gives a little.
          <Pressable
            onPress={openFull}
            hitSlop={6}
            style={({ pressed }) => [styles.expand, pressed && styles.expandPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${title} full screen`}
          >
            <Maximize2 size={14} color={Ghost.text.primary} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(180)} style={styles.problem} accessibilityLiveRegion="polite">
          <AlertTriangle size={14} color={Ghost.status.warning} strokeWidth={2} />
          <Text style={styles.problemText} numberOfLines={2}>{error}</Text>
          <Pressable onPress={fix} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ask Ghost to fix it">
            <Text style={styles.fix}>Fix it</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginTop: Space.md },
  frame: { position: "relative" },
  expand: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  expandPressed: { transform: [{ scale: 0.95 }], opacity: 0.85 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 56 },
  state: { alignItems: "center", justifyContent: "center", gap: Space.sm },
  stateText: { fontSize: 13.5, color: Ghost.text.tertiary },
  retry: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    justifyContent: "center",
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  retryText: { fontSize: 13.5, color: Ghost.text.primary, fontWeight: "500" },
  caption: { flexDirection: "row", alignItems: "center", gap: Space.md, minHeight: 40, paddingLeft: 4 },
  captionMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, minHeight: 40 },
  captionTitle: { flexShrink: 1, fontSize: 13, fontWeight: "500", color: Ghost.text.secondary },
  captionVersion: { fontSize: 12, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
  captionMore: { fontSize: 12, color: Ghost.text.tertiary },
  problem: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, paddingHorizontal: 4 },
  problemText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: Ghost.text.secondary, fontFamily: Fonts?.mono ?? "monospace" },
  fix: { fontSize: 13.5, fontWeight: "600", color: Ghost.accent.primary },
  folded: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 44,
    marginTop: Space.sm,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: "rgba(0,0,0,0.38)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  foldedTitle: { flexShrink: 1, fontSize: 14.5, fontWeight: "500", color: Ghost.text.secondary },
  foldedVersion: { fontSize: 12, color: Ghost.text.tertiary },
});
