/**
 * The sandbox a canvas runs in (WebView + the document from lib/canvas.ts).
 *
 * The page is model output and untrusted, so it is held to a small box:
 * every navigation is refused, there is no file access, no storage, no cookies
 * (incognito), no popups, and the network is closed by the page's own policy.
 * It can tell the app only its height, that it loaded, an error it threw, and
 * what it asks to keep (ghost.save, JSON within a limit); each is checked
 * before use, and what it kept is handed back as ghost.saved when it loads. Anything that goes wrong shows as a calm state
 * with a way to try again, never as a blank box.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { RotateCw } from "lucide-react-native";
import { Text } from "@/components/text";
import { Ghost, Space } from "@/constants/theme";
import { buildCanvasDocument, inlineHeight, parseCanvasMessage } from "@/lib/canvas";

/** The page's own background, so the box never flashes another colour before it paints. */
export const CANVAS_BG = "#0b0b10";
const SLOW_MS = 12_000;

export const CanvasView = memo(function CanvasView({
  html,
  mode,
  reloadKey = 0,
  onError,
  onReady,
  onHeight,
  onSurface,
  onReload,
  saved,
  onSave,
}: {
  html: string;
  /** What the page kept with ghost.save (JSON text), given back to it as ghost.saved. */
  saved?: string | null;
  onSave?: (json: string) => void;
  /** "inline" sits in the chat at the page's own height; "full" fills its parent and scrolls. */
  mode: "inline" | "full";
  /** Changing it starts the page over. */
  reloadKey?: number;
  onError?: (message: string) => void;
  onReady?: () => void;
  onHeight?: (px: number) => void;
  /** Inline only: the colour the page paints its ground, and whether it is dark. */
  onSurface?: (s: { dark: boolean; color?: string }) => void;
  onReload?: () => void;
}) {
  // What the page saved is handed over as it loads: a save it makes itself
  // must not start it over, but a reload (or another version) starts from the
  // newest save.
  const [kept, setKept] = useState({ saved: saved ?? null, at: reloadKey, html });
  if (kept.at !== reloadKey || kept.html !== html) setKept({ saved: saved ?? null, at: reloadKey, html });
  const doc = React.useMemo(() => buildCanvasDocument(html, { inline: mode === "inline", saved: kept.saved }), [html, mode, kept.saved]);
  const [height, setHeight] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    setReady(false);
    setSlow(false);
    setFailed(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSlow(true), SLOW_MS);
  }, []);
  useEffect(() => {
    start();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [start, reloadKey, html]);

  const settle = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setReady(true);
    setSlow(false);
  }, []);

  if (!doc) {
    return (
      <View style={[styles.box, styles.center, mode === "inline" && { height: 120 }]}>
        <Text style={styles.note}>This page is too large to run here.</Text>
      </View>
    );
  }

  const boxStyle = mode === "inline" ? { height: inlineHeight(height) } : styles.fill;
  return (
    <View style={[styles.box, boxStyle]}>
      <WebView
        key={`${reloadKey}`}
        source={{ html: doc, baseUrl: "" }}
        style={styles.web}
        containerStyle={styles.web}
        backgroundColor={CANVAS_BG}
        scrollEnabled={mode === "full"}
        nestedScrollEnabled
        javaScriptEnabled
        domStorageEnabled={false}
        incognito
        cacheEnabled={false}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // A canvas never navigates: the first load is the document itself.
        onShouldStartLoadWithRequest={() => false}
        onLoadStart={start}
        onMessage={(e) => {
          const m = parseCanvasMessage(e.nativeEvent.data);
          if (!m) return;
          if (m.type === "save") {
            onSave?.(m.value);
          } else if (m.type === "height") {
            setHeight(m.value);
            onHeight?.(m.value);
            settle();
          } else if (m.type === "surface") {
            onSurface?.({ dark: m.dark, color: m.color });
          } else if (m.type === "ready") {
            settle();
            onReady?.();
          } else if (m.type === "error") {
            onError?.(m.message);
          }
        }}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        onRenderProcessGone={() => setFailed(true)}
        onContentProcessDidTerminate={() => setFailed(true)}
      />
      {!ready && !failed ? (
        <View style={[styles.overlay, styles.center]} pointerEvents="none">
          <ActivityIndicator size="small" color={Ghost.text.secondary} />
          {slow ? <Text style={styles.note}>Still loading…</Text> : null}
        </View>
      ) : null}
      {failed ? (
        <View style={[styles.overlay, styles.center]}>
          <Text style={styles.note}>This page didn&apos;t load.</Text>
          {onReload ? (
            <Pressable onPress={onReload} style={styles.retry} accessibilityRole="button" accessibilityLabel="Reload the page">
              <RotateCw size={14} color={Ghost.text.primary} strokeWidth={2} />
              <Text style={styles.retryText}>Reload</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { backgroundColor: CANVAS_BG, overflow: "hidden" },
  fill: { flex: 1 },
  web: { flex: 1, backgroundColor: CANVAS_BG },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: CANVAS_BG, gap: Space.sm },
  center: { alignItems: "center", justifyContent: "center" },
  note: { fontSize: 13.5, color: Ghost.text.tertiary },
  retry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  retryText: { fontSize: 13.5, color: Ghost.text.primary, fontWeight: "500" },
});
