import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Keyboard, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/components/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { Easing, FadeInDown, FadeOut, useReducedMotion, useSharedValue } from "react-native-reanimated";
import { TopEdge, BottomEdge } from "@/components/scroll-edge";
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
import { QueueTray } from "@/components/queue-tray";
import { AttachmentStrip } from "@/components/attachment-strip";
import { SentAttachments } from "@/components/sent-attachments";
import { composerPlaceholder } from "@/lib/placeholder";
import { shouldAskForSuggestion } from "@/lib/suggestion";
import { ScreenBackground } from "@/components/screen-glow";
import { PresenceHeader } from "@/components/presence-header";
import { DaySeparator, GhostMessage, UserMessage } from "@/components/thread";
import { PermissionCard } from "@/components/permission-card";
import { ArtifactCard } from "@/components/artifact-card";
import { CanvasCard } from "@/components/canvas-card";
import { canvasInfos, isCanvasArtifact } from "@/lib/canvas";
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
  steerTurn,
  voiceTranscribeUri,
  type Artifact,
  type ChatOutcome,
  type GhostConfig,
  type LiveSurface,
  type PendingApproval,
  type ServedBy,
  type SurfaceKind,
} from "@/lib/ghostApi";
import { cancelStatusLine, nextCancelState, type CancelPhase } from "@/lib/cancel";
import { applyLiveEffect, applyResolve, applySay, liveEffect, resolveEffect, sayEffect } from "@/lib/liveTurn";
import { mergeArtifacts } from "@/lib/artifacts";
import { FollowController } from "@/lib/follow";
import { createChunkBatcher } from "@/lib/chunkBatch";
import { cancel as cancelQueued, endTurn, enqueue as enqueueQueued, hold as holdQueued, picked as pickedQueued, remove as removeQueued, returned as returnedQueued } from "@/lib/queue";
import { endStep, legacyStep, settleSteps, startStep, type RunStep } from "@/lib/runSteps";
import { parseSurfaceAnnouncement } from "@/lib/surfaces";
import { acceptSurface, applySurfaceList, belongsTo, dropSurface, visibleSurfaces, type SurfaceMap } from "@/lib/turnSurfaces";
import { keepsReceipt, normalizeCard, parseCardMessage, type RichCard } from "@/lib/cards";
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
  type OutboxEntry,
} from "@/lib/outbox";
import { MAIN_SESSION_ID, useGhostStore } from "@/lib/store";
import { loadLocalThread, saveLocalThread } from "@/lib/threadCache";
import { conversationStarters } from "@/lib/starters";

