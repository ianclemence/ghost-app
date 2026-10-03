import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/text";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ghost, Inter, Radius, Space } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import {
  mintBrowserScreencast,
  releaseSurfaceControl,
  requestSurfaceTakeover,
  resumeSurfaceGhost,
  sendMessage,
  wsURL,
} from "@/lib/ghostApi";
import {
  clickMessages,
  namedKeyMessages,
  parseFrame,
  screencastSocketURL,
  scrollMessage,
  tapToPage,
  typeMessages,
  type Frame,
  type Size,
  type StreamInput,
} from "@/lib/browserInput";
import { MAIN_SESSION_ID, useGhostStore } from "@/lib/store";
import { EdgeScrollView } from "@/components/scroll-edge";

/**
 * Steer Ghost's browser. For the steps only a person can do: a "Verify you are
 * human" box, a CAPTCHA, a code sent to your phone. Ghost pauses while you hold
 * the browser, you tap and type on the live picture, and Done hands it back and
 * tells Ghost to carry on. Ghost never tries to get past such a check itself.
 */
export default function BrowserScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const config = useGhostStore((s) => s.config);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [shown, setShown] = useState<Size>({ width: 0, height: 0 });
  const [state, setState] = useState<"starting" | "live" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [finishing, setFinishing] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const heldRef = useRef(false);
  // aliveRef: the screen is mounted and we still want the live view.
  // finishingRef: the owner pressed Done; do not reconnect.
  const aliveRef = useRef(true);
  const finishingRef = useRef(false);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback((msgs: StreamInput[]) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const m of msgs) ws.send(JSON.stringify(m));
  }, []);

  // Take control (Ghost pauses), mint a fresh single-use ticket, and open the
  // live view. Called on mount, whenever the phone returns to the foreground
  // (the OS closes the socket while the app is away), and after a drop, so the
  // view reattaches instead of sitting disconnected on the last frame.
  const connect = useCallback(async () => {
    if (!config || !id) return;
    // Keep the last frame on screen while re-attaching; only the very first
    // attempt shows the spinner.
    setState((s) => (s === "live" ? s : "starting"));
    setError(null);
    const taken = await requestSurfaceTakeover(config, "browser", id);
    if (!aliveRef.current || finishingRef.current) return;
    if (!taken.ok) {
      setError(taken.error ?? "You can't take over this browser right now.");
      setState("error");
      return;
    }
    heldRef.current = true;
    const ticket = await mintBrowserScreencast(config, id);
    if (!aliveRef.current || finishingRef.current) return;
    if (!ticket.ok) {
      retryRef.current += 1;
      if (retryRef.current >= 3) {
        setError(ticket.error);
        setState("error");
      } else {
        retryTimerRef.current = setTimeout(() => void connect(), 800);
      }
      return;
    }
    const ws = new WebSocket(screencastSocketURL(wsURL(config), ticket.wsPath));
    socketRef.current?.close();
    socketRef.current = ws;
    ws.onopen = () => {
      if (!aliveRef.current) return;
      retryRef.current = 0;
      setState("live");
    };
    ws.onmessage = (e) => {
      const f = typeof e.data === "string" ? parseFrame(e.data) : null;
      if (!f) return;
      setFrame(f);
      // One frame at a time: say this one is drawn.
      ws.send(JSON.stringify({ type: "ack", seq: f.seq }));
    };
    ws.onerror = () => {
      // A close follows; onclose decides whether to reattach.
    };
    ws.onclose = () => {
      if (socketRef.current !== ws) return;
      socketRef.current = null;
      if (!aliveRef.current || finishingRef.current) return;
      retryTimerRef.current = setTimeout(() => void connect(), 600);
    };
  }, [config, id]);

  // Reattach when the app comes back, and drop the socket when it leaves so we
  // never act on a half-dead one.
  useEffect(() => {
    aliveRef.current = true;
    void connect();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        const ws = socketRef.current;
        if (aliveRef.current && !finishingRef.current && (!ws || ws.readyState !== WebSocket.OPEN)) {
          void connect();
        }
      } else {
        socketRef.current?.close();
        socketRef.current = null;
      }
    });
    return () => {
      aliveRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      sub.remove();
      socketRef.current?.close();
      socketRef.current = null;
      // Leaving without pressing Done still gives the browser back.
      if (heldRef.current && config && id) {
        heldRef.current = false;
        void releaseSurfaceControl(config, "browser", id).then(() => resumeSurfaceGhost(config, "browser", id));
      }
    };
  }, [config, id, connect]);

  const onTap = (x: number, y: number) => {
    if (!frame) return;
    const p = tapToPage({ x, y }, shown, frame.device);
    Haptics.selectionAsync().catch(() => {});
    send(clickMessages(p.x, p.y));
  };

  const scroll = (dy: number) => {
    if (!frame) return;
    send([scrollMessage(Math.round(frame.device.width / 2), Math.round(frame.device.height / 2), dy)]);
  };

  const typeIt = () => {
    if (!draft) return;
    send(typeMessages(draft));
    setDraft("");
  };

  const done = async () => {
    if (!config || !id) return;
    setFinishing(true);
    finishingRef.current = true;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    heldRef.current = false;
    socketRef.current?.close();
    socketRef.current = null;
    await releaseSurfaceControl(config, "browser", id);
    await resumeSurfaceGhost(config, "browser", id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Tell Ghost it has the browser back. Its answer joins the conversation.
    void sendMessage(config, {
      content: "I've finished that step in the browser. Please carry on.",
      requestId: `m-${Date.now()}`,
      sessionKey: MAIN_SESSION_ID,
      onChunk: () => {},
      onDone: () => {},
      onError: () => {},
    }).catch(() => {});
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const ratio = frame ? frame.device.width / frame.device.height : 16 / 9;

  return (
    <View style={styles.root}>
      <ScreenBackground variant="calm" />
      <ScreenHeader
        title="Ghost's browser"
        subtitle={state === "live" ? "You have control. Ghost is paused." : undefined}
        variant="close"
      />
      <EdgeScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {state === "starting" ? (
          <View style={styles.center}>
            <ActivityIndicator color={Ghost.text.tertiary} />
            <Text style={styles.hint}>Taking over…</Text>
          </View>
        ) : state === "error" ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>
              Do the step yourself: tap the page to click, type below, then tap Done. Ghost carries on from where you leave it.
            </Text>
            <Pressable
              style={[styles.view, { aspectRatio: ratio }]}
              onLayout={(e) => setShown({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
              onPress={(e) => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
              accessibilityRole="image"
              accessibilityLabel="Ghost's browser. Tap to click."
            >
              {frame ? (
                <Image source={{ uri: `data:image/jpeg;base64,${frame.data}` }} style={StyleSheet.absoluteFill} resizeMode="stretch" />
              ) : (
                <ActivityIndicator color={Ghost.text.tertiary} />
              )}
            </Pressable>

            <View style={styles.row}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Type into the page"
                placeholderTextColor={Ghost.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={typeIt}
                returnKeyType="send"
                accessibilityLabel="Text to type into the page"
              />
              <Pressable style={styles.chip} onPress={typeIt} accessibilityRole="button" accessibilityLabel="Type it">
                <Text style={styles.chipText}>Type</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              {(["Enter", "Tab", "Backspace"] as const).map((k) => (
                <Pressable key={k} style={styles.chip} onPress={() => send(namedKeyMessages(k))} accessibilityRole="button">
                  <Text style={styles.chipText}>{k}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.chip} onPress={() => scroll(-320)} accessibilityRole="button" accessibilityLabel="Scroll up">
                <Text style={styles.chipText}>Up</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => scroll(320)} accessibilityRole="button" accessibilityLabel="Scroll down">
                <Text style={styles.chipText}>Down</Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.done, finishing && { opacity: 0.6 }]}
              onPress={() => void done()}
              disabled={finishing}
              accessibilityRole="button"
              accessibilityLabel="Done. Hand the browser back to Ghost."
            >
              <Text style={styles.doneText}>{finishing ? "Handing back…" : "Done, hand back to Ghost"}</Text>
            </Pressable>
          </>
        )}
      </EdgeScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Ghost.bg.base },
  body: { paddingHorizontal: Space.lg, paddingBottom: Space.huge, gap: Space.md },
  center: { alignItems: "center", gap: Space.md, marginTop: Space.xxxl },
  hint: { color: Ghost.text.secondary, fontSize: 14, lineHeight: 20 },
  error: { color: Ghost.status.error, fontSize: 15, lineHeight: 21, textAlign: "center" },
  view: {
    width: "100%",
    backgroundColor: Ghost.bg.sunken,
    borderRadius: Radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: Space.sm, alignItems: "center" },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: Space.md,
    borderRadius: Radius.xxl,
    borderCurve: "continuous",
    backgroundColor: Ghost.glass.fill,
    color: Ghost.text.primary,
    fontFamily: Inter.regular,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    backgroundColor: Ghost.bg.raised,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  chipText: { color: Ghost.text.primary, fontSize: 14, fontWeight: "600" },
  done: {
    marginTop: Space.md,
    minHeight: 50,
    borderRadius: Radius.full,
    backgroundColor: Ghost.text.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { color: Ghost.text.inverse, fontSize: 16, fontWeight: "700" },
});
