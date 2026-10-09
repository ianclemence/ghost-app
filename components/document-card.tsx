import React, { memo, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, FadeIn, useReducedMotion } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { FileText, Maximize2 } from "lucide-react-native";
import { Text } from "@/components/text";
import { fetchDocumentPage, type Artifact, type GhostConfig } from "@/lib/ghostApi";
import { hasWordCopy } from "@/lib/documents";
import { alpha, Ghost, Space } from "@/constants/theme";

const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const PEEK = 248;

// A page is drawn once on the Pod and kept; the phone keeps it for the session
// so a row scrolled back into view does not fetch it again.
const firstPages = new Map<string, { uri: string; pages: number }>();

/**
 * A document Ghost made, in the conversation: the top of its first page, on a
 * dark desk, like a sheet of paper lying in the window, and the same bar as
 * every window below it (what it is, how many pages, Open). Opening it shows
 * every page, with Share and Word.
 */
export const DocumentCard = memo(function DocumentCard({ config, artifact }: { config: GhostConfig; artifact: Artifact }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const cached = firstPages.get(artifact.id);
  const [page, setPage] = useState<{ uri: string; pages: number } | null>(cached ?? null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (page) return;
    let live = true;
    setError(null);
    fetchDocumentPage(config, artifact.id, 1, 720).then((r) => {
      if (!live) return;
      if (r.ok) {
        const v = { uri: r.page.uri, pages: r.page.pages };
        firstPages.set(artifact.id, v);
        setPage(v);
      } else {
        setError(r.error);
      }
    });
    return () => { live = false; };
  }, [config, artifact.id, page, attempt]);

  const open = useCallback(() => {
    router.push({ pathname: "/document", params: { id: artifact.id } } as never);
  }, [router, artifact.id]);

  const pages = page?.pages;
  const meta = [pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : null, hasWordCopy(artifact) ? "PDF · Word" : "PDF", versionOf(artifact)].filter(Boolean).join(" · ");

  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(220).easing(EASE)} style={styles.wrap}>
      <View style={styles.frame}>
        <Pressable onPress={open} accessibilityRole="imagebutton" accessibilityLabel={`${artifact.title}. Open the document`}>
          <View style={styles.desk}>
            {page ? (
              <View style={styles.sheet}>
                <Image source={{ uri: page.uri }} style={styles.page} resizeMode="cover" />
              </View>
            ) : error ? (
              <View style={styles.state}>
                <Text style={styles.stateText}>{error}</Text>
                <Pressable onPress={() => setAttempt((n) => n + 1)} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]} accessibilityRole="button">
                  <Text style={styles.pillText}>Try again</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.state}>
                <ActivityIndicator size="small" color={Ghost.text.secondary} />
              </View>
            )}
            {page ? (
              <View style={styles.fade} pointerEvents="none">
                <LinearGradient colors={["rgba(21,21,27,0)", "rgba(21,21,27,1)"]} style={StyleSheet.absoluteFill} />
              </View>
            ) : null}
          </View>
        </Pressable>
        <Pressable onPress={open} style={({ pressed }) => [styles.bar, pressed && styles.barPressed]} accessibilityRole="button" accessibilityLabel={`${artifact.title}, ${meta}. Open`}>
          <View style={styles.badge}>
            <FileText size={17} color={Ghost.status.warning} strokeWidth={1.9} />
          </View>
          <View style={styles.titles}>
            <Text style={styles.title} numberOfLines={1}>{artifact.title}</Text>
            <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
          </View>
          <View style={styles.openBtn}>
            <Maximize2 size={13} color={Ghost.text.primary} strokeWidth={2.1} />
            <Text style={styles.openText}>Open</Text>
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
});

/** "v2" when the Pod said this is a later version ("Version 2 · 3 pages"). */
function versionOf(a: Artifact): string | null {
  const m = /^Version (\d+)/.exec(a.summary ?? "");
  return m && m[1] !== "1" ? `v${m[1]}` : null;
}

const styles = StyleSheet.create({
  wrap: { marginTop: Space.lg },
  frame: {
    borderRadius: 24,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    backgroundColor: Ghost.bg.raised,
  },
  // The desk the page lies on: a little lighter than the bar, so the white
  // sheet reads as paper and not as a hole in the window.
  desk: { height: PEEK, backgroundColor: "#15151B", alignItems: "center", paddingTop: 18, overflow: "hidden" },
  sheet: {
    width: "78%",
    aspectRatio: 1 / Math.SQRT2,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    boxShadow: "0 8px 28px rgba(0,0,0,0.55)",
  },
  page: { width: "100%", height: "100%" },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 72 },
  state: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", gap: Space.md, paddingHorizontal: Space.xl },
  stateText: { fontSize: 13.5, lineHeight: 19, color: Ghost.text.tertiary, textAlign: "center" },
  pill: { height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: "center", backgroundColor: Ghost.glass.fillStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  pillText: { fontSize: 13.5, color: Ghost.text.primary, fontWeight: "500" },
  bar: { flexDirection: "row", alignItems: "center", gap: Space.md, height: 60, paddingLeft: 12, paddingRight: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.default },
  barPressed: { backgroundColor: "#15151B" },
  badge: { width: 36, height: 36, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: alpha(Ghost.status.warning, 0.12), borderWidth: StyleSheet.hairlineWidth, borderColor: alpha(Ghost.status.warning, 0.32) },
  titles: { flex: 1, minWidth: 0, gap: 1 },
  title: { fontSize: 14.5, lineHeight: 19, fontWeight: "500", letterSpacing: -0.1, color: Ghost.text.primary },
  meta: { fontSize: 12.5, lineHeight: 16, color: Ghost.text.tertiary },
  openBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: Ghost.glass.fillStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  openText: { fontSize: 13.5, fontWeight: "500", color: Ghost.text.primary },
});
