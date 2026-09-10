import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { useKeyboardPadding } from "@/hooks/use-keyboard-padding";
import { Ghost, Space } from "@/constants/theme";
import { Composer } from "@/components/composer";
import { ScreenGlow } from "@/components/screen-glow";
import { PermissionCard } from "@/components/permission-card";
import { ArtifactCard } from "@/components/artifact-card";
import { LiveSurfaceCard } from "@/components/live-surface-card";
import { WaveDots } from "@/components/wave-dots";
import {
  fetchArtifacts,
  fetchHistory,
  fetchIdentity,
  fetchLiveSurface,
  fetchPendingApprovals,
  onWSMessage,
  sendMessage,
  sendSteering,
  voiceTranscribeUri,
  type Artifact,
  type ChatOutcome,
  type GhostConfig,
  type PendingApproval,
  type SurfaceKind,
} from "@/lib/ghostApi";
import { cancelStatusLine, nextCancelState, type CancelPhase } from "@/lib/cancel";
import { mergeArtifacts } from "@/lib/artifacts";
import { parseSurfaceAnnouncement } from "@/lib/surfaces";
import { MAIN_SESSION_ID, useGhostStore, type ExtendedMessage } from "@/lib/store";

function outcomeLine(outcome: ChatOutcome | null): string | null {
  switch (outcome) {
    case "waiting_for_user":
      return "Waiting for your reply.";
    case "waiting_for_permission":
      return "Waiting for your approval.";
    case "failed":
      return "That run failed.";
    default:
      return null;
  }
}

