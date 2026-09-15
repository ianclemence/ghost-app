import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { useKeyboardPadding } from "@/hooks/use-keyboard-padding";
import { Ghost, Space } from "@/constants/theme";
import { Composer } from "@/components/composer";
import { ScreenBackground } from "@/components/screen-glow";
import { StatusDot } from "@/components/ghost";
import { PermissionCard } from "@/components/permission-card";
import { ArtifactCard } from "@/components/artifact-card";
import { LiveSurfaceCard } from "@/components/live-surface-card";
import { WaveDots } from "@/components/wave-dots";
import {
  fetchArtifacts,
  fetchCards,
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
import { parseCardMessage, type RichCard } from "@/lib/cards";
import { statusPhaseForTool } from "@/lib/statusPhase";
import { reconcileHistory } from "@/lib/reconcile";
import { MarkdownBubble } from "@/components/markdown-bubble";
import { RichCardView } from "@/components/cards";
import {
  enqueueOutbox,
  isRetryableSendError,
  loadOutbox,
  makeOutboxId,
  removeOutboxEntry,
} from "@/lib/outbox";
import { MAIN_SESSION_ID, useGhostStore, type ExtendedMessage } from "@/lib/store";
import { runLocalTurn } from "@/lib/localTurn";

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
  cards,
  onSurfaceGone,
  onCardDone,
}: {
  config: GhostConfig | null;
  surfaces: { id: string; kind: SurfaceKind }[];
  artifacts: Artifact[];
  cards: RichCard[];
  onSurfaceGone: (id: string) => void;
  onCardDone: (id: string) => void;
}) {
  if (!config || (surfaces.length === 0 && artifacts.length === 0 && cards.length === 0)) return null;
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
      {cards.map((c) => (
        <RichCardView key={c.id} card={c} config={config} onDone={onCardDone} />
      ))}
    </View>
  );
}

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, messages, setMessages, appendMessage, removeMessage, updateMessage, isStreaming, setStreaming, appendStream, commitStream, clearStreamBuffer, toolActivity, setToolActivity, ghostName, setGhostName, connectionState } = useGhostStore();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ChatOutcome | null>(null);
  const [clarify, setClarify] = useState<{ questionId: string; question: string } | null>(null);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [cancelPhase, setCancelPhase] = useState<CancelPhase>("idle");
  const [surfaces, setSurfaces] = useState<{ id: string; kind: SurfaceKind }[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [cards, setCards] = useState<RichCard[]>([]);
  const surfacesRef = useRef<{ id: string; kind: SurfaceKind }[]>([]);
  surfacesRef.current = surfaces;
  const flushingRef = useRef(false);
  const localAbort = useRef<AbortController | null>(null);

  // Flush the offline outbox FIFO: oldest queued message sends first.
  // A failed flush stops and leaves the entry queued; a non-retryable
  // failure drops the entry and surfaces the error like a normal send.
  // The runtime remains the authority on what was received — history is
  // refetched after every delivered turn.
  const flushOutbox = useCallback(async () => {
    if (!config || flushingRef.current) return;
    flushingRef.current = true;
    try {
      for (;;) {
        const pending = await loadOutbox().catch(() => []);
        if (pending.length === 0) return;
        const entry = pending[0];
        setStreaming(true);
        setToolActivity(null);
        const result = await new Promise<{ ok: boolean; auth: boolean }>((resolve) => {
          void sendMessage(config, {
            content: entry.content,
            sessionKey: entry.sessionKey,
            onChunk: (c) => appendStream(c),
            onToolStatus: (_t, label) => setToolActivity(label),
            onDone: () => resolve({ ok: true, auth: false }),
            onError: (e) => resolve({ ok: false, auth: e.kind === "auth" }),
          });
        });
        clearStreamBuffer();
        if (!result.ok) {
          if (result.auth) {
            await removeOutboxEntry(entry.id).catch(() => {});
            removeMessage(entry.messageId);
            router.replace("/auth-failure" as never);
          }
          return;
        }
        await removeOutboxEntry(entry.id).catch(() => {});
        removeMessage(entry.messageId);
        await fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
          .then(({ messages: h }) =>
            setMessages(reconcileHistory(useGhostStore.getState().messages, h)),
          )
          .catch(() => {});
      }
    } finally {
      setStreaming(false);
      setToolActivity(null);
      flushingRef.current = false;
    }
  }, [config, appendStream, clearStreamBuffer, removeMessage, setMessages, setStreaming, setToolActivity, router]);
  const listRef = useRef<FlatList>(null);
  const nearBottom = useRef(true);
  const openedRef = useRef(false);
  // Measured chrome heights so the thread pads exactly around the floating
  // header and composer. Defaults are close; onLayout corrects on mount.
  const [headerH, setHeaderH] = useState(76);
  const [dockH, setDockH] = useState(120);
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
        if (cancelled) return;
        setMessages(h);
        // Open on the latest message even if layout settles late.
        if (!openedRef.current) {
          openedRef.current = true;
          setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 60);
        }
        // Deliver anything queued while offline.
        void flushOutbox().catch(() => {});
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
    const loadCards = () => {
      fetchCards(config).then((fresh) => {
        if (cancelled) return;
        const parsed: RichCard[] = [];
        for (const c of fresh) {
          const kind = (c.kind ?? "") as RichCard["kind"];
          if (kind !== "suggestion" && kind !== "goal_update" && kind !== "cart" && kind !== "browser_view") continue;
          if (!c.id || !c.title) continue;
          parsed.push({
            id: c.id, kind, title: c.title, body: c.body, topic: c.topic,
            request_id: c.request_id, data: c.data, actions: c.actions,
          });
        }
        if (parsed.length > 0) {
          setCards((prev) => {
            const seen = new Set(prev.map((x) => x.id));
            return [...prev, ...parsed.filter((x) => !seen.has(x.id))].slice(-20);
          });
        }
      }).catch(() => {});
    };
    loadApprovals();
    loadArtifacts();
    loadCards();
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
      // A card frame carries the full payload; kind-gated by the parser.
      const card = parseCardMessage(msg, MAIN_SESSION_ID);
      if (card) {
        setCards((prev) =>
          prev.some((x) => x.id === card.id) ? prev : [...prev, card].slice(-20),
        );
      }
    });
    const t = setInterval(loadApprovals, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
      off();
    };
  }, [config, setMessages, clearStreamBuffer, setGhostName, flushOutbox]);

  const send = useCallback(async (text: string) => {
    if (!config || isStreaming) return;
    const q = text.trim();
    if (!q) return;
    setDraft("");
    setSendError(null);
    setOutcome(null);
    setClarify(null);
    setCancelPhase((p) => nextCancelState(p, "settled"));
    const tempUserId = `temp-${Date.now()}`;
    appendMessage({ id: tempUserId, role: "user", content: q, timestamp: Date.now(), status: "sending" });
    const asstId = `temp-a-${Date.now()}`;
    appendMessage({ id: asstId, role: "assistant", content: "", timestamp: Date.now(), status: "streaming" });
    // Sending always returns the eye to the bottom, even from mid-thread.
    nearBottom.current = true;
    listRef.current?.scrollToEnd({ animated: true });
    setStreaming(true);
    setToolActivity(null);
    const requestId = `m-${Date.now()}`;
    const ctrl = new AbortController();
    localAbort.current = ctrl;
    const hist = useGhostStore.getState().messages
      .filter((m) => m.id !== tempUserId && m.id !== asstId && m.content)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));
    // Execution-planned send: phone-local pipeline when the planner selects
    // it, otherwise the original Pod SSE path with full Pod semantics.
    await runLocalTurn(config, q, hist, {
      content: q,
      requestId,
      sessionKey: MAIN_SESSION_ID,
      signal: ctrl.signal,
      onChunk: (c) => appendStream(c),
      onToolStatus: (t, label) => setToolActivity(statusPhaseForTool(t) ?? label),
      onLifecycle: () => {},
      onOutcome: (_rid, o) => setOutcome(o),
      onClarify: (info) => setClarify({ questionId: info.questionId, question: info.question }),
      onDone: (full) => {
        // Commit-stream-first: the streamed text stays on screen. History
        // is reconciled underneath (matched rows keep local content, new
        // server rows append) instead of replacing the thread — so a just
        // watched message never visibly rewrites itself.
        // The runtime's terminal state still wins over any local
        // assumption, including a pending cancellation request.
        setCancelPhase((p) => nextCancelState(p, "settled"));
        localAbort.current = null;
        commitStream();
        fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
          .then(({ messages: h }) =>
            setMessages(reconcileHistory(useGhostStore.getState().messages, h)),
          )
          .catch(() => {});
        if (!full.trim() && !clarify) {
          removeMessage(asstId);
          setSendError("Ghost didn't respond. Try rephrasing.");
        }
        setStreaming(false);
        setToolActivity(null);
        fetchPendingApprovals(config).then(setApprovals).catch(() => {});
        // A successful send means connectivity is back: drain the outbox.
        void flushOutbox().catch(() => {});
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
        localAbort.current = null;
        if (e.kind === "auth") {
          router.replace("/auth-failure" as never);
          return;
        }
        if (isRetryableSendError(e.kind)) {
          // Offline, not failed: queue for FIFO delivery on reconnect.
          // The message stays visible, marked queued — never silently lost.
          enqueueOutbox({
            id: makeOutboxId(),
            messageId: tempUserId,
            content: q,
            sessionKey: MAIN_SESSION_ID,
            createdAt: Date.now(),
            attempts: 0,
          }).catch(() => {});
          updateMessage(tempUserId, { status: "queued" });
          setSendError(null);
          return;
        }
        setSendError(e.message);
      },
    }).catch((e: unknown) => {
      // runLocalTurn itself threw (e.g. no cached catalog while offline).
      localAbort.current = null;
      setCancelPhase((p) => nextCancelState(p, "settled"));
      removeMessage(asstId);
      setStreaming(false);
      setToolActivity(null);
      setSendError(e instanceof Error ? e.message : String(e));
    });
  }, [config, isStreaming, appendMessage, removeMessage, updateMessage, setStreaming, setToolActivity, appendStream, commitStream, setMessages, clarify, router, flushOutbox]);

  const stopTurn = useCallback(async () => {
    if (!config || !isStreaming) return;
    setCancelPhase((p) => nextCancelState(p, "request"));
    // Cancel whichever runtime is actually generating: the local abort
    // propagates to the native runtime; Pod turns still steer server-side.
    localAbort.current?.abort();
    localAbort.current = null;
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
          {item.status === "queued" ? (
            <Text style={styles.queuedNote} accessibilityLiveRegion="polite">
              Queued — will send when you&apos;re back online
            </Text>
          ) : null}
        </View>
      );
    }
    return (
      <View style={styles.msgBlock}>
        {!item.content.trim() ? (
          <Text style={styles.thinking} accessibilityLiveRegion="polite">{toolActivity ?? "Thinking"}</Text>
        ) : (
          <MarkdownBubble content={item.content} streaming={item.status === "streaming"} />
        )}
        {item.status === "streaming" && item.content.trim() ? <WaveDots /> : null}
      </View>
    );
  }, [toolActivity]);

  const statusLine = outcomeLine(outcome);
  const cancelLine = cancelStatusLine(cancelPhase);

  return (
    <View style={styles.container}>
      <ScreenBackground />
      {historyError ? <Text style={[styles.error, { marginTop: headerH }]}>{historyError}</Text> : null}
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
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: headerH + Space.sm, paddingBottom: dockH + Space.lg },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              <ThreadExtras
                config={config}
                surfaces={surfaces}
                artifacts={artifacts}
                cards={cards}
                onSurfaceGone={(id) => setSurfaces((prev) => prev.filter((x) => x.id !== id))}
                onCardDone={(id) => setCards((prev) => prev.filter((x) => x.id !== id))}
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
      <View style={{ marginBottom: dockH }}>
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
      </View>
      <Animated.View
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (Math.abs(h - dockH) > 2) setDockH(h);
        }}
        style={[styles.dockFloating, dockPad]}
      >
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
      <LinearGradient
        colors={["#FAFAF7", "rgba(250,250,247,0)"]}
        style={[styles.topFade, { height: headerH + 80 }]}
        pointerEvents="none"
      />
      <View
        style={[styles.headerFloating, { paddingTop: insets.top }]}
        pointerEvents="box-none"
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (Math.abs(h - headerH) > 2) setHeaderH(h);
        }}
      >
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
          <View style={styles.headerStatus}>
            <StatusDot status={connectionState === "online" ? "online" : connectionState === "syncing" ? "warning" : "offline"} />
            <Text style={styles.headerSub}>
              {connectionState === "online" ? "Online" : connectionState === "syncing" ? "Reconnecting" : "Offline"}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAF7",
  },
  headerFloating: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    zIndex: 3,
    elevation: 3,
  },
  topFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    elevation: 2,
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
  headerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
  queuedNote: {
    fontSize: 12,
    lineHeight: 16,
    color: "#7A746C",
    textAlign: "right",
    marginTop: 2,
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
  dockFloating: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Space.xl,
    paddingTop: Space.sm,
    zIndex: 3,
    elevation: 3,
  },
});
