import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { Text } from "@/components/text";
import { Ghost, Space } from "@/constants/theme";
import { fetchFilePage, type GhostConfig } from "@/lib/ghostApi";

const A4 = 297 / 210;

/**
 * A PDF the owner sent, as its pages: fonts, layout and pictures as printed,
 * drawn on the Pod one at a time, the first ones first. Each page keeps its
 * own shape once it has arrived. `onFail` is told when even the first page
 * can't be drawn, so the screen can fall back to the text.
 */
export function PdfPages({ config, id, onPages, onFail }: { config: GhostConfig; id: string; onPages?: (n: number) => void; onFail?: (why: string) => void }) {
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const pageW = width - Space.lg * 2;
  const [pages, setPages] = useState<number | null>(null);
  const [uris, setUris] = useState<Record<number, string>>({});
  const [ratio, setRatio] = useState<Record<number, number>>({});
  const [failed, setFailed] = useState<Record<number, string>>({});

  const load = useCallback(async (n: number) => {
    const r = await fetchFilePage(config, id, n, Math.min(1400, Math.round(pageW * 2.4)));
    if (r.ok) {
      setPages(r.page.pages);
      setUris((u) => ({ ...u, [n]: r.page.uri }));
      setFailed((f) => { const next = { ...f }; delete next[n]; return next; });
      Image.getSize(r.page.uri, (w, h) => w > 0 && setRatio((x) => ({ ...x, [n]: h / w })), () => {});
    } else {
      if (n === 1) onFail?.(r.error);
      setFailed((f) => ({ ...f, [n]: r.error }));
    }
  }, [config, id, pageW, onFail]);

  useEffect(() => { void load(1); }, [load]);
  useEffect(() => { if (pages) onPages?.(pages); }, [pages, onPages]);

  // The rest, one after another.
  useEffect(() => {
    if (!pages || pages < 2) return;
    let live = true;
    (async () => {
      for (let n = 2; n <= pages && live; n++) await load(n);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  return (
    <View style={styles.pages}>
      {Array.from({ length: pages ?? 1 }, (_, i) => i + 1).map((n) => (
        <View key={n} style={[styles.sheet, { width: pageW, height: pageW * (ratio[n] ?? ratio[1] ?? A4) }]}>
          {uris[n] ? (
            <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
              <Image source={{ uri: uris[n] }} style={styles.page} resizeMode="contain" accessibilityLabel={`Page ${n}`} />
            </Animated.View>
          ) : failed[n] ? (
            <Pressable onPress={() => void load(n)} style={styles.state} accessibilityRole="button" accessibilityLabel={`Page ${n} didn't load. Try again`}>
              <Text style={styles.stateText}>{failed[n]}</Text>
              <Text style={styles.retry}>Try again</Text>
            </Pressable>
          ) : (
            <View style={styles.state}><ActivityIndicator size="small" color="#9A98A6" /></View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pages: { gap: Space.md, alignItems: "center" },
  sheet: { borderRadius: 6, overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  page: { width: "100%", height: "100%" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: Space.lg },
  stateText: { fontSize: 13, color: "#55535E", textAlign: "center" },
  retry: { fontSize: 13, fontWeight: "600", color: "#0B0B10" },
});