type SendResult = "sent" | "offline" | "failed" | "queued";

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

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ownRequestRef = useRef<string | null>(null);
  const reduceMotion = useReducedMotion();
  const { config, messages, queued, setMessages, appendMessage, removeMessage, updateMessage, isStreaming, setStreaming, appendStream, commitStream, clearStreamBuffer, toolActivity, setToolActivity, ghostName, setGhostName, connectionState } = useGhostStore();
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
  // Drives the soft shade under the header once messages scroll beneath it.
  // Without it, text slid under the clock and Ghost's mark with nothing
  // between them.
  const edgeY = useSharedValue(0);
  // Drives the conversation-only shade above the floating dock while content
  // extends below the viewport. Last viewport metrics, so growth without a
  // scroll event (new rows, rotation) still resolves it correctly.
  const edgeRemaining = useSharedValue(0);
  const scrollMetrics = useRef({ h: 0, y: 0 });
  // From the follow controller: whether the thread is following the end, and
  // whether the owner is far enough from it to need the way back.
  const [following, setFollowing] = useState(true);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const [unseen, setUnseen] = useState(0);
  // Photos and files ride along with the next message. The Pod detects each
  // one's real type and opens it with the right tool.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Messages present at first paint don't animate in; new ones do.
  const initialKeysRef = useRef<Set<string> | null>(null);
  const [cancelPhase, setCancelPhase] = useState<CancelPhase>("idle");
  // Ghost's browser/computer, as the Pod reports them, keyed by id.
  const [surfaceMap, setSurfaceMap] = useState<SurfaceMap>({});
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
  const flushingRef = useRef(false);
  // Closes the tray when a turn ends; assigned where it is defined, read by
  // code that runs before that point in the file.
  const endOfTurnRef = useRef<(clean: boolean) => Promise<void>>(async () => {});
  const heldSaysRef = useRef<NonNullable<ReturnType<typeof sayEffect>>[]>([]);
  useEffect(() => {
    if (isStreaming || heldSaysRef.current.length === 0) return;
    const held = heldSaysRef.current;
    heldSaysRef.current = [];
    const append = useGhostStore.getState().appendMessage;
    held.forEach((e) => applySay(e, { appendMessage: append }));
  }, [isStreaming]);
  const localAbort = useRef<AbortController | null>(null);
  // Where the in-flight turn ran, as the Pod's runtime states it (the
  // served_by frame), stamped onto the reply when it completes.
  const servedRef = useRef<ServedBy | null>(null);

  // Flush the offline outbox FIFO: oldest queued message sends first.
  // A failed flush stops and leaves the entry queued; a non-retryable
  // failure drops the entry and surfaces the error like a normal send.
  // The runtime remains the authority on what was received — history is
  // refetched after every delivered turn.
  // Deliver what is waiting, FIFO, one turn at a time, through the same path as
  // any message (a live bubble, a streaming reply): it used to stream into
  // nowhere and show up only when the whole turn was over. It sends only what
  // is waiting for its turn: a message still being steered into the running
  // turn is not sent twice.
  const sendRef = useRef<(text: string, opts?: { entry?: OutboxEntry }) => Promise<SendResult>>(async () => "failed");
  const flushOutbox = useCallback(async () => {
    if (!config || flushingRef.current) return;
    flushingRef.current = true;
    try {
      for (;;) {
        if (useGhostStore.getState().isStreaming) return;
        const tray = useGhostStore.getState().queued;
        const pending = (await loadOutbox().catch(() => [] as OutboxEntry[])).filter((e) => {
          const t = tray.find((q) => q.id === e.messageId);
          return !t || t.state === "waiting";
        });
        if (pending.length === 0) return;
        const r = await sendRef.current(pending[0].content, { entry: pending[0] });
        if (r !== "sent") return;
      }
    } finally {
      flushingRef.current = false;
    }
  }, [config]);
  const listRef = useRef<FlatList>(null);
  const composerRef = useRef<TextInput>(null);
  // Following the end of the conversation is one decision, made in one place
  // (lib/follow.ts): the owner's finger leaves the end, or comes back to it.
  // Growth (a reply, a tool step, a card, the keyboard) never changes it, and
  // while following, growth is answered with one snap per frame.
  const followRef = useRef<FollowController | null>(null);
  if (!followRef.current) {
    followRef.current = new FollowController({
      scrollToEnd: (animated) => listRef.current?.scrollToEnd({ animated }),
      onChange: ({ following: f, away }) => {
        setFollowing(f);
        setAwayFromLatest(away);
      },
    });
  }
  const ctl = followRef.current;
  useEffect(() => () => ctl.dispose(), [ctl]);
  // Whether the owner's finger (or its momentum) is moving the thread.
  const touch = useRef({ dragging: false, momentum: false });
  const openedRef = useRef(false);
  // The dock floats over the thread (like ChatGPT's bar) instead of sitting
  // below it in flow. Measured so scrolled content always clears it.
  const [dockH, setDockH] = useState(180);
  // The owner wants the end (opening, sending, coming back to the screen).
  const settle = useCallback(() => ctl.follow(), [ctl]);
  // The keyboard moves the dock and resizes the list: stay on the end.
  useEffect(() => {
    const subs = [
      Keyboard.addListener("keyboardDidShow", () => ctl.onGrow()),
      Keyboard.addListener("keyboardDidHide", () => ctl.onGrow()),
    ];
    return () => subs.forEach((x) => x.remove());
  }, [ctl]);
  // The Pod is the authority on Ghost's browser. Its list is asked for on
  // opening, on coming back to the conversation or the app, and when a turn
  // ends, so a card that began while the app was away appears, and one whose
  // work ended while the app was away settles.
  const refreshSurfaces = useCallback(() => {
    if (!config) return;
    fetchLiveSurfaces(config).then((list) => {
      setSurfaceMap((prev) => applySurfaceList(prev, list, MAIN_SESSION_ID));
    }).catch(() => {});
  }, [config]);
  // One surface changed: ask for its state. Every announcement is followed,
  // not just the first, or the card stays on whatever it saw first.
  const pullSurface = useCallback((kind: SurfaceKind, id: string) => {
    if (!config) return;
    fetchLiveSurface(config, kind, id).then((s) => {
      if (!s) {
        setSurfaceMap((prev) => dropSurface(prev, id));
        return;
      }
      setSurfaceMap((prev) => (prev[id] || belongsTo(s, MAIN_SESSION_ID) ? acceptSurface(prev, s) : prev));
    }).catch(() => {});
  }, [config]);
  const onSurface = useCallback((s: LiveSurface) => setSurfaceMap((prev) => acceptSurface(prev, s)), []);
  const onSurfaceGone = useCallback((id: string) => setSurfaceMap((prev) => dropSurface(prev, id)), []);
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
        // What was said, not what is waiting to be sent: queued and unsent
        // bubbles saved here came back on the next launch as sent messages.
        messages.filter((m) => m.content && m.status !== "streaming" && m.status !== "queued" && m.status !== "sending").map((m) => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
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
          // A card the owner put away stays put away: only cards that keep a receipt
          // render a resolved receipt, the rest never come back.
          if (card && (keepsReceipt(card) || !card.resolved)) parsed.push(card);
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
      // An alert whose condition has cleared (storage freed, the Pod cooled
      // down) settles into a record instead of staying "Needs you".
      const cleared = resolveEffect(msg, { session: MAIN_SESSION_ID });
      if (cleared) {
        const st = useGhostStore.getState();
        applyResolve(cleared, { messages: () => st.messages, updateMessage: st.updateMessage });
        // One held back while Ghost was answering was never shown: it is moot.
        // The saved copy arrives with the next history sync, already settled.
        heldSaysRef.current = heldSaysRef.current.filter((h) => h.key !== cleared.key);
        return;
      }
      // Ghost speaking first (a reminder, an alert, a routine's result): it
      // joins the thread now, labelled, instead of waiting for a reload.
      const say = sayEffect(msg, { session: MAIN_SESSION_ID });
      if (say) {
        // A reminder that comes due while Ghost is answering waits for the
        // answer to finish. Dropped in the middle, it split the browser card
        // from its answer and the answer kept growing above it.
        if (useGhostStore.getState().isStreaming) {
          heldSaysRef.current.push(say);
          return;
        }
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
      if (announced) pullSurface(announced.kind, announced.surfaceId);
      // A card frame carries the full payload; kind-gated by the parser.
      const card = parseCardMessage(msg, MAIN_SESSION_ID);
      if (card && (keepsReceipt(card) || !card.resolved)) {
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
  }, [config, setMessages, clearStreamBuffer, setGhostName, flushOutbox, appendMessage, pullSurface, settle]);

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

  // The Pod is the authority on the conversation, not this screen's memory of
  // it. Re-read it when the owner returns to the screen or the app: a turn
  // that ended while the app was away (or a Pod restart mid-reply) must
  // appear, and a stream that died with the process must not leave the
  // conversation frozen on the last thing it saw.
  const syncHistory = useCallback((releaseStuckStream: boolean) => {
    if (!config) return;
    fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
      .then(({ messages: h }) => {
        setMessages(reconcileHistory(useGhostStore.getState().messages, h));
        if (!releaseStuckStream) return;
        const store = useGhostStore.getState();
        if (!store.isStreaming) return;
        // Returning from the background means the OS suspended the stream, so
        // a still-"streaming" bubble is stale. Mark it incomplete, commit it,
        // and let settleIncomplete replace it with the Pod's full copy (never
        // show a truncated reply as if it were whole).
        const lastAsst = [...store.messages].reverse().find((m) => m.role === "assistant");
        if (lastAsst) updateMessage(lastAsst.id, { incomplete: true });
        store.commitStream();
        void endOfTurnRef.current(false);
        settleIncomplete(config);
      })
      .catch(() => {});
  }, [config, setMessages, updateMessage, settleIncomplete]);

  // Re-read the conversation whenever the owner returns to it, so a turn that
  // ended while the app was away appears and a dead stream never freezes the
  // screen. On returning from the background the stream is definitely stale,
  // so it is released too.
  useFocusEffect(useCallback(() => { settle(); refreshSurfaces(); syncHistory(false); }, [settle, refreshSurfaces, syncHistory]));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") { refreshSurfaces(); syncHistory(true); } });
    return () => sub.remove();
  }, [refreshSurfaces, syncHistory]);

  // Hold a message for when the Pod is back. The same words already waiting
  // are the same request (a second tap while nothing seemed to happen): the
  // outbox keeps one, and so must the thread, or four taps showed four
  // identical "waiting" bubbles of which only one would ever go.
  const queueOrMerge = useCallback((messageId: string, content: string) => {
    const entry = { id: makeOutboxId(), messageId, content, sessionKey: MAIN_SESSION_ID, createdAt: Date.now(), attempts: 0 };
    enqueueOutbox(entry)
      .then((list) => {
        if (list.some((e) => e.id === entry.id)) updateMessage(messageId, { status: "queued" });
        else removeMessage(messageId);
      })
      .catch(() => updateMessage(messageId, { status: "queued" }));
  }, [removeMessage, updateMessage]);

  // Steering requests still on their way. A turn does not close its queue until
  // each has been answered, or a message could be steered into the turn AND
  // sent as the next one.
  const steerInflight = useRef<Set<Promise<unknown>>>(new Set());
  // Whether this Pod reports what it did (tool_start / steer_picked). One that
  // does not cannot say a steered message was read, only accept it.
  const podReportsPickup = useRef(false);

  // The turn is over: what Ghost read joins the conversation, in order, and
  // what it did not read goes out next. Exactly once each.
  const endOfTurn = useCallback(async (clean: boolean) => {
    await Promise.allSettled([...steerInflight.current]);
    const st = useGhostStore.getState();
    const end = endTurn(st.queued, { clean, podReportsPickup: podReportsPickup.current });
    st.setQueued(end.tray);
    const base = Date.now();
    end.intoThread.forEach((q, i) => {
      st.appendMessage({ id: `msg-${base + i}-${q.id.slice(-6)}`, key: q.id, role: "user", content: q.text, timestamp: base + i, status: "completed" });
      if (q.outboxId) void removeOutboxEntry(q.outboxId).catch(() => {});
    });
    void flushOutbox().catch(() => {});
  }, [flushOutbox]);
  endOfTurnRef.current = endOfTurn;

  // Typed while Ghost works: sent into the running turn so Ghost reads it at
  // its next step, and kept in the tray (never lost, never ambiguous) until it
  // is part of the conversation. If the turn cannot take it, it goes next.
  const queueWhileBusy = useCallback(async (cfg: GhostConfig, q: string) => {
    setDraft("");
    setSendError(null);
    const id = `q-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const entry: OutboxEntry = { id: makeOutboxId(), messageId: id, content: q, sessionKey: MAIN_SESSION_ID, createdAt: Date.now(), attempts: 0 };
    let kept = true;
    try {
      kept = (await enqueueOutbox(entry)).some((e) => e.id === entry.id);
    } catch {
      // Not saved across a restart, but still queued for this run.
    }
    // The same words are already waiting: that is the same request.
    if (!kept) return;
    useGhostStore.getState().setQueued((l) => enqueueQueued(l, { id, text: q, now: entry.createdAt, outboxId: entry.id }));
    const steer = steerTurn(cfg, { sessionKey: MAIN_SESSION_ID, content: q, action: "redirect" });
    steerInflight.current.add(steer);
    const r = await steer.finally(() => steerInflight.current.delete(steer));
    if (r === "sent") return;
    useGhostStore.getState().setQueued((l) => holdQueued(l, id));
    // The turn ended while this was on its way: nothing will run it unless we do.
    if (!useGhostStore.getState().isStreaming) void flushOutbox().catch(() => {});
  }, [flushOutbox]);

  const takeBack = useCallback((id: string) => {
    const st = useGhostStore.getState();
    const q = st.queued.find((x) => x.id === id);
    if (!q) return;
    st.setQueued((l) => cancelQueued(l, id));
    if (q.outboxId) void removeOutboxEntry(q.outboxId).catch(() => {});
    setDraft((d) => (d.trim() ? d : q.text));
  }, []);

  const send = useCallback(async (text: string, opts?: { entry?: OutboxEntry }): Promise<SendResult> => {
    // A paired Pod or an active local model — either makes Ghost reachable.
    if (!config) {
      // Honest limit with a path forward (the plus menu offers local setup and
      // Pod connection). Never silently drop the turn.
      setSendError("Connect your Ghost Pod first. Tap Ghost at the top.");
      return "failed";
    }
    const q = text.trim();
    if (!q) return "failed";
    const entry = opts?.entry;

    // Send-while-working: never drop the owner's input.
    if (useGhostStore.getState().isStreaming && !entry) {
      await queueWhileBusy(config, q);
      return "queued";
    }

    if (!entry) {
      setDraft("");
      setSendError(null);
    }
    setOutcome(null);
    setClarify(null);
    setCancelPhase((p) => nextCancelState(p, "settled"));
    const store = useGhostStore.getState();
    const attached = entry ? [] : attachments;
    if (!entry) setAttachments([]);
    const photos = attached.filter((a) => a.kind === "image");
    const sentFiles = attached.filter((a) => a.kind === "file");
    // A message that was waiting offline already has its bubble; one that was
    // waiting in the tray becomes its bubble now.
    const waiting = entry ? store.messages.find((m) => m.id === entry.messageId) : undefined;
    const tempUserId = waiting ? waiting.id : `temp-${Date.now()}`;
    if (waiting) {
      updateMessage(waiting.id, { status: "sending" });
    } else {
      appendMessage({
        id: tempUserId, role: "user", content: q, timestamp: Date.now(), status: "sending",
        ...(photos.length ? { media_type: photos[0].mime, media_url: photos[0].uri, media_urls: photos.map((a) => a.uri) } : {}),
        ...(sentFiles.length ? { files: sentFiles.map((a) => ({ name: a.name, size: a.size, mime: a.mime })) } : {}),
      });
    }
    if (entry) store.setQueued((l) => removeQueued(l, entry.messageId));
    const asstId = `temp-a-${Date.now()}`;
    appendMessage({ id: asstId, role: "assistant", content: "", timestamp: Date.now(), status: "streaming" });
    // Sending always returns the eye to the end, even from mid-thread.
    settle();
    setStreaming(true);
    setToolActivity(null);
    servedRef.current = null;
    podReportsPickup.current = false;
    const requestId = `m-${Date.now()}`;
    ownRequestRef.current = requestId;
    const ctrl = new AbortController();
    localAbort.current = ctrl;
    // What Ghost does on the way, in order; written onto the reply as it goes.
    let steps: RunStep[] = [];
    let stepEvents = false;
    const writeSteps = () => updateMessage(asstId, { steps });
    // Streamed text is handed over a few times a second, not per piece.
    const batcher = createChunkBatcher((t) => appendStream(t));
    // Ghost has the message once it starts to answer, in words or in work (a
    // browser task shows status long before any text). A drop after that is
    // not an unsent message, and queueing it again ran the same request twice.
    let podHasIt = false;
    const accept = () => {
      if (podHasIt) return;
      podHasIt = true;
      if (entry) void removeOutboxEntry(entry.id).catch(() => {});
    };
    return await new Promise<SendResult>((resolve) => {
      sendMessage(config, {
        content: q,
        ...(attached.length ? { attachments: attached } : {}),
        requestId,
        sessionKey: MAIN_SESSION_ID,
        signal: ctrl.signal,
        onChunk: (c) => { accept(); batcher.push(c); },
        onToolStatus: (t, label) => {
          accept();
          setToolActivity(displayStatusForTool(t, label));
          // An older Pod only says "a tool is running": still one step each.
          if (!stepEvents) {
            steps = legacyStep(steps, { tool: t, now: Date.now() });
            writeSteps();
          }
        },
        onToolStart: (id, tool, detail) => {
          accept();
          stepEvents = true;
          podReportsPickup.current = true;
          steps = startStep(steps, { id, tool, detail, now: Date.now() });
          writeSteps();
        },
        onToolResult: (id, ok, ms, note) => {
          steps = endStep(steps, { id, ok, ms: ms ?? undefined, note, now: Date.now() });
          writeSteps();
          // A canvas appears as soon as Ghost makes it, not when the reply ends.
          if (ok && steps.find((x) => x.id === id)?.tool === "canvas") {
            fetchArtifacts(config, MAIN_SESSION_ID)
              .then((fresh) => setArtifacts((prev) => mergeArtifacts(prev, fresh)))
              .catch(() => {});
          }
        },
        onSteerPicked: (contents) => {
          podReportsPickup.current = true;
          const st = useGhostStore.getState();
          st.setQueued((l) => pickedQueued(l, contents));
          // Delivered: it must not be sent again if the app restarts.
          for (const c of contents) {
            const hit = st.queued.find((x) => x.state === "steering" && x.text.trim() === c.trim());
            if (hit?.outboxId) void removeOutboxEntry(hit.outboxId).catch(() => {});
          }
        },
        onSteerReturned: (contents) => {
          podReportsPickup.current = true;
          useGhostStore.getState().setQueued((l) => returnedQueued(l, contents));
        },
        onPhase: (phase, detail) => {
          accept();
          const label = phaseLabel(phase, detail);
          if (label) setToolActivity(label);
        },
        onServedBy: (sb) => { servedRef.current = sb; },
        onLifecycle: () => {},
        onOutcome: (_rid, o) => setOutcome(o),
        onClarify: (info) => setClarify({ questionId: info.questionId, question: info.question }),
        onDone: (full, info) => {
          batcher.flush();
          // The runtime's terminal state still wins over any local
          // assumption, including a pending cancellation request.
          setCancelPhase((p) => nextCancelState(p, "settled"));
          localAbort.current = null;
          accept();
          // Nothing is still "running" once the turn is over; the record stays.
          steps = settleSteps(steps, Date.now());
          if (steps.length > 0) writeSteps();
          // Stamp where this ran before commit: the ids change underneath,
          // but commitStream preserves the row fields.
          if (servedRef.current) updateMessage(asstId, { servedBy: servedRef.current });
          // The connection ended without the closing marker: what is on screen may
          // be only the start of the reply. Keep it, mark it, and fetch the rest.
          const cutOff = info?.complete === false && full.trim() !== "";
          if (cutOff) updateMessage(asstId, { incomplete: true });
          // Commit-stream-first: the streamed text stays on screen. History
          // is reconciled underneath (matched rows keep local content, new
          // server rows append) instead of replacing the thread — so a just
          // watched message never visibly rewrites itself.
          commitStream();
          if (cutOff && config) settleIncomplete(config);
          if (config) {
            fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
              .then(({ messages: h }) => setMessages(reconcileHistory(useGhostStore.getState().messages, h)))
              .catch(() => {});
          }
          if (!full.trim() && steps.length === 0 && !clarify) {
            removeMessage(asstId);
            setSendError("Ghost didn't respond. Try rephrasing.");
          } else if (!full.trim() && steps.length > 0 && !clarify) {
            setSendError("Ghost didn't finish. What it tried is above.");
          }
          setStreaming(false);
          setToolActivity(null);
          if (config) {
            fetchPendingApprovals(config).then(setApprovals).catch(() => {});
            fetchArtifacts(config, MAIN_SESSION_ID)
              .then((fresh) => setArtifacts((prev) => mergeArtifacts(prev, fresh)))
              .catch(() => {});
            // The turn is over: the Pod has settled its browser. Take its word.
            refreshSurfaces();
          }
          resolve("sent");
          void endOfTurn(info?.complete !== false);
        },
        onError: (e) => {
          batcher.flush();
          setCancelPhase((p) => nextCancelState(p, "settled"));
          steps = settleSteps(steps, Date.now());
          if (steps.length > 0) writeSteps();
          // If some of the reply had already arrived, Ghost did receive the
          // message and was answering: keep what came, mark it incomplete, and
          // fetch the rest. Deleting it, or sending the message again, would
          // lose a reply or ask Ghost twice.
          const partial = useGhostStore.getState().messages.find((m) => m.id === asstId)?.content ?? "";
          const finish = (r: SendResult, clean = false) => {
            setStreaming(false);
            setToolActivity(null);
            localAbort.current = null;
            resolve(r);
            void endOfTurn(clean);
          };
          if (e.kind !== "auth" && partial.trim() !== "") {
            updateMessage(asstId, { incomplete: true });
            commitStream();
            setSendError(null);
            if (config) settleIncomplete(config);
            finish("sent");
            return;
          }
          if (e.kind !== "auth" && podHasIt) {
            // It was working on it when the connection dropped. Not unsent: show
            // what is there once the Pod's record catches up.
            if (steps.length > 0) commitStream();
            else removeMessage(asstId);
            setSendError(null);
            updateMessage(tempUserId, { status: "completed" });
            if (config) settleIncomplete(config);
            finish("sent");
            return;
          }
          removeMessage(asstId);
          if (e.kind === "auth") {
            if (entry) {
              void removeOutboxEntry(entry.id).catch(() => {});
              removeMessage(tempUserId);
            }
            finish("failed");
            router.replace("/auth-failure" as never);
            return;
          }
          if (config && isRetryableSendError(e.kind)) {
            // Offline, not failed: queue for FIFO delivery on reconnect.
            // The message stays visible, marked queued — never silently lost.
            if (entry) updateMessage(tempUserId, { status: "queued" });
            else queueOrMerge(tempUserId, q);
            setSendError(null);
            finish("offline");
            return;
          }
          if (entry) void removeOutboxEntry(entry.id).catch(() => {});
          updateMessage(tempUserId, { status: "failed" });
          setSendError(e.message);
          finish("failed");
        },
      }).catch((e: unknown) => {
        // The send itself threw before streaming began.
        batcher.cancel();
        localAbort.current = null;
        setCancelPhase((p) => nextCancelState(p, "settled"));
        removeMessage(asstId);
        setStreaming(false);
        setToolActivity(null);
        setSendError(e instanceof Error ? e.message : String(e));
        resolve("failed");
      });
    });
  }, [config, attachments, appendMessage, removeMessage, updateMessage, setStreaming, setToolActivity, appendStream, commitStream, setMessages, clarify, router, settleIncomplete, refreshSurfaces, queueOrMerge, queueWhileBusy, endOfTurn, settle]);
  sendRef.current = send;

  // Another screen wants something said (a canvas's "Fix it" sends; "Change it"
  // starts the owner's own sentence). It is taken once, here.
  const intent = useGhostStore((st) => st.intent);
  useEffect(() => {
    if (!intent) return;
    useGhostStore.getState().setIntent(null);
    if (intent.send) void sendRef.current(intent.text);
    else {
      setDraft(intent.text);
      // Ready to finish the sentence: the keyboard is up once the screen is back.
      setTimeout(() => composerRef.current?.focus(), 350);
    }
  }, [intent]);

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

  const shownSurfaces = React.useMemo(() => visibleSurfaces(surfaceMap), [surfaceMap]);
  const thread = React.useMemo(
    () => buildThread(messages, artifacts, Date.now(), cards, hasMore, shownSurfaces),
    [messages, artifacts, cards, hasMore, shownSurfaces],
  );
  // While Ghost works in its browser, the browser card is where that shows.
  // An empty "Using the browser" line under it said the same thing twice.
  const browsing = shownSurfaces.some((t) => t.surface.state === "active" || t.surface.state === "starting" || t.surface.state === "waiting");
  // An approval a waiting browser card shows is answered there, on the card
  // beside the page it is about; the dock does not ask the same thing twice.
  const approvalFor = useCallback((s: LiveSurface): PendingApproval | null => {
    if (s.state !== "waiting") return null;
    return approvals.find((a) => a.continuation?.browser_session === s.id)
      ?? (s.kind === "computer" ? approvals.find((a) => a.capability === "computer") ?? null : null);
  }, [approvals]);
  const onCard = new Set(shownSurfaces.map((t) => approvalFor(t.surface)?.id).filter(Boolean) as string[]);
  const dockApprovals = approvals.filter((a) => !onCard.has(a.id));
  const answering = isStreaming && !!messages[messages.length - 1]?.content.trim() && messages[messages.length - 1]?.role === "assistant";
  const refreshAfterApproval = useCallback(() => {
    if (!config) return;
    fetchPendingApprovals(config).then(setApprovals).catch(() => {});
    fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
      .then(({ messages: h }) => setMessages(reconcileHistory(useGhostStore.getState().messages, h)))
      .catch(() => {});
  }, [config, setMessages]);
  const lastCount = useRef(0);
  useEffect(() => {
    // Count what arrives while the owner is reading back, for the pill.
    const n = messages.length;
    if (n > lastCount.current && !ctl.following) setUnseen((u) => u + (n - lastCount.current));
    lastCount.current = n;
  }, [messages.length, ctl]);

  // When the owner last spoke. A number, so rows are not redrawn per streamed word.
  const lastUserAt = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].timestamp;
    return 0;
  }, [messages]);
  // Which canvas is the live one, and which version each is.
  const canvasInfoById = React.useMemo(() => canvasInfos(artifacts), [artifacts]);
  const renderItem = useCallback(({ item }: { item: ThreadItem }) => {
    if (item.kind === "day") return <DaySeparator label={item.label} />;
    if (item.kind === "artifact") {
      if (!config) return null;
      // Something Ghost built to be run is shown running, not filed.
      if (isCanvasArtifact(item.artifact)) {
        return <CanvasCard config={config} artifact={item.artifact} info={canvasInfoById[item.artifact.id]} />;
      }
      return (
        <View style={styles.inlineCard}>
          <ArtifactCard config={config} artifact={item.artifact} />
        </View>
      );
    }
    if (item.kind === "surface") {
      return config ? (
        <LiveSurfaceCard
          config={config}
          surface={item.tracked.surface}
          ownDeviceId={config.deviceID}
          approval={approvalFor(item.tracked.surface)}
          answering={answering}
          latest={item.tracked.at >= lastUserAt}
          onApprovalResolved={refreshAfterApproval}
          onSurface={onSurface}
          onGone={onSurfaceGone}
        />
      ) : null;
    }
    if (item.kind === "card") {
      // Belt over the merge-point filters: a put-away card never renders.
      if (!keepsReceipt(item.card) && item.card.resolved) return null;
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
    if (m.status === "streaming" && !m.content.trim() && browsing && !m.steps?.length) return null;
    return (
      <GhostMessage
        message={m}
        outOfTurn={item.outOfTurn}
        showTime={item.showTime}
        groupStart={item.groupStart}
        // The browser card says what Ghost is doing in the browser.
        phase={m.status === "streaming" && !browsing ? toolActivity : null}
        animate={animate}
      />
    );
  }, [toolActivity, config, send, browsing, onSurface, onSurfaceGone, approvalFor, answering, refreshAfterApproval, lastUserAt, canvasInfoById]);

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
    setUnseen(0);
    ctl.follow({ animated: true });
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
        <View style={[styles.empty, { paddingBottom: dockH + Space.huge }]}>
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
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 72, paddingBottom: dockH + Space.lg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          // Keeps your place when anything above it changes (earlier messages
          // loading, a card folding) while you read back. Off while following
          // the end: there the anchor is the end, and the follow controller
          // owns it.
          maintainVisibleContentPosition={following ? undefined : { minIndexForVisible: 0 }}
          // Render the whole opening page at once. With the default of ten,
          // only the oldest rows exist when we jump to "the end", the end is
          // a guess, and the list lands in the middle of the thread.
          initialNumToRender={60}
          // The list's own size changed (the keyboard, the dock): stay on the end.
          onLayout={() => ctl.onGrow()}
          ListHeaderComponent={
            hasMore ? (
              <View style={styles.earlier}>
                {loadingEarlier ? <ActivityIndicator size="small" color={Ghost.text.tertiary} /> : null}
              </View>
            ) : null
          }
          scrollEventThrottle={32}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            edgeY.set(contentOffset.y);
            scrollMetrics.current = { h: layoutMeasurement.height, y: contentOffset.y };
            edgeRemaining.set(Math.max(0, contentSize.height - (layoutMeasurement.height + contentOffset.y)));
            ctl.onScroll({
              offset: contentOffset.y,
              viewport: layoutMeasurement.height,
              content: contentSize.height,
              byHand: touch.current.dragging || touch.current.momentum,
            });
            if (ctl.following && unseen > 0) setUnseen(0);
            const sc = contentOffset.y > 4;
            if (sc !== scrolled) setScrolled(sc);
            // Earlier messages load when the owner has gone back to read them,
            // not while the list is still settling at its top on opening.
            if (contentOffset.y < 160 && !ctl.following) void loadEarlier();
          }}
          onScrollBeginDrag={() => { touch.current.dragging = true; }}
          onScrollEndDrag={(e) => {
            // A flick hands over to momentum; a still finger is the end of it.
            if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) touch.current.dragging = false;
          }}
          onMomentumScrollBegin={() => { touch.current.momentum = true; }}
          onMomentumScrollEnd={() => { touch.current.dragging = false; touch.current.momentum = false; }}
          onContentSizeChange={(w, h) => {
            const m = scrollMetrics.current;
            edgeRemaining.set(Math.max(0, h - (m.h + m.y)));
            // Any growth (a streamed word, a tool step, a card opening) while
            // following is one snap to the end, once per frame.
            ctl.onGrow();
          }}
        />
        <View pointerEvents="none" style={[styles.edge, { top: insets.top + 60 }]}>
          <TopEdge y={edgeY} />
        </View>
        <BottomEdge remaining={edgeRemaining} />
        </View>
      )}
      <Animated.View onLayout={(e) => { const h = e.nativeEvent.layout.height; setDockH((prev) => (Math.abs(prev - h) < 1 ? prev : h)); }} style={[styles.dock, dockPad]}>
        {awayFromLatest || (unseen > 0 && !following) ? (
          <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(200).springify().damping(18)} exiting={reduceMotion ? undefined : FadeOut.duration(140)} style={styles.jumpWrap} pointerEvents="box-none">
            <Pressable
              onPress={jumpToLatest}
              style={({ pressed }) => [styles.jump, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={unseen > 0 ? `${unseen} new. Jump to latest` : "Jump to latest"}
            >
              <ArrowDown size={14} color={Ghost.text.primary} />
              {unseen > 0 ? <Text style={styles.jumpText}>{`${unseen} new`}</Text> : isStreaming ? <Text style={styles.jumpText}>Latest</Text> : null}
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
        {config && dockApprovals.length > 0 ? (
          <View style={styles.approvalWrap}>
            <PermissionCard
              key={dockApprovals[0].id}
              item={dockApprovals[0]}
              config={config}
              position={{ index: 0, total: dockApprovals.length }}
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
        <QueueTray items={queued} onCancel={takeBack} />
        <AttachmentStrip items={attachments} onRemove={(i) => setAttachments((l) => l.filter((_, j) => j !== i))} />
        <Composer
          inputRef={composerRef}
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
  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 0,
    zIndex: 1,
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
  // Every card in the thread sits one message-gap below what came before it.
  inlineCard: {
    marginTop: Space.lg,
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
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
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
