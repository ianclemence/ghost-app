import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/text";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowRight, ChevronDown, ChevronUp, CornerDownLeft, Delete, Keyboard } from "lucide-react-native";
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
  tapToPageContained,
  typeMessages,
  type Frame,
  type Size,
  type StreamInput,
} from "@/lib/browserInput";
import { MAIN_SESSION_ID, useGhostStore } from "@/lib/store";

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
  // The connect function retries itself; it reaches itself through a ref so it
  // is never read before it is declared.
  const connectRef = useRef<() => Promise<void>>(async () => {});
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
        retryTimerRef.current = setTimeout(() => void connectRef.current(), 800);
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
      retryTimerRef.current = setTimeout(() => void connectRef.current(), 600);
    };
  }, [config, id]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

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
    const p = tapToPageContained({ x, y }, shown, frame.device);
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

  return (
    <View style={styles.root}>
      <ScreenBackground variant="calm" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        <ScreenHeader
          title="Ghost's browser"
          subtitle={state === "live" ? "You have control. Ghost is paused." : undefined}
          variant="close"
        />
        {state === "error" ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retry} onPress={() => void connect()} accessibilityRole="button" accessibilityLabel="Try the live view again">
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.stage}>
              <Pressable
                style={styles.view}
                onLayout={(e) => setShown({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                onPress={(e) => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
                accessibilityRole="image"
                accessibilityLabel="Ghost's browser, live. Tap to click where you tap."
              >
                {frame ? (
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${frame.data}` }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="contain"
                  />
                ) : (
                  <ActivityIndicator color={Ghost.text.tertiary} />
                )}
                {state === "starting" ? (
                  <View style={styles.reconnect} pointerEvents="none">
                    <ActivityIndicator color={Ghost.text.primary} />
                  </View>
                ) : null}
              </Pressable>
              <Text style={styles.hint}>
                Tap the page to click. Type below to fill the field you tapped; the keys act on it. Done returns control to Ghost.
              </Text>
            </View>

            <View style={styles.panel}>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Text to type into the page"
                  placeholderTextColor={Ghost.text.tertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={typeIt}
                  returnKeyType="send"
                  accessibilityLabel="Text to type into the page"
                />
                <Pressable
                  style={[styles.typeBtn, !draft && styles.typeBtnIdle]}
                  onPress={typeIt}
                  disabled={!draft}
                  accessibilityRole="button"
                  accessibilityLabel="Type this text into the page"
                >
                  <Keyboard size={16} color={draft ? Ghost.text.primary : Ghost.text.tertiary} strokeWidth={1.8} />
                  <Text style={[styles.typeText, !draft && styles.typeTextIdle]}>Type</Text>
                </Pressable>
              </View>
              <View style={styles.keys}>
                <KeyButton icon={CornerDownLeft} label="Enter" onPress={() => send(namedKeyMessages("Enter"))} />
                <KeyButton icon={ArrowRight} label="Tab" onPress={() => send(namedKeyMessages("Tab"))} />
                <KeyButton icon={Delete} label="Delete" onPress={() => send(namedKeyMessages("Backspace"))} />
              </View>
              <View style={styles.keys}>
                <KeyButton icon={ChevronUp} label="Scroll up" grow onPress={() => scroll(-320)} />
                <KeyButton icon={ChevronDown} label="Scroll down" grow onPress={() => scroll(320)} />
              </View>
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
      </KeyboardAvoidingView>
    </View>
  );
}

/** One labelled key in the control panel: an icon and the key's name. */
function KeyButton({
  icon: Icon,
  label,
  onPress,
  grow,
}: {
  icon: typeof CornerDownLeft;
  label: string;
  onPress: () => void;
  grow?: boolean;
}) {
  return (
    <Pressable
      style={[styles.key, grow && styles.grow]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={17} color={Ghost.text.primary} strokeWidth={1.8} />
      <Text style={styles.keyText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Ghost.bg.base },
  flex: { flex: 1 },
  // The stage is all the space above the controls, so the page is as large as
  // the phone allows; the image letterboxes inside it (contain).
  stage: { flex: 1, paddingHorizontal: Space.lg, paddingTop: Space.sm, gap: Space.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: Space.lg, paddingHorizontal: Space.xl },
  hint: { color: Ghost.text.tertiary, fontSize: 12.5, lineHeight: 17, paddingHorizontal: 2 },
  error: { color: Ghost.status.error, fontSize: 15, lineHeight: 21, textAlign: "center" },
  retry: {
    minHeight: 44,
    paddingHorizontal: Space.xl,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.glass.fillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  retryText: { color: Ghost.text.primary, fontSize: 15, fontWeight: "600" },
  view: {
    flex: 1,
    width: "100%",
    backgroundColor: Ghost.bg.sunken,
    borderRadius: Radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  reconnect: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  // Controls sit in one glass panel under the stage: type, the keys, scroll.
  panel: {
    marginTop: Space.md,
    marginHorizontal: Space.lg,
    padding: Space.md,
    gap: Space.sm,
    borderRadius: Radius.lg,
    borderCurve: "continuous",
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  inputRow: { flexDirection: "row", gap: Space.sm, alignItems: "center" },
  input: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    borderCurve: "continuous",
    backgroundColor: Ghost.bg.raised,
    color: Ghost.text.primary,
    fontFamily: Inter.regular,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  typeBtn: {
    flexDirection: "row",
    gap: 6,
    minHeight: 46,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.glass.fillStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  typeBtnIdle: { opacity: 0.5 },
  typeText: { color: Ghost.text.primary, fontSize: 14, fontWeight: "600" },
  typeTextIdle: { color: Ghost.text.tertiary },
  keys: { flexDirection: "row", gap: Space.sm },
  key: {
    flexDirection: "row",
    gap: 7,
    minHeight: 46,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.bg.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  grow: { flex: 1 },
  keyText: { color: Ghost.text.primary, fontSize: 14.5, fontWeight: "600" },
  done: {
    marginTop: Space.md,
    marginHorizontal: Space.lg,
    marginBottom: Space.lg,
    minHeight: 52,
    borderRadius: Radius.full,
    backgroundColor: Ghost.text.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  doneText: { color: Ghost.text.inverse, fontSize: 16, fontWeight: "700" },
});
