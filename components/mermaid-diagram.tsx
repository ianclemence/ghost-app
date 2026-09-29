/**
 * Mermaid diagram renderer (WebView + pinned Mermaid runtime).
 *
 * Security posture (model source is untrusted):
 * - Mermaid runs with securityLevel "strict" and htmlLabels off: labels
 *   cannot inject HTML, script, or links.
 * - The WebView cannot navigate anywhere: every load request is denied,
 *   file access and DOM storage are off, and the document is inline HTML
 *   (no remote page).
 * - Oversized sources never reach the renderer (MERMAID_MAX_SOURCE_CHARS).
 * - Any failure — CDN unreachable, parse error, timeout — falls back to
 *   a readable code block. The diagram is never the only channel: the
 *   source stays accessible to screen readers via the fallback label.
 */
import React, { memo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ghost } from "@/constants/theme";
import {
  buildMermaidHtml,
  mermaidSourceFits,
} from "@/lib/mermaid";

interface Props {
  source: string;
  fallback: React.ReactNode;
}

const RENDER_TIMEOUT_MS = 15000;

export const MermaidDiagram = memo(function MermaidDiagram({ source, fallback }: Props) {
  const [height, setHeight] = useState(160);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!mermaidSourceFits(source)) return <>{fallback}</>;
  if (failed) return <>{fallback}</>;

  function armTimeout() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFailed(true), RENDER_TIMEOUT_MS);
  }

  function disarm() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  return (
    <View
      style={styles.wrap}
      accessibilityRole="image"
      accessibilityLabel="Diagram. The diagram source follows as text."
    >
      <Text style={styles.caption}>Diagram</Text>
      <WebView
        source={{ html: buildMermaidHtml(source), baseUrl: "" }}
        style={[styles.web, { height }]}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        mediaPlaybackRequiresUserAction
        onShouldStartLoadWithRequest={() => false}
        onLoadStart={armTimeout}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === "height" && typeof msg.height === "number") {
              disarm();
              setHeight(Math.min(Math.max(msg.height + 16, 80), 560));
            } else if (msg.type === "error") {
              disarm();
              setFailed(true);
            }
          } catch {
            disarm();
            setFailed(true);
          }
        }}
        onError={() => {
          disarm();
          setFailed(true);
        }}
        onHttpError={() => {
          disarm();
          setFailed(true);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: 8,
    marginVertical: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
  },
  caption: {
    color: Ghost.text.tertiary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  web: {
    backgroundColor: "transparent",
    width: "100%",
  },
});
