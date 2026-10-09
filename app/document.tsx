import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileType2, Pencil, Share2, X } from "lucide-react-native";
import { Text } from "@/components/text";
import { fetchArtifact, fetchDocumentPage, type Artifact } from "@/lib/ghostApi";
import { A4, hasWordCopy, shareExport } from "@/lib/documents";
import { useGhostStore } from "@/lib/store";
import { Ghost, Space } from "@/constants/theme";

/**
 * A document, full screen: every page as it will print, one under the other,
 * with what you do with it in one bar below: change it (back to the
 * conversation, a sentence started for you), share it as a PDF, or have it as
 * Word. Pages are drawn on the Pod one at a time as they come into reach.
 */
export default function DocumentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { width } = useWindowDimensions();
  const config = useGhostStore((s) => s.config);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [doc, setDoc] = useState<Artifact | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [uris, setUris] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "docx" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const pageW = width - Space.lg * 2;

  const load = useCallback(async (n: number) => {
    if (!config || !id) return;
    const r = await fetchDocumentPage(config, id, n, Math.min(1400, Math.round(pageW * 2.4)));
    if (r.ok) {
      setPages(r.page.pages);
      setUris((u) => ({ ...u, [n]: r.page.uri }));
      setFailed((f) => { const next = { ...f }; delete next[n]; return next; });
    } else {
      if (n === 1) setError(r.error);
      setFailed((f) => ({ ...f, [n]: r.error }));
    }
  }, [config, id, pageW]);

  useEffect(() => {
    if (!config || !id) return;
    fetchArtifact(config, id).then(setDoc);
    void load(1);
  }, [config, id, load]);

  // The rest, one after another, so the first ones arrive first.
  useEffect(() => {
    if (!pages || pages < 2) return;
    let live = true;
    (async () => {
      for (let n = 2; n <= pages && live; n++) {
        if (!uris[n]) await load(n);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const title = doc?.title ?? "Document";

  const share = async (format: "pdf" | "docx") => {
    if (!config || !id || busy) return;
    setBusy(format);
    setNote(null);
    try {
      const why = await shareExport(config, id, format);
      if (why) setNote(why);
    } catch {
      setNote("Couldn't share that.");
    } finally {
      setBusy(null);
    }
  };

  const change = () => {
    useGhostStore.getState().setIntent({ text: `Change the "${title}" document: `, send: false });
    close();
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Space.sm }]}>
        <Pressable onPress={close} hitSlop={8} style={styles.round} accessibilityRole="button" accessibilityLabel="Close">
          <X size={18} color={Ghost.text.primary} strokeWidth={1.8} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
          {pages ? <Text style={styles.sub}>{pages} {pages === 1 ? "page" : "pages"}</Text> : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {error && !uris[1] ? (
        <View style={styles.center}>
          <Text style={styles.state}>{error}</Text>
          <Pressable onPress={() => { setError(null); void load(1); }} style={styles.pill} accessibilityRole="button">
            <Text style={styles.pillText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.pages} showsVerticalScrollIndicator={false}>
          {Array.from({ length: pages ?? 1 }, (_, i) => i + 1).map((n) => (
            <View key={n} style={[styles.sheet, { width: pageW, height: pageW * A4 }]}>
              {uris[n] ? (
                <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
                  <Image source={{ uri: uris[n] }} style={styles.page} resizeMode="contain" accessibilityLabel={`Page ${n}`} />
                </Animated.View>
              ) : failed[n] ? (
                <Pressable onPress={() => void load(n)} style={styles.pageState} accessibilityRole="button" accessibilityLabel={`Page ${n} didn't load. Try again`}>
                  <Text style={styles.pageStateText}>{failed[n]}</Text>
                  <Text style={styles.retry}>Try again</Text>
                </Pressable>
              ) : (
                <View style={styles.pageState}>
                  <ActivityIndicator size="small" color="#9A98A6" />
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {note ? <Text style={styles.note} accessibilityLiveRegion="polite">{note}</Text> : null}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Space.md) }]}>
        <Pressable onPress={change} style={({ pressed }) => [styles.action, styles.primary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Ask Ghost to change it">
          <Pencil size={15} color={Ghost.text.primary} strokeWidth={1.9} />
          <Text style={styles.actionText}>Change it</Text>
        </Pressable>
        <Pressable onPress={() => void share("pdf")} disabled={busy !== null} style={({ pressed }) => [styles.action, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Share as PDF">
          {busy === "pdf" ? <ActivityIndicator size="small" color={Ghost.text.primary} /> : <Share2 size={15} color={Ghost.text.primary} strokeWidth={1.9} />}
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
        {doc && hasWordCopy(doc) ? (
          <Pressable onPress={() => void share("docx")} disabled={busy !== null} style={({ pressed }) => [styles.action, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Share as a Word file">
            {busy === "docx" ? <ActivityIndicator size="small" color={Ghost.text.primary} /> : <FileType2 size={15} color={Ghost.text.primary} strokeWidth={1.9} />}
            <Text style={styles.actionText}>Word</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Ghost.bg.base },
  header: { flexDirection: "row", alignItems: "center", gap: Space.md, paddingHorizontal: Space.lg, paddingBottom: Space.sm },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  titleWrap: { flex: 1, alignItems: "center", minHeight: 40, justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "600", color: Ghost.text.primary, letterSpacing: -0.15 },
  sub: { fontSize: 12, color: Ghost.text.tertiary, marginTop: 1 },
  pages: { paddingHorizontal: Space.lg, paddingTop: Space.sm, paddingBottom: Space.xl, gap: Space.lg, alignItems: "center" },
  sheet: { borderRadius: 4, overflow: "hidden", backgroundColor: "#FFFFFF", boxShadow: "0 10px 32px rgba(0,0,0,0.6)" },
  page: { width: "100%", height: "100%" },
  pageState: { flex: 1, alignItems: "center", justifyContent: "center", gap: Space.sm, padding: Space.xl },
  pageStateText: { fontSize: 13.5, color: "#55535F", textAlign: "center" },
  retry: { fontSize: 13.5, fontWeight: "600", color: "#4B3FD6" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: Space.md, paddingHorizontal: Space.xl },
  state: { fontSize: 14, color: Ghost.text.tertiary, textAlign: "center" },
  pill: { height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  pillText: { fontSize: 13.5, color: Ghost.text.primary, fontWeight: "500" },
  note: { textAlign: "center", fontSize: 13, color: Ghost.text.tertiary, paddingTop: Space.sm, paddingHorizontal: Space.xl },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Space.sm, paddingTop: Space.md, paddingHorizontal: Space.lg },
  action: { flexDirection: "row", alignItems: "center", gap: 7, height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  primary: { backgroundColor: "rgba(58,46,240,0.34)", borderColor: "rgba(140,128,255,0.45)" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  actionText: { fontSize: 14, fontWeight: "500", color: Ghost.text.primary },
});
