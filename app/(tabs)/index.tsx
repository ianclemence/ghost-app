import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, FadeInDown, FadeOut, useReducedMotion } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { ArrowDown, ArrowUpRight } from "lucide-react-native";
import {
  attachmentProblem,
  base64Bytes,
  photoName,
  type Attachment,
} from "@/lib/attachments";
import { readBase64 } from "@/lib/localFiles";
import { useKeyboardPadding } from "@/hooks/use-keyboard-padding";
import { Ghost, Radius, shadowRGB, Space, Fonts, Type } from "@/constants/theme";
import { Composer } from "@/components/composer";
import { AttachmentStrip } from "@/components/attachment-strip";
import { SentAttachments } from "@/components/sent-attachments";
import { composerPlaceholder } from "@/lib/placeholder";
import { shouldAskForSuggestion } from "@/lib/suggestion";
import { ScreenBackground } from "@/components/screen-glow";
import { PresenceHeader } from "@/components/presence-header";
import { DaySeparator, GhostMessage, UserMessage } from "@/components/thread";
import { PermissionCard } from "@/components/permission-card";
import { ArtifactCard } from "@/components/artifact-card";
import { LiveSurfaceCard } from "@/components/live-surface-card";
import {
  fetchArtifacts,
  fetchCards,
  fetchHistory,
  fetchIdentity,
  fetchLiveSurface,
  fetchLiveSurfaces,
  fetchPendingApprovals,
  fetchSuggestion,
  fetchRoutines,
  onWSMessage,
  phaseLabel,
  sendMessage,
  sendSteering,
  voiceTranscribeUri,
  type Artifact,
  type ChatOutcome,
  type GhostConfig,
  type PendingApproval,
  type ServedBy,
  type SurfaceKind,
} from "@/lib/ghostApi";
import { cancelStatusLine, nextCancelState, type CancelPhase } from "@/lib/cancel";
import { dispatchMode } from "@/lib/dispatch";
import { applyLiveEffect, applySay, liveEffect, sayEffect } from "@/lib/liveTurn";
import { mergeArtifacts } from "@/lib/artifacts";
import { parseSurfaceAnnouncement } from "@/lib/surfaces";
import { normalizeCard, parseCardMessage, type RichCard } from "@/lib/cards";
import { displayStatusForTool } from "@/lib/statusPhase";
import { reconcileHistory } from "@/lib/reconcile";
import { applyBackgroundEvent, formatBackgroundElapsed, type BackgroundRunningTask } from "@/lib/background";
import { buildThread, type ThreadItem } from "@/lib/thread";
import { presence } from "@/lib/presence";
import { RichCardView } from "@/components/cards";
import {
  enqueueOutbox,
  isRetryableSendError,
  loadOutbox,
  makeOutboxId,
  removeOutboxEntry,
} from "@/lib/outbox";
import { MAIN_SESSION_ID, useGhostStore } from "@/lib/store";
import { loadLocalThread, saveLocalThread } from "@/lib/threadCache";
import { conversationStarters } from "@/lib/starters";

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