function ThreadExtras({
  config,
  surfaces,
  artifacts,
  onSurfaceGone,
}: {
  config: GhostConfig | null;
  surfaces: { id: string; kind: SurfaceKind }[];
  artifacts: Artifact[];
  onSurfaceGone: (id: string) => void;
}) {
  if (!config || (surfaces.length === 0 && artifacts.length === 0)) return null;
  return (
    <View style={styles.extras}>
      {surfaces.map((s) => (
        <LiveSurfaceCard
          key={s.id}
          config={config}
          kind={s.kind}
          surfaceId={s.id}
          ownDeviceId={config.deviceID}
          onGone={onSurfaceGone}
        />
      ))}
      {artifacts.map((a) => (
        <ArtifactCard key={a.id} config={config} artifact={a} />
      ))}
    </View>
  );
}

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, messages, setMessages, appendMessage, removeMessage, isStreaming, setStreaming, appendStream, commitStream, clearStreamBuffer, toolActivity, setToolActivity, ghostName, setGhostName, connectionState } = useGhostStore();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ChatOutcome | null>(null);
  const [clarify, setClarify] = useState<{ questionId: string; question: string } | null>(null);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [cancelPhase, setCancelPhase] = useState<CancelPhase>("idle");
  const [surfaces, setSurfaces] = useState<{ id: string; kind: SurfaceKind }[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const surfacesRef = useRef<{ id: string; kind: SurfaceKind }[]>([]);
  surfacesRef.current = surfaces;
  const listRef = useRef<FlatList>(null);
  const nearBottom = useRef(true);
  const dockPad = useKeyboardPadding(insets.bottom + Space.md);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    clearStreamBuffer();
    setOutcome(null);
    setClarify(null);
    fetchIdentity(config).then((id) => {
      if (!cancelled && id?.name) setGhostName(id.name);
    }).catch(() => {});
    fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
      .then(({ messages: h }) => {
        if (!cancelled) setMessages(h);
      })
      .catch(() => {
        if (!cancelled) setHistoryError("Couldn't load history.");
      });
    const loadApprovals = () => {
      fetchPendingApprovals(config).then((r) => {
        if (!cancelled) setApprovals(r);
      }).catch(() => {});
    };
    const loadArtifacts = () => {
      fetchArtifacts(config, MAIN_SESSION_ID).then((fresh) => {
        if (!cancelled) setArtifacts((prev) => mergeArtifacts(prev, fresh));
      }).catch(() => {});
    };
    loadApprovals();
    loadArtifacts();
    const off = onWSMessage((msg) => {
      const t = typeof msg.type === "string" ? msg.type : (msg.metadata as Record<string, unknown> | undefined)?.type;
      if (t === "clarify_request" && typeof msg.content === "string" && msg.content) {
        const meta = (msg.metadata ?? {}) as Record<string, unknown>;
        const qid = typeof meta.question_id === "string" ? meta.question_id : typeof msg.id === "string" ? msg.id : "";
        if (qid) setClarify({ questionId: qid, question: msg.content });
      }
      // A surface announcement carries identity only; confirm it exists
      // before rendering so forged or stale ids never become UI.
      const announced = parseSurfaceAnnouncement(msg, MAIN_SESSION_ID);
      if (announced) {
        const { surfaceId, kind } = announced;
        fetchLiveSurface(config, kind, surfaceId).then((s) => {
          if (cancelled || !s) return;
          setSurfaces((prev) =>
            prev.some((x) => x.id === surfaceId) ? prev : [...prev, { id: surfaceId, kind }],
          );
        }).catch(() => {});
      }
    });
    const t = setInterval(loadApprovals, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
      off();
    };
  }, [config, setMessages, clearStreamBuffer, setGhostName]);

  const send = useCallback(async (text: string) => {
    if (!config || isStreaming) return;
    const q = text.trim();
    if (!q) return;
    setDraft("");
    setSendError(null);
    setOutcome(null);
    setClarify(null);
    setCancelPhase((p) => nextCancelState(p, "settled"));
    appendMessage({ id: `temp-${Date.now()}`, role: "user", content: q, timestamp: Date.now(), status: "sending" });
    const asstId = `temp-a-${Date.now()}`;
    appendMessage({ id: asstId, role: "assistant", content: "", timestamp: Date.now(), status: "streaming" });
    setStreaming(true);
    setToolActivity(null);
    const requestId = `m-${Date.now()}`;
    await sendMessage(config, {
      content: q,
      requestId,
      sessionKey: MAIN_SESSION_ID,
      onChunk: (c) => appendStream(c),
      onToolStatus: (_t, label) => setToolActivity(label),
      onLifecycle: () => {},
      onOutcome: (_rid, o) => setOutcome(o),
      onClarify: (info) => setClarify({ questionId: info.questionId, question: info.question }),
      onDone: (full) => {
        // The runtime's terminal state wins over any local assumption,
        // including a pending cancellation request.
        setCancelPhase((p) => nextCancelState(p, "settled"));
        fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
          .then(({ messages: h }) => setMessages(h))
          .catch(() => commitStream());
        if (!full.trim() && !clarify) {
          removeMessage(asstId);
          setSendError("Ghost didn't respond. Try rephrasing.");
        }
        setStreaming(false);
        setToolActivity(null);
        fetchPendingApprovals(config).then(setApprovals).catch(() => {});
        fetchArtifacts(config, MAIN_SESSION_ID)
          .then((fresh) => setArtifacts((prev) => mergeArtifacts(prev, fresh)))
          .catch(() => {});
        // Reconcile tracked surfaces with runtime truth: refresh each,
        // drop the ones the runtime no longer knows.
        surfacesRef.current.forEach((s) => {
          fetchLiveSurface(config, s.kind, s.id).then((live) => {
            if (!live) setSurfaces((cur) => cur.filter((x) => x.id !== s.id));
          }).catch(() => {});
        });
      },
      onError: (e) => {
        setCancelPhase((p) => nextCancelState(p, "settled"));
        removeMessage(asstId);
        setStreaming(false);
        setToolActivity(null);
        if (e.kind === "auth") router.replace("/auth-failure" as never);
        else setSendError(e.message);
      },
    });
  }, [config, isStreaming, appendMessage, removeMessage, setStreaming, setToolActivity, appendStream, commitStream, setMessages, clarify, router]);

  const stopTurn = useCallback(async () => {
    if (!config || !isStreaming) return;
    setCancelPhase((p) => nextCancelState(p, "request"));
    // The stream UI stays exactly as it is: nothing is committed, hidden,
    // or marked stopped until the runtime answers or terminates the turn.
    const sent = await sendSteering(config, { sessionKey: MAIN_SESSION_ID, action: "abort" });
    setCancelPhase((p) => nextCancelState(p, sent ? "sent" : "failed"));
  }, [config, isStreaming]);

  const renderItem = useCallback(({ item }: { item: ExtendedMessage }) => {
    if (item.role === "user") {
      return (
        <View style={styles.msgBlock}>
          <Text style={styles.userText}>{item.content}</Text>
        </View>
      );
    }
    return (
      <View style={styles.msgBlock}>
        {!item.content.trim() ? (
          <Text style={styles.thinking} accessibilityLiveRegion="polite">{toolActivity ?? "Thinking"}</Text>
        ) : (
          <>
            <Text style={styles.ghostText} selectable>{item.content}</Text>
            {item.status === "streaming" ? <WaveDots /> : null}
          </>
        )}
      </View>
    );
  }, [toolActivity]);

  const statusLine = outcomeLine(outcome);
  const cancelLine = cancelStatusLine(cancelPhase);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <View style={styles.chevUp} />
          <View style={styles.chevDown} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1} accessibilityRole="header">{ghostName ?? "Ghost"}</Text>
          <Text style={styles.headerSub}>
            {connectionState === "online" ? "Online" : connectionState === "syncing" ? "Reconnecting" : "Offline"}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>
      {historyError ? <Text style={styles.error}>{historyError}</Text> : null}
      {messages.length === 0 ? (
        <>
          <View style={{ flex: 1 }} />
          <View style={styles.emptyCenter}>
            <Text style={styles.emptyHello}>
              <Text style={styles.emptyInk}>Talk to Ghost. </Text>
              <Text style={styles.emptyMuted}>Say anything to begin.</Text>
            </Text>
          </View>
        </>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <ThreadExtras
              config={config}
              surfaces={surfaces}
              artifacts={artifacts}
              onSurfaceGone={(id) => setSurfaces((prev) => prev.filter((x) => x.id !== id))}
            />
          }
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            nearBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
          }}
          onContentSizeChange={() => {
            if (nearBottom.current) listRef.current?.scrollToEnd({ animated: true });
          }}
        />
      )}
      {config && approvals.slice(0, 2).map((a) => (
        <View key={a.id} style={styles.approvalWrap}>
          <PermissionCard
            item={a}
            config={config}
            onResolved={() => {
              if (config) fetchPendingApprovals(config).then(setApprovals).catch(() => {});
            }}
          />
        </View>
      ))}
      {clarify ? <Text style={styles.status} accessibilityLiveRegion="polite">{clarify.question}</Text> : null}
      {cancelLine ? <Text style={styles.status} accessibilityLiveRegion="polite">{cancelLine}</Text> : null}
      {statusLine && !clarify && !cancelLine ? <Text style={styles.status} accessibilityLiveRegion="polite">{statusLine}</Text> : null}
      {sendError ? <Text style={styles.error} accessibilityLiveRegion="polite">{sendError}</Text> : null}
      <Animated.View style={[styles.dock, dockPad]}>
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSubmit={send}
          minimal
          onTranscribeAudio={(uri) => (config ? voiceTranscribeUri(config, uri, MAIN_SESSION_ID) : Promise.resolve(""))}
          onVoiceError={(m) => setSendError(m)}
          streaming={isStreaming}
          onStop={() => void stopTurn()}
        />
      </Animated.View>
      <ScreenGlow />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAF7",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backPressed: {
    opacity: 0.5,
  },
  chevUp: {
    position: "absolute",
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#1A1611",
    transform: [{ rotate: "-45deg" }, { translateY: -4 }],
  },
  chevDown: {
    position: "absolute",
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#1A1611",
    transform: [{ rotate: "45deg" }, { translateY: 4 }],
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1A1611",
  },
  headerSub: {
    fontSize: 12,
    color: Ghost.text.tertiary,
  },
  headerRight: {
    width: 44,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 28,
    paddingTop: Space.xl,
    paddingBottom: Space.xl,
    gap: Space.lg,
    flexGrow: 1,
  },
  emptyCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 44,
  },
  emptyHello: {
    fontSize: 21,
    lineHeight: 30,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  emptyMuted: {
    color: "#7A746C",
  },
  emptyInk: {
    color: "#1A1611",
    fontWeight: "700",
  },
  msgBlock: {
    paddingVertical: 6,
  },
  userText: {
    fontSize: 17,
    lineHeight: 25,
    color: "#1A1611",
    fontWeight: "600",
    textAlign: "right",
  },
  ghostText: {
    fontSize: 17,
    lineHeight: 26,
    color: "#1A1611",
  },
  thinking: {
    fontSize: 15,
    color: Ghost.text.tertiary,
  },
  approvalWrap: {
    paddingHorizontal: 28,
  },
  extras: {
    paddingVertical: Space.xs,
  },
  status: {
    textAlign: "center",
    fontSize: 13,
    color: "#6B6560",
    paddingHorizontal: 28,
    marginBottom: 4,
  },
  error: {
    textAlign: "center",
    fontSize: 13,
    color: "#C24B3C",
    paddingHorizontal: 28,
    marginBottom: 8,
  },
  dock: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.sm,
  },
});
