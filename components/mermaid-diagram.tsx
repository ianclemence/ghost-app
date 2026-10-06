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
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { Check, Download } from "lucide-react-native";
import { WebView } from "react-native-webview";
import { Ghost } from "@/constants/theme";
import {
  buildMermaidHtml,
  mermaidSourceFits,
} from "@/lib/mermaid";
import { writeCacheFile } from "@/lib/localFiles";

interface Props {
  source: string;
  fallback: React.ReactNode;
}

const RENDER_TIMEOUT_MS = 15000;
// Tall flowcharts must show fully: the WebView grows to the reported height
// with only a sanity ceiling, instead of clipping at one screen.
const MAX_DIAGRAM_HEIGHT = 4000;

export const MermaidDiagram = memo(function MermaidDiagram({ source, fallback }: Props) {
  const [height, setHeight] = useState(160);
  const [failed, setFailed] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webRef = useRef<WebView | null>(null);
  const svgRef = useRef<string | null>(null);
  const svgWaiters = useRef<{ resolve: (s: string) => void; reject: () => void }[]>([]);

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

  function settleSvgWaiters(svg: string | null) {
    const waiters = svgWaiters.current;
    svgWaiters.current = [];
    for (const w of waiters) {
      if (svg) w.resolve(svg);
      else w.reject();
    }
  }

  function requestSvg(): Promise<string> {
    if (svgRef.current) return Promise.resolve(svgRef.current);
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const done = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };
      svgWaiters.current.push({
        resolve: (s) => done(() => resolve(s)),
        reject: () => done(() => reject(new Error("no svg"))),
      });
      webRef.current?.injectJavaScript("window.postDiagramSvg();true;");
      setTimeout(() => done(() => reject(new Error("timeout"))), 5000);
    });
  }

  async function onDownload() {
    try {
      setNote(null);
      const Sharing = await import("expo-sharing");
      if (!(await Sharing.isAvailableAsync())) {
        setNote("Downloads aren't supported on this device.");
        return;
      }
      const svg = await requestSvg();
      const uri = await writeCacheFile("diagram.svg", svg, "utf8");
      await Sharing.shareAsync(uri, { mimeType: "image/svg+xml" });
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 1500);
    } catch {
      setNote("Couldn't download that diagram.");
    }
  }

  return (
    <View
      style={styles.wrap}
      accessibilityRole="image"
      accessibilityLabel="Diagram. The diagram source follows as text."
    >
      <View style={styles.header}>
        <Text style={styles.caption}>Diagram</Text>
        <Pressable
          onPress={onDownload}
          hitSlop={10}
          style={styles.dl}
          accessibilityRole="button"
          accessibilityLabel={downloaded ? "Downloaded" : "Download diagram"}
          accessibilityState={{ selected: downloaded }}
        >
          {downloaded ? (
            <Check size={14} color={Ghost.status.success} strokeWidth={2} />
          ) : (
            <Download size={14} color={Ghost.text.secondary} strokeWidth={1.8} />
          )}
        </Pressable>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <WebView
        ref={webRef}
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
            if (msg.type === "svg" && typeof msg.svg === "string" && msg.svg) {
              svgRef.current = msg.svg;
              disarm();
              settleSvgWaiters(msg.svg);
            } else if (msg.type === "height" && typeof msg.height === "number") {
              disarm();
              setHeight(Math.min(Math.max(msg.height + 16, 80), MAX_DIAGRAM_HEIGHT));
            } else if (msg.type === "error") {
              disarm();
              settleSvgWaiters(null);
              setFailed(true);
            }
          } catch {
            disarm();
            settleSvgWaiters(null);
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
    backgroundColor: "transparent",
    marginVertical: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  caption: {
    color: Ghost.text.tertiary,
    fontSize: 12,
    fontWeight: "600",
  },
  dl: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.glass.fill,
  },
  note: {
    color: Ghost.text.secondary,
    fontSize: 13,
    marginBottom: 4,
  },
  web: {
    backgroundColor: "transparent",
    width: "100%",
  },
});