// Live things that belong at the end of the conversation right now: shared
// browser/computer surfaces. (Artifacts and cards are placed in the thread
// where they were made.)
function ThreadExtras({
  config,
  surfaces,
  onSurfaceGone,
}: {
  config: GhostConfig | null;
  surfaces: { id: string; kind: SurfaceKind }[];
  onSurfaceGone: (id: string) => void;
}) {
  if (!config || surfaces.length === 0) return null;
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
    </View>
  );
}

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ownRequestRef = useRef<string | null>(null);
  const reduceMotion = useReducedMotion();
  const { config, messages, setMessages, appendMessage, removeMessage, updateMessage, isStreaming, setStreaming, appendStream, commitStream, clearStreamBuffer, toolActivity, setToolActivity, ghostName, setGhostName, connectionState } = useGhostStore();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // Whether the Pod has told us what the conversation holds. Until it has, an
  // empty list means "not known yet", not "nothing said".
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [outcome, setOutcome] = useState<ChatOutcome | null>(null);
  const [clarify, setClarify] = useState<{ questionId: string; question: string } | null>(null);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  // Paging back through the one long conversation.
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const serverCountRef = useRef(0);
  // How many things Ghost is keeping for the owner (active watches and
  // routines), for the presence line.
  const [keeping, setKeeping] = useState(0);
  // Chrome that reacts to the thread: header hairline once scrolled, a
  // jump-to-latest pill (with a count of what arrived) when reading back.
  const [scrolled, setScrolled] = useState(false);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const [unseen, setUnseen] = useState(0);
  // Photos and files ride along with the next message. The Pod detects each
  // one's real type and opens it with the right tool.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Messages present at first paint don't animate in; new ones do.
  const initialKeysRef = useRef<Set<string> | null>(null);
  const [cancelPhase, setCancelPhase] = useState<CancelPhase>("idle");
  const [surfaces, setSurfaces] = useState<{ id: string; kind: SurfaceKind }[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [cards, setCards] = useState<RichCard[]>([]);
  // Detached background tasks for this conversation: running rows tick in
  // the dock; completions append as assistant messages. Driven by daemon
  // background_started/background_done events, never by polling.
  const [bgRunning, setBgRunning] = useState<BackgroundRunningTask[]>([]);
  const [bgNow, setBgNow] = useState(0);
  const bgRunningRef = useRef<BackgroundRunningTask[]>([]);
  bgRunningRef.current = bgRunning;
  // Elapsed ticker: self-sustaining only while work is in flight.
  useEffect(() => {
    if (bgRunning.length === 0) return;
    const t = setInterval(() => setBgNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [bgRunning.length]);
  const surfacesRef = useRef<{ id: string; kind: SurfaceKind }[]>([]);
  surfacesRef.current = surfaces;
  const flushingRef = useRef(false);
  const localAbort = useRef<AbortController | null>(null);
  // Where the in-flight turn ran, as the Pod's runtime states it (the
  // served_by frame), stamped onto the reply when it completes.
  const servedRef = useRef<ServedBy | null>(null);

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
        // Once the Pod has started answering it has the message. A stream that
        // drops after that (a long browser task, the app in the background) is
        // not a failed send: keeping the entry would leave "Waiting to send"
        // on a message Ghost already acted on, and send it a second time.
        let accepted = false;
        const result = await new Promise<{ ok: boolean; auth: boolean }>((resolve) => {
          void sendMessage(config, {
            content: entry.content,
            sessionKey: entry.sessionKey,
            onChunk: (c) => { accepted = true; appendStream(c); },
            onToolStatus: (t, label) => { accepted = true; setToolActivity(displayStatusForTool(t, label)); },
            onDone: () => resolve({ ok: true, auth: false }),
            onError: (e) => resolve({ ok: accepted && e.kind !== "auth", auth: e.kind === "auth" }),
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
  // Whether the list should follow new content (a reply as it streams in).
  // Only the owner's own finger changes it: a scroll event the list raises by
  // growing is not the owner leaving the bottom.
  const nearBottom = useRef(true);
  const dragging = useRef(false);
  const openedRef = useRef(false);
  // For a moment after the conversation opens (or comes back into view) rows
  // are still measuring themselves, so each growth of the list would leave the
  // newest message just off-screen. Until the owner touches the list, stay on
  // the last message without animation, and don't treat the top as "load more".
  const settleUntil = useRef(0);
  const [settling, setSettling] = useState(true);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useCallback(() => {
    settleUntil.current = Date.now() + 1800;
    nearBottom.current = true;
    setSettling(true);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setSettling(false), 1900);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
  }, []);
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
  // The browser/computer cards are announced over the live connection, so one
  // that began while the app was away (or whose announcement was missed) was
  // never added, and a card the app lost on coming back stayed lost. Ask the
  // Pod what is running now, on opening, on returning to the conversation and on
  // coming back to the app.
  const refreshSurfaces = useCallback(() => {
    if (!config) return;
    fetchLiveSurfaces(config).then((list) => {
      const running = list.filter((s) => s.state !== "completed" && s.state !== "expired" && s.state !== "failed");
      setSurfaces((prev) => {
        const known = new Set(prev.map((x) => x.id));
        const add = running.filter((s) => !known.has(s.id)).map((s) => ({ id: s.id, kind: s.kind }));
        return add.length ? [...prev, ...add] : prev;
      });
    }).catch(() => {});
  }, [config]);
  useFocusEffect(useCallback(() => { settle(); refreshSurfaces(); }, [settle, refreshSurfaces]));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") refreshSurfaces(); });
    return () => sub.remove();
  }, [refreshSurfaces]);
  const dockPad = useKeyboardPadding(insets.bottom + Space.md);

  // First paint from the on-device copy of the thread, so the conversation
  // opens instantly and stays readable when the Pod is unreachable. Pod
  // history replaces it as soon as it arrives (it stays authoritative).
  useEffect(() => {
    let cancelled = false;
    loadLocalThread().then((cached) => {
      if (cancelled || cached.length === 0) return;
      const cur = useGhostStore.getState().messages;
      // Messages waiting in the outbox are already in the list; they are not
      // the conversation, so they must not keep the saved copy from showing.
      const real = cur.filter((m) => m.status !== "queued" && !String(m.id).startsWith("temp-"));
      if (real.length === 0) {
        setMessages([
          ...cached.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: m.timestamp,
          })),
          ...cur,
        ]);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [setMessages]);

  // Persist the visible thread for offline durability (capped, best-effort).
  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => {
      void saveLocalThread(
        messages.filter((m) => m.content && m.status !== "streaming").map((m) => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
      ).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [messages]);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    let historyTimer: ReturnType<typeof setTimeout> | null = null;
    clearStreamBuffer();
    setOutcome(null);
    setClarify(null);
    fetchIdentity(config).then((id) => {
      if (!cancelled && id?.name) setGhostName(id.name);
    }).catch(() => {});
    fetchRoutines(config).then((r) => {
      if (!cancelled) setKeeping(r.filter((x) => x.state === "active").length);
    }).catch(() => {});
    const loadHistory = (attempt: number) => fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
      .then(({ messages: h, hasMore: more }) => {
        if (cancelled) return;
        initialKeysRef.current = new Set(h.map((m) => m.id));
        serverCountRef.current = h.length;
        setHasMore(more);
        setMessages(h);
        setHistoryLoaded(true);
        // Open on the latest message even if layout settles late.
        if (!openedRef.current) {
          openedRef.current = true;
          settle();
        }
        // Deliver anything queued while offline.
        void flushOutbox().catch(() => {});
      })
      .catch(() => {
        if (cancelled) return;
        // The Pod may only be busy for a moment (a build, a long task). Ask
        // again a few times instead of leaving the conversation empty until
        // the app is reopened.
        if (attempt < 6) {
          historyTimer = setTimeout(() => loadHistory(attempt + 1), 4000);
          return;
        }
        setHistoryError("Couldn't load history.");
        setHistoryLoaded(true);
      });
    loadHistory(0);
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
          const card = normalizeCard(c);
          if (card) parsed.push(card);
        }
        if (parsed.length > 0) {
          setCards((prev) => {
            // The Pod's copy of a card wins (it knows what was chosen on another
            // device); cards it no longer has are kept until the app closes.
            const byId = new Map(prev.map((x) => [x.id, x]));
            for (const p of parsed) byId.set(p.id, p);
            return [...byId.values()].slice(-60);
          });
        }
      }).catch(() => {});
    };
    loadApprovals();
    loadArtifacts();
    loadCards();
    const off = onWSMessage((msg) => {
      // Ghost speaking first (a reminder, an alert, a routine's result): it
      // joins the thread now, labelled, instead of waiting for a reload.
      const say = sayEffect(msg, { session: MAIN_SESSION_ID });
      if (say) {
        applySay(say, { appendMessage: useGhostStore.getState().appendMessage });
        fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
          .then(({ messages: h }) => {
            if (!cancelled) setMessages(reconcileHistory(useGhostStore.getState().messages, h));
          })
          .catch(() => {});
        return;
      }
      // A reply that another surface started (a message sent from the terminal):
      // follow it live instead of finding it finished the next time we look.
      const live = liveEffect(msg, { session: MAIN_SESSION_ID, ownRequestId: ownRequestRef.current });
      if (live) {
        const st = useGhostStore.getState();
        const ended = applyLiveEffect(live, {
          messages: () => useGhostStore.getState().messages,
          appendMessage: st.appendMessage,
          updateMessage: st.updateMessage,
          removeMessage: st.removeMessage,
          setToolActivity: st.setToolActivity,
        });
        if (ended) {
          fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
            .then(({ messages: h }) => {
              if (!cancelled) setMessages(reconcileHistory(useGhostStore.getState().messages, h));
            })
            .catch(() => {});
        }
        return;
      }
      const t = typeof msg.type === "string" ? msg.type : (msg.metadata as Record<string, unknown> | undefined)?.type;
      if (t === "background_started" || t === "background_done") {
        // Detached work for THIS conversation only; other threads never
        // render here. Completions append as assistant messages so the
        // findings read in place, styled like any other reply.
        const now = Date.now();
        const { running, append } = applyBackgroundEvent(
          bgRunningRef.current,
          { type: t, content: msg.content, metadata: msg.metadata },
          MAIN_SESSION_ID,
          now,
        );
        setBgRunning(running);
        if (append) {
          appendMessage({ id: `bg-${now}`, role: "assistant", content: append.content, timestamp: now });
        }
        return;
      }
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
          prev.some((x) => x.id === card.id) ? prev : [...prev, card].slice(-60),
        );
      }
    });
    const t = setInterval(loadApprovals, 15000);
    return () => {
      cancelled = true;
      if (historyTimer) clearTimeout(historyTimer);
      clearInterval(t);
      off();
    };
  }, [config, setMessages, clearStreamBuffer, setGhostName, flushOutbox, appendMessage]);

  // A reply cut off mid-stream is finished by the Pod, which keeps writing it
  // after the connection drops. Ask for the full copy a few times, with room for
  // a long answer to finish, and stop as soon as nothing is incomplete.
  const settleIncomplete = useCallback((cfg: GhostConfig) => {
    [1500, 4000, 9000, 20000].forEach((delay) => {
      setTimeout(() => {
        if (!useGhostStore.getState().messages.some((m) => m.incomplete)) return;
        fetchHistory(cfg, 50, 0, undefined, MAIN_SESSION_ID)
          .then(({ messages: h }) => setMessages(reconcileHistory(useGhostStore.getState().messages, h)))
          .catch(() => {});
      }, delay);
    });
  }, [setMessages]);

  const send = useCallback(async (text: string) => {
    // A paired Pod or an active local model — either makes Ghost reachable.
    if (!config) {
      // Honest limit with a path forward (the plus menu offers local setup and
      // Pod connection). Never silently drop the turn.
      setSendError("Connect your Ghost Pod first. Tap Ghost at the top.");
      return;
    }
    const q = text.trim();
    if (!q) return;

    // Send-while-working: never drop the owner's input. Steer it into the
    // running turn so Ghost receives it now; if steering is unavailable,
    // hand it to the offline outbox (visible, ordered, delivered on turn end).
    if (isStreaming) {
      setDraft("");
      appendMessage({ id: `temp-${Date.now()}`, role: "user", content: q, timestamp: Date.now(), status: "sending" });
      nearBottom.current = true;
      listRef.current?.scrollToEnd({ animated: true });
      const mode = dispatchMode(true, !!config);
      if (mode === "steer") {
        const ok = await sendSteering(config!, { sessionKey: MAIN_SESSION_ID, content: q, action: "redirect" });
        if (ok) {
          setSendError(null);
          return;
        }
      }
      // Steering failed or unavailable: queue it so it is delivered in order.
      enqueueOutbox({
        id: makeOutboxId(),
        messageId: `temp-${Date.now()}`,
        content: q,
        sessionKey: MAIN_SESSION_ID,
        createdAt: Date.now(),
        attempts: 0,
      }).catch(() => {});
      setSendError(null);
      return;
    }

    setDraft("");
    setSendError(null);
    setOutcome(null);
    setClarify(null);
    setCancelPhase((p) => nextCancelState(p, "settled"));
    const tempUserId = `temp-${Date.now()}`;
    const attached = config ? attachments : [];
    setAttachments([]);
    const photos = attached.filter((a) => a.kind === "image");
    const sentFiles = attached.filter((a) => a.kind === "file");
    appendMessage({
      id: tempUserId, role: "user", content: q, timestamp: Date.now(), status: "sending",
      ...(photos.length ? { media_type: photos[0].mime, media_url: photos[0].uri, media_urls: photos.map((a) => a.uri) } : {}),
      ...(sentFiles.length ? { files: sentFiles.map((a) => ({ name: a.name, size: a.size, mime: a.mime })) } : {}),
    });
    const asstId = `temp-a-${Date.now()}`;
    appendMessage({ id: asstId, role: "assistant", content: "", timestamp: Date.now(), status: "streaming" });
    // Sending always returns the eye to the bottom, even from mid-thread.
    nearBottom.current = true;
    dragging.current = false;
    // The new rows are not laid out yet; scroll again once they are.
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    setStreaming(true);
    setToolActivity(null);
    servedRef.current = null;
    const requestId = `m-${Date.now()}`;
    ownRequestRef.current = requestId;
    const ctrl = new AbortController();
    localAbort.current = ctrl;
    // Ghost has the message once it starts to answer, in words or in work (a
    // browser task shows status long before any text). A drop after that is
    // not an unsent message, and queueing it again ran the same request twice.
    let podHasIt = false;
    await sendMessage(config, {
      content: q,
      ...(attached.length ? { attachments: attached } : {}),
      requestId,
      sessionKey: MAIN_SESSION_ID,
      signal: ctrl.signal,
      onChunk: (c) => { podHasIt = true; appendStream(c); },
      onToolStatus: (t, label) => { podHasIt = true; setToolActivity(displayStatusForTool(t, label)); },
      onPhase: (phase, detail) => {
        podHasIt = true;
        const label = phaseLabel(phase, detail);
        if (label) setToolActivity(label);
      },
      onServedBy: (sb) => { servedRef.current = sb; },
      onLifecycle: () => {},
      onOutcome: (_rid, o) => setOutcome(o),
      onClarify: (info) => setClarify({ questionId: info.questionId, question: info.question }),
      onDone: (full, info) => {
        // Commit-stream-first: the streamed text stays on screen. History
        // is reconciled underneath (matched rows keep local content, new
        // server rows append) instead of replacing the thread — so a just
        // watched message never visibly rewrites itself.
        // The runtime's terminal state still wins over any local
        // assumption, including a pending cancellation request.
        setCancelPhase((p) => nextCancelState(p, "settled"));
        localAbort.current = null;
        // Stamp where this ran before commit: the ids change underneath,
        // but commitStream preserves the row fields.
        if (servedRef.current) updateMessage(asstId, { servedBy: servedRef.current });
        // The connection ended without the closing marker: what is on screen may
        // be only the start of the reply. Keep it, mark it, and fetch the rest.
        const cutOff = info?.complete === false && full.trim() !== "";
        if (cutOff) updateMessage(asstId, { incomplete: true });
        commitStream();
        if (cutOff && config) settleIncomplete(config);
        if (config) {
          fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
            .then(({ messages: h }) =>
              setMessages(reconcileHistory(useGhostStore.getState().messages, h)),
            )
            .catch(() => {});
        }
        if (!full.trim() && !clarify) {
          removeMessage(asstId);
          setSendError("Ghost didn't respond. Try rephrasing.");
        }
        setStreaming(false);
        setToolActivity(null);
        if (config) {
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
        }
      },
      onError: (e) => {
        setCancelPhase((p) => nextCancelState(p, "settled"));
        // If some of the reply had already arrived, Ghost did receive the
        // message and was answering: keep what came, mark it incomplete, and
        // fetch the rest. Deleting it, or sending the message again, would
        // lose a reply or ask Ghost twice.
        const partial = useGhostStore.getState().messages.find((m) => m.id === asstId)?.content ?? "";
        if (e.kind !== "auth" && partial.trim() !== "") {
          updateMessage(asstId, { incomplete: true });
          commitStream();
          setStreaming(false);
          setToolActivity(null);
          localAbort.current = null;
          setSendError(null);
          if (config) settleIncomplete(config);
          return;
        }
        if (e.kind !== "auth" && podHasIt) {
          // It was working on it when the connection dropped. Not unsent: show
          // what is there once the Pod's record catches up.
          removeMessage(asstId);
          setStreaming(false);
          setToolActivity(null);
          localAbort.current = null;
          setSendError(null);
          updateMessage(tempUserId, { status: "completed" });
          if (config) settleIncomplete(config);
          return;
        }
        removeMessage(asstId);
        setStreaming(false);
        setToolActivity(null);
        localAbort.current = null;
        if (e.kind === "auth") {
          router.replace("/auth-failure" as never);
          return;
        }
        if (config && isRetryableSendError(e.kind)) {
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
      // The send itself threw before streaming began.
      localAbort.current = null;
      setCancelPhase((p) => nextCancelState(p, "settled"));
      removeMessage(asstId);
      setStreaming(false);
      setToolActivity(null);
      setSendError(e instanceof Error ? e.message : String(e));
    });
  }, [config, isStreaming, attachments, appendMessage, removeMessage, updateMessage, setStreaming, setToolActivity, appendStream, commitStream, setMessages, clarify, router, flushOutbox, settleIncomplete]);

  const stopTurn = useCallback(async () => {
    if (!isStreaming) return;
    setCancelPhase((p) => nextCancelState(p, "request"));
    // Cancel whichever runtime is actually generating: the local abort
    // propagates to the native runtime; Pod turns still steer server-side.
    localAbort.current?.abort();
    localAbort.current = null;
    // The stream UI stays exactly as it is: nothing is committed, hidden,
    // or marked stopped until the runtime answers or terminates the turn.
    if (config) {
      const sent = await sendSteering(config, { sessionKey: MAIN_SESSION_ID, action: "abort" });
      setCancelPhase((p) => nextCancelState(p, sent ? "sent" : "failed"));
    } else {
      setCancelPhase((p) => nextCancelState(p, "settled"));
    }
  }, [config, isStreaming]);

  const loadEarlier = useCallback(async () => {
    if (!config || !hasMore || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const { messages: older, hasMore: more } = await fetchHistory(
        config, 50, serverCountRef.current, undefined, MAIN_SESSION_ID,
      );
      serverCountRef.current += older.length;
      setHasMore(more && older.length > 0);
      if (older.length > 0) {
        // Older rows join the thread without animating; the list keeps the
        // owner's reading position (maintainVisibleContentPosition).
        older.forEach((m) => initialKeysRef.current?.add(m.id));
        setMessages(reconcileHistory(useGhostStore.getState().messages, older));
      }
    } catch {
      // Paging back is best-effort; the visible thread is unaffected.
    } finally {
      setLoadingEarlier(false);
    }
  }, [config, hasMore, loadingEarlier, setMessages]);

  const attachPhoto = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
      allowsMultipleSelection: true,
    }).catch(() => null);
    if (!res || res.canceled) return;
    let next = attachments;
    for (const a of res.assets ?? []) {
      if (!a.base64) continue;
      const problem = attachmentProblem(base64Bytes(a.base64), next.length, next.reduce((n, x) => n + x.size, 0));
      if (problem) {
        setSendError(problem);
        break;
      }
      const mime = a.mimeType ?? "image/jpeg";
      next = [...next, { uri: a.uri, b64: a.base64, mime, name: photoName(a.uri, mime, next.length), kind: "image", size: base64Bytes(a.base64) }];
    }
    setAttachments(next);
  }, [attachments]);

  const attachFile = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true,
      type: "*/*",
    }).catch(() => null);
    if (!res || res.canceled) return;
    let next = attachments;
    for (const a of res.assets ?? []) {
      const problem = attachmentProblem(a.size, next.length, next.reduce((n, x) => n + x.size, 0));
      if (problem) {
        setSendError(problem);
        break;
      }
      try {
        const b64 = await readBase64(a.uri);
        next = [...next, {
          uri: a.uri, b64, mime: a.mimeType ?? "application/octet-stream",
          name: a.name, kind: a.mimeType?.startsWith("image/") ? "image" : "file",
          size: a.size ?? base64Bytes(b64),
        }];
      } catch {
        setSendError("Could not read " + a.name + ".");
      }
    }
    setAttachments(next);
  }, [attachments]);

  const thread = React.useMemo(() => buildThread(messages, artifacts, Date.now(), cards, hasMore), [messages, artifacts, cards, hasMore]);
  const lastCount = useRef(0);
  useEffect(() => {
    // Count what arrives while the owner is reading back, for the pill.
    const n = messages.length;
    if (n > lastCount.current && !nearBottom.current) setUnseen((u) => u + (n - lastCount.current));
    lastCount.current = n;
  }, [messages.length]);

  const renderItem = useCallback(({ item }: { item: ThreadItem }) => {
    if (item.kind === "day") return <DaySeparator label={item.label} />;
    if (item.kind === "artifact") {
      return config ? (
        <View style={styles.inlineCard}>
          <ArtifactCard config={config} artifact={item.artifact} />
        </View>
      ) : null;
    }
    if (item.kind === "card") {
      return config ? (
        <View style={styles.inlineCard}>
          <RichCardView
            card={item.card}
            config={config}
            onDone={(id) => setCards((prev) => prev.filter((x) => x.id !== id))}
            onReply={(text) => void send(text)}
            onResolved={(next) => setCards((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
          />
        </View>
      ) : null;
    }
    const m = item.message;
    const animate = initialKeysRef.current ? !initialKeysRef.current.has(m.id) : false;
    if (m.role === "user") {
      const photos = m.media_urls?.length ? m.media_urls : m.media_url && m.media_type?.startsWith("image/") ? [m.media_url] : [];
      return (
        <UserMessage
          message={m}
          showTime={item.showTime}
          groupStart={item.groupStart}
          animate={animate}
          attachments={photos.length || m.files?.length ? <SentAttachments photos={photos} files={m.files ?? []} /> : undefined}
        />
      );
    }
    return (
      <GhostMessage
        message={m}
        outOfTurn={item.outOfTurn}
        showTime={item.showTime}
        groupStart={item.groupStart}
        phase={m.status === "streaming" ? toolActivity : null}
        animate={animate}
      />
    );
  }, [toolActivity, config, send]);

  const statusLine = outcomeLine(outcome);
  const cancelLine = cancelStatusLine(cancelPhase);
  const paired = !!config;
  const settled = !paired || historyLoaded;
  const status = presence({
    paired,
    connection: connectionState,
    streaming: isStreaming,
    phase: toolActivity,
    backgroundRunning: bgRunning.length,
    approvalsWaiting: approvals.length,
    keeping,
  });
  const starters = conversationStarters({ pod: paired });
  const ready = paired;
  const podOnline = paired && connectionState === "online";

  // What the owner is likely to say next, predicted by the Pod from the
  // conversation as it stands. Asked for when Ghost has just finished
  // speaking; dropped as soon as the conversation moves on.
  const [suggestion, setSuggestion] = useState("");
  const lastMsg = messages[messages.length - 1];
  const askKey = lastMsg ? `${lastMsg.id}:${lastMsg.role}:${lastMsg.status ?? ""}` : "";
  useEffect(() => {
    setSuggestion("");
    if (!config || !shouldAskForSuggestion({ online: podOnline, streaming: isStreaming, lastRole: lastMsg?.role, lastStatus: lastMsg?.status })) return;
    let current = true;
    fetchSuggestion(config, MAIN_SESSION_ID).then((t) => { if (current) setSuggestion(t); });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askKey, isStreaming, podOnline]);

  const jumpToLatest = () => {
    nearBottom.current = true;
    setUnseen(0);
    setAwayFromLatest(false);
    listRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <View style={styles.container}>
      <ScreenBackground variant={messages.length === 0 && settled ? "hero" : "calm"} alive={isStreaming} />
      <PresenceHeader
        name={ghostName ?? "Ghost"}
        status={status}
        topInset={insets.top}
        onOpenPanel={() => router.push("/panel" as never)}
      />
      {historyError ? <Text style={styles.error}>{historyError}</Text> : null}
      {messages.length === 0 && !settled ? (
        // Paired, and the Pod has not answered yet: show nothing rather than
        // an empty-conversation greeting that is about to be replaced.
        <View style={styles.empty} />
      ) : messages.length === 0 ? (
        <View style={styles.empty}>
          {ready ? (
            <>
              <Text style={styles.emptyTitle}>{greeting()}</Text>
              <Text style={styles.emptySub}>Ask, tell, or hand something off.</Text>
              <View style={styles.starters}>
                {starters.map((st, i) => (
                  // They arrive one after another, a breath apart: the first thing the owner sees is alive.
                  <Animated.View
                    key={st.label}
                    entering={reduceMotion ? undefined : FadeInDown.duration(260).delay(220 + i * 70).easing(Easing.bezier(0.23, 1, 0.32, 1))}
                  >
                    <Pressable
                      onPress={() => setDraft(st.text)}
                      style={({ pressed }) => [styles.starter, pressed && styles.starterPressed]}
                      accessibilityRole="button"
                      accessibilityHint="Puts this in the message box"
                    >
                      <Text style={styles.starterText}>{st.label}</Text>
                      <ArrowUpRight size={15} color={Ghost.text.secondary} />
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>Connect your Ghost.</Text>
              <Text style={styles.emptySub}>
                Ghost lives on your Pod, a small computer you own. Your memory and permissions stay there; this phone is how you reach it.
              </Text>
              <View style={styles.starters}>
                <Pressable onPress={() => router.push("/scan" as never)} style={styles.starter} accessibilityRole="button">
                  <Text style={styles.starterText}>Scan QR code</Text>
                </Pressable>
                <Pressable onPress={() => router.push("/manual" as never)} style={styles.starter} accessibilityRole="button">
                  <Text style={styles.starterText}>Enter manually</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ) : (
        <View style={styles.listWrap}>
        <FlatList
          ref={listRef}
          data={thread}
          keyExtractor={(it) => it.key}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 72, paddingBottom: Space.lg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          // Keeps your place when earlier messages are added above. It is off
          // while the list opens: it anchors to the first visible row, which
          // is exactly what fights a jump to the newest one.
          maintainVisibleContentPosition={settling ? undefined : { minIndexForVisible: 0 }}
          // Render the whole opening page at once. With the default of ten,
          // only the oldest rows exist when we jump to "the end", the end is
          // a guess, and the list lands in the middle of the thread.
          initialNumToRender={60}
          onLayout={() => { if (Date.now() < settleUntil.current) listRef.current?.scrollToEnd({ animated: false }); }}
          ListHeaderComponent={
            hasMore ? (
              <View style={styles.earlier}>
                {loadingEarlier ? <ActivityIndicator size="small" color={Ghost.text.tertiary} /> : null}
              </View>
            ) : null
          }
          ListFooterComponent={
            <ThreadExtras
              config={config}
              surfaces={surfaces}
              onSurfaceGone={(id) => setSurfaces((prev) => prev.filter((x) => x.id !== id))}
            />
          }
          scrollEventThrottle={32}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
            if (dragging.current) nearBottom.current = atBottom;
            if (atBottom && unseen > 0) setUnseen(0);
            const away = layoutMeasurement.height + contentOffset.y < contentSize.height - 600;
            if (away !== awayFromLatest) setAwayFromLatest(away);
            const sc = contentOffset.y > 4;
            if (sc !== scrolled) setScrolled(sc);
            if (contentOffset.y < 160 && Date.now() > settleUntil.current) void loadEarlier();
          }}
          onScrollBeginDrag={() => { dragging.current = true; settleUntil.current = 0; }}
          onScrollEndDrag={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            nearBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
          }}
          onMomentumScrollEnd={(e) => {
            dragging.current = false;
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            nearBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
          }}
          onContentSizeChange={() => {
            // While a reply streams in, stay on its newest line without an
            // animation fighting every chunk; otherwise glide.
            if (Date.now() < settleUntil.current) { listRef.current?.scrollToEnd({ animated: false }); return; }
            if (nearBottom.current) listRef.current?.scrollToEnd({ animated: !isStreaming });
          }}
        />
        </View>
      )}
      <Animated.View style={[styles.dock, dockPad]}>
        {awayFromLatest || unseen > 0 ? (
          <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(200).springify().damping(18)} exiting={reduceMotion ? undefined : FadeOut.duration(140)} style={styles.jumpWrap} pointerEvents="box-none">
            <Pressable
              onPress={jumpToLatest}
              style={({ pressed }) => [styles.jump, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={unseen > 0 ? `${unseen} new. Jump to latest` : "Jump to latest"}
            >
              <ArrowDown size={14} color={Ghost.text.primary} />
              {unseen > 0 ? <Text style={styles.jumpText}>{`${unseen} new`}</Text> : null}
            </Pressable>
          </Animated.View>
        ) : null}
        {bgRunning.map((b) => (
          <View key={b.key} style={styles.bgRow} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={Ghost.text.secondary} />
            <Text style={styles.bgText} numberOfLines={1}>
              {b.label} · {formatBackgroundElapsed(b.startedAt, bgNow || Date.now())}
            </Text>
          </View>
        ))}
        {config && approvals.length > 0 ? (
          <View style={styles.approvalWrap}>
            <PermissionCard
              key={approvals[0].id}
              item={approvals[0]}
              config={config}
              position={{ index: 0, total: approvals.length }}
              onResolved={() => {
                if (!config) return;
                // The approval now runs as a turn, so the card clearing is not
                // the whole result: what Ghost did (or why it didn't) arrives
                // in the thread a moment later. Refresh both, or the owner
                // approves and sees nothing change.
                fetchPendingApprovals(config).then(setApprovals).catch(() => {});
                fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
                  .then(({ messages: h }) =>
                    setMessages(reconcileHistory(useGhostStore.getState().messages, h)),
                  )
                  .catch(() => {});
              }}
            />
          </View>
        ) : null}
        {clarify ? <Text style={styles.status} accessibilityLiveRegion="polite">{clarify.question}</Text> : null}
        {cancelLine ? <Text style={styles.status} accessibilityLiveRegion="polite">{cancelLine}</Text> : null}
        {statusLine && !clarify && !cancelLine ? <Text style={styles.status} accessibilityLiveRegion="polite">{statusLine}</Text> : null}
        {sendError ? <Text style={styles.error} accessibilityLiveRegion="polite">{sendError}</Text> : null}
        <AttachmentStrip items={attachments} onRemove={(i) => setAttachments((l) => l.filter((_, j) => j !== i))} />
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSubmit={send}
          placeholder={composerPlaceholder({ online: podOnline, streaming: isStreaming, firstTime: messages.length === 0 })}
          suggestion={suggestion}
          // Photos and files go to the Pod, which identifies and reads them.
          onPhoto={podOnline ? () => void attachPhoto() : undefined}
          onFile={podOnline ? () => void attachFile() : undefined}
          // Voice transcription runs on the Pod (POST /v1/voice/turn). Offline
          // or local-only there is no transcriber, so no handler: Composer
          // renders the mic visibly disabled ("Voice needs Pod. Type instead").
          onTranscribeAudio={
            podOnline
              ? (uri) => voiceTranscribeUri(config!, uri, MAIN_SESSION_ID)
              : undefined
          }
          onVoiceError={(m) => setSendError(m)}
          streaming={isStreaming}
          onStop={() => void stopTurn()}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  listWrap: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 22,
    flexGrow: 1,
  },
  earlier: {
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineCard: {
    marginTop: Space.md,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: Space.huge,
    gap: Space.md,
  },
  emptyTitle: {
    fontFamily: Fonts.voice,
    fontSize: 52,
    lineHeight: 62,
    fontWeight: "400",
    letterSpacing: -1,
    color: Ghost.text.primary,
  },
  emptySub: {
    ...Type.prose,
    color: "rgba(255,255,255,0.72)",
    maxWidth: 330,
  },
  starters: {
    marginTop: Space.xl,
    alignSelf: "flex-start",
    gap: Space.sm,
  },
  starter: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: Space.md,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: Radius.full,
    backgroundColor: Ghost.glass.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  starterPressed: {
    opacity: 0.55,
  },
  starterText: {
    fontSize: 14.5,
    color: Ghost.text.primary,
  },
  dock: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.xs,
    gap: Space.sm,
  },
  jumpWrap: {
    position: "absolute",
    top: -48,
    left: 0,
    right: Space.lg,
    // At the right edge, not centred: centred, it sat over the middle of the
    // very line you were reading back to.
    alignItems: "flex-end",
  },
  jump: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    minWidth: 34,
    justifyContent: "center",
    height: 34,
    borderRadius: 17,
    backgroundColor: Ghost.bg.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.strong,
    boxShadow: `0 4px 14px rgba(${shadowRGB}, 0.12)`,
  },
  jumpText: {
    fontSize: 13,
    fontWeight: "600",
    color: Ghost.text.primary,
  },
  approvalWrap: {},
  extras: {
    paddingTop: Space.md,
    gap: Space.sm,
  },
  status: {
    textAlign: "center",
    fontSize: 13,
    color: Ghost.text.secondary,
  },
  bgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bgText: {
    fontSize: 13,
    color: Ghost.text.secondary,
    flexShrink: 1,
  },
  error: {
    textAlign: "center",
    fontSize: 13,
    color: Ghost.status.error,
    paddingHorizontal: 28,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
  },
  fileThumb: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Ghost.bg.sunken,
  },
  photoChip: {
    maxWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    alignSelf: "flex-start",
    paddingLeft: 4,
    paddingRight: Space.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Ghost.bg.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  photoThumb: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  photoText: {
    flexShrink: 1,
    fontSize: 13,
    color: Ghost.text.secondary,
  },
});

/** A greeting for the time of day. */
function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
