import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { AlertTriangle, Check, ChevronDown, Copy, Pencil, RotateCw, Share2, X } from "lucide-react-native";
import { Text } from "@/components/text";
import { GhostSheet } from "@/components/ghost";
import { CanvasView } from "@/components/canvas-view";
import { useCanvasSource } from "@/hooks/use-canvas-source";
import { useCanvasSaved } from "@/hooks/use-canvas-saved";
import { canvasVersions, changeStarter, fixPrompt } from "@/lib/canvas";
import { getCanvasDraft } from "@/lib/canvasDraft";
import { fetchArtifacts, type Artifact } from "@/lib/ghostApi";
import { writeCacheFile } from "@/lib/localFiles";
import { clockTime } from "@/lib/thread";
import { MAIN_SESSION_ID, useGhostStore } from "@/lib/store";
import { Ghost, Space } from "@/constants/theme";

/**
 * A canvas, full screen: the page fills the display and can scroll, with the
 * few things you do with it in one quiet bar below. Opened from a canvas in the
 * conversation (by artifact id) or from code you were reading (a draft).
 *
 * Change it and Fix it hand back to Ghost through the conversation: they start
 * (or send) a message and return you to it, where the new version appears.
 */
export default function CanvasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const config = useGhostStore((s) => s.config);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const draft = useMemo(() => (id ? null : getCanvasDraft()), [id]);

  // The versions of this canvas, so the owner can step back through them.
  const [all, setAll] = useState<Artifact[]>([]);
  const [pick, setPick] = useState<string | null>(id ?? null);
  useEffect(() => {
    if (!config || !id) return;
    let live = true;
    fetchArtifacts(config, MAIN_SESSION_ID).then((list) => live && setAll(list));
    return () => { live = false; };
  }, [config, id]);
  const current = useMemo(() => all.find((a) => a.id === pick) ?? null, [all, pick]);
  const versions = useMemo(() => (current ? canvasVersions(all, current) : []), [all, current]);
  const index = current ? versions.findIndex((a) => a.id === current.id) : -1;

  const { source, retry } = useCanvasSource(config, pick ? { id: pick, path: current?.path ?? "" } : null, !!pick && !!current);
  const kept = useCanvasSaved(config, current && !draft ? { id: current.id, path: current.path } : null, !!current && !draft);
  const html = draft ? draft.html : source.state === "ready" && kept.ready ? source.html : null;
  const title = draft?.title ?? current?.title ?? "Canvas";

  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { setError(null); }, [pick, reload]);

  const handBack = useCallback((text: string, send: boolean) => {
    useGhostStore.getState().setIntent({ text, send });
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  const copy = useCallback(async () => {
    if (!html) return;
    try {
      await Clipboard.setStringAsync(html);
      Haptics.selectionAsync().catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setNote("Couldn't copy.");
    }
  }, [html]);

  const share = useCallback(async () => {
    if (!html) return;
    try {
      const Sharing = await import("expo-sharing");
      if (!(await Sharing.isAvailableAsync())) {
        setNote("This device can't share files from here.");
        return;
      }
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "canvas";
      const uri = await writeCacheFile(`${slug}.html`, html, "utf8");
      await Sharing.shareAsync(uri, { mimeType: "text/html" });
    } catch {
      setNote("Couldn't share that.");
    }
  }, [html, title]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Space.sm }]}>
        <Pressable onPress={close} hitSlop={8} style={styles.round} accessibilityRole="button" accessibilityLabel="Close">
          <X size={18} color={Ghost.text.primary} strokeWidth={1.8} />
        </Pressable>
        <Pressable
          onPress={() => versions.length > 1 && setVersionsOpen(true)}
          disabled={versions.length < 2}
          style={styles.titleWrap}
          accessibilityRole={versions.length > 1 ? "button" : "header"}
          accessibilityLabel={versions.length > 1 ? `${title}, version ${index + 1} of ${versions.length}. Choose a version` : title}
        >
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {versions.length > 1 ? (
            <View style={styles.versionRow}>
              <Text style={styles.versionText}>Version {index + 1} of {versions.length}</Text>
              <ChevronDown size={13} color={Ghost.text.tertiary} />
            </View>
          ) : null}
        </Pressable>
        <Pressable onPress={() => setReload((n) => n + 1)} hitSlop={8} style={styles.round} accessibilityRole="button" accessibilityLabel="Start the page over">
          <RotateCw size={16} color={Ghost.text.primary} strokeWidth={1.8} />
        </Pressable>
      </View>

      <View style={styles.page}>
        {html ? (
          <CanvasView
            html={html}
            mode="full"
            saved={draft ? null : kept.saved}
            onSave={draft ? undefined : kept.save}
            reloadKey={reload}
            onError={(m) => setError((prev) => prev ?? m)}
            onReload={() => setReload((n) => n + 1)}
          />
        ) : (
          <View style={styles.center}>
            {!draft && source.state === "error" ? (
              <>
                <Text style={styles.state}>{source.reason}</Text>
                <Pressable onPress={retry} style={styles.pill} accessibilityRole="button"><Text style={styles.pillText}>Try again</Text></Pressable>
              </>
            ) : (
              <Text style={styles.state}>Opening…</Text>
            )}
          </View>
        )}
      </View>

      {error && !draft ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(180)} style={styles.problem} accessibilityLiveRegion="polite">
          <AlertTriangle size={15} color={Ghost.status.warning} strokeWidth={2} />
          <Text style={styles.problemText} numberOfLines={2}>{error}</Text>
          <Pressable onPress={() => handBack(fixPrompt(title, error), true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ask Ghost to fix it">
            <Text style={styles.fix}>Fix it</Text>
          </Pressable>
        </Animated.View>
      ) : null}
      {note ? <Text style={styles.note} accessibilityLiveRegion="polite">{note}</Text> : null}

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Space.md) }]}>
        {!draft ? (
          <Pressable onPress={() => handBack(changeStarter(title), false)} style={[styles.action, styles.primary]} accessibilityRole="button" accessibilityLabel="Ask Ghost to change it">
            <Pencil size={15} color={Ghost.text.primary} strokeWidth={1.9} />
            <Text style={styles.actionText}>Change it</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={copy} disabled={!html} style={styles.action} accessibilityRole="button" accessibilityLabel={copied ? "Copied" : "Copy the code"}>
          {copied ? <Check size={15} color={Ghost.status.success} strokeWidth={2.2} /> : <Copy size={15} color={Ghost.text.primary} strokeWidth={1.9} />}
          <Text style={styles.actionText}>{copied ? "Copied" : "Copy code"}</Text>
        </Pressable>
        <Pressable onPress={share} disabled={!html} style={styles.action} accessibilityRole="button" accessibilityLabel="Share as a file">
          <Share2 size={15} color={Ghost.text.primary} strokeWidth={1.9} />
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
      </View>

      <GhostSheet visible={versionsOpen} onClose={() => setVersionsOpen(false)} title="Versions">
        {[...versions].reverse().map((a) => {
          const n = versions.findIndex((v) => v.id === a.id) + 1;
          const t = a.created_at ? Date.parse(a.created_at) : NaN;
          const active = a.id === pick;
          return (
            <Pressable
              key={a.id}
              onPress={() => { setPick(a.id); setVersionsOpen(false); }}
              style={({ pressed }) => [styles.version, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Version ${n}${a.summary ? `. ${a.summary}` : ""}`}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.versionName, active && { color: Ghost.text.primary }]}>Version {n}{n === versions.length ? " · latest" : ""}</Text>
                {a.summary && !/^Version \d+$/.test(a.summary) ? <Text style={styles.versionSummary} numberOfLines={2}>{a.summary}</Text> : null}
              </View>
              {Number.isFinite(t) ? <Text style={styles.versionTime}>{clockTime(t)}</Text> : null}
              {active ? <Check size={16} color={Ghost.accent.primary} strokeWidth={2.2} /> : null}
            </Pressable>
          );
        })}
      </GhostSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Ghost.bg.base },
  header: { flexDirection: "row", alignItems: "center", gap: Space.md, paddingHorizontal: Space.lg, paddingBottom: Space.sm },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  titleWrap: { flex: 1, alignItems: "center", minHeight: 40, justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "600", color: Ghost.text.primary, letterSpacing: -0.15 },
  versionRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  versionText: { fontSize: 12, color: Ghost.text.tertiary },
  page: {
    flex: 1,
    marginHorizontal: Space.sm,
    borderRadius: 22,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
    backgroundColor: "#0b0b10",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: Space.md },
  state: { fontSize: 14, color: Ghost.text.tertiary },
  pill: { height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: "center", backgroundColor: Ghost.glass.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: Ghost.glass.border },
  pillText: { fontSize: 13.5, color: Ghost.text.primary, fontWeight: "500" },
  problem: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: Space.xl, paddingTop: Space.md },
  problemText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: Ghost.text.secondary },
  fix: { fontSize: 14, fontWeight: "600", color: Ghost.accent.primary },
  note: { textAlign: "center", fontSize: 13, color: Ghost.text.tertiary, paddingTop: Space.sm },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Space.sm, paddingTop: Space.md, paddingHorizontal: Space.lg },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  primary: { backgroundColor: "rgba(58,46,240,0.34)", borderColor: "rgba(140,128,255,0.45)" },
  actionText: { fontSize: 14, fontWeight: "500", color: Ghost.text.primary },
  version: { flexDirection: "row", alignItems: "center", gap: Space.md, minHeight: 52, paddingVertical: Space.sm },
  versionName: { fontSize: 15.5, fontWeight: "500", color: Ghost.text.secondary },
  versionSummary: { fontSize: 13, lineHeight: 18, color: Ghost.text.tertiary },
  versionTime: { fontSize: 12.5, color: Ghost.text.tertiary, fontVariant: ["tabular-nums"] },
});
