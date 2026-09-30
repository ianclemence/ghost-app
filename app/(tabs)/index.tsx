import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { ArrowDown, FileText, X } from "lucide-react-native";
import {
  attachmentProblem,
  base64Bytes,
  fileSize,
  photoName,
  type Attachment,
} from "@/lib/attachments";
import { readBase64 } from "@/lib/localFiles";
import { useKeyboardPadding } from "@/hooks/use-keyboard-padding";
import { Ghost, Radius, Space } from "@/constants/theme";
import { Composer } from "@/components/composer";
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
  fetchPendingApprovals,
  fetchRoutines,
  onWSMessage,
  phaseLabel,
  servedByLabel,
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
import { mergeArtifacts } from "@/lib/artifacts";
import { parseSurfaceAnnouncement } from "@/lib/surfaces";
import { parseCardMessage, type RichCard } from "@/lib/cards";
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
// browser/computer surfaces and runtime cards. (Artifacts are placed in the
// thread where they were made.)
function ThreadExtras({
  config,
  surfaces,
  cards,
  onSurfaceGone,
  onCardDone,
}: {
  config: GhostConfig | null;
  surfaces: { id: string; kind: SurfaceKind }[];
  cards: RichCard[];
  onSurfaceGone: (id: string) => void;
  onCardDone: (id: string) => void;
}) {
  if (!config || (surfaces.length === 0 && cards.length === 0)) return null;
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
        const result = await new Promise<{ ok: boolean; auth: boolean }>((resolve) => {
          void sendMessage(config, {
            content: entry.content,
            sessionKey: entry.sessionKey,
            onChunk: (c) => appendStream(c),
            onToolStatus: (t, label) => setToolActivity(displayStatusForTool(t, label)),
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
  const dockPad = useKeyboardPadding(insets.bottom + Space.md);

  // First paint from the on-device copy of the thread, so the conversation
  // opens instantly and stays readable when the Pod is unreachable. Pod
  // history replaces it as soon as it arrives (it stays authoritative).
  useEffect(() => {
    let cancelled = false;
    loadLocalThread().then((cached) => {
      if (cancelled || cached.length === 0) return;
      const cur = useGhostStore.getState().messages;
      if (cur.length === 0) {
        setMessages(
          cached.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: m.timestamp,
          })),
        );
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
    clearStreamBuffer();
    setOutcome(null);
    setClarify(null);
    fetchIdentity(config).then((id) => {
      if (!cancelled && id?.name) setGhostName(id.name);
    }).catch(() => {});
    fetchRoutines(config).then((r) => {
      if (!cancelled) setKeeping(r.filter((x) => x.state === "active").length);
    }).catch(() => {});
    fetchHistory(config, 50, 0, undefined, MAIN_SESSION_ID)
      .then(({ messages: h, hasMore: more }) => {
        if (cancelled) return;
        initialKeysRef.current = new Set(h.map((m) => m.id));
        serverCountRef.current = h.length;
        setHasMore(more);
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
  }, [config, setMessages, clearStreamBuffer, setGhostName, flushOutbox, appendMessage]);

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
    const firstImage = attached.find((a) => a.kind === "image");
    appendMessage({
      id: tempUserId, role: "user", content: q, timestamp: Date.now(), status: "sending",
      ...(firstImage ? { media_type: firstImage.mime, media_url: firstImage.uri } : {}),
      ...(attached.some((a) => a.kind === "file")
        ? { files: attached.filter((a) => a.kind === "file").map((a) => ({ name: a.name, size: a.size })) }
        : {}),
    });
    const asstId = `temp-a-${Date.now()}`;
    appendMessage({ id: asstId, role: "assistant", content: "", timestamp: Date.now(), status: "streaming" });
    // Sending always returns the eye to the bottom, even from mid-thread.
    nearBottom.current = true;
    listRef.current?.scrollToEnd({ animated: true });
    setStreaming(true);
    setToolActivity(null);
    servedRef.current = null;
    const requestId = `m-${Date.now()}`;
    const ctrl = new AbortController();
    localAbort.current = ctrl;
    await sendMessage(config, {
      content: q,
      ...(attached.length ? { attachments: attached } : {}),
      requestId,
      sessionKey: MAIN_SESSION_ID,
      signal: ctrl.signal,
      onChunk: (c) => appendStream(c),
      onToolStatus: (t, label) => setToolActivity(displayStatusForTool(t, label)),
      onPhase: (phase, detail) => {
        const label = phaseLabel(phase, detail);
        if (label) setToolActivity(label);
      },
      onServedBy: (sb) => { servedRef.current = sb; },
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
        // Stamp where this ran before commit: the ids change underneath,
        // but commitStream preserves the row fields.
        if (servedRef.current) updateMessage(asstId, { servedBy: servedRef.current });
        commitStream();
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
  }, [config, isStreaming, attachments, appendMessage, removeMessage, updateMessage, setStreaming, setToolActivity, appendStream, commitStream, setMessages, clarify, router, flushOutbox]);

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
      const problem = attachmentProblem(base64Bytes(a.base64), next.length);
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
      const problem = attachmentProblem(a.size, next.length);
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

  const thread = React.useMemo(() => buildThread(messages, artifacts), [messages, artifacts]);
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
    const m = item.message;
    const animate = initialKeysRef.current ? !initialKeysRef.current.has(m.id) : false;
    if (m.role === "user") {
      return (
        <View>
          {m.media_url && m.media_type?.startsWith("image/") ? (
            <Image source={{ uri: m.media_url }} style={styles.userPhoto} accessibilityLabel="Photo you sent" />
          ) : null}
          {m.files?.map((f, i) => (
            <View key={`${f.name}-${i}`} style={styles.userFile} accessibilityLabel={`File you sent: ${f.name}`}>
              <FileText size={14} color={Ghost.text.secondary} />
              <Text style={styles.userFileText} numberOfLines={1}>{f.name} · {fileSize(f.size)}</Text>
            </View>
          ))}
          <UserMessage message={m} showTime={item.showTime} groupStart={item.groupStart} animate={animate} />
        </View>
      );
    }
    const badge = servedByLabel(m.servedBy);
    return (
      <GhostMessage
        message={m}
        outOfTurn={item.outOfTurn}
        showTime={item.showTime}
        groupStart={item.groupStart}
        phase={m.status === "streaming" ? toolActivity : null}
        origin={badge ?? null}
        animate={animate}
      />
    );
  }, [toolActivity, config]);

  const statusLine = outcomeLine(outcome);
  const cancelLine = cancelStatusLine(cancelPhase);
  const paired = !!config;
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

  const jumpToLatest = () => {
    nearBottom.current = true;
    setUnseen(0);
    setAwayFromLatest(false);
    listRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <View style={styles.container}>
      <ScreenBackground />
      <PresenceHeader
        name={ghostName ?? "Ghost"}
        status={status}
        scrolled={scrolled}
        topInset={insets.top}
        onOpenPanel={() => router.push("/panel" as never)}
        onVoice={ready ? () => router.push("/live" as never) : undefined}
      />
      {historyError ? <Text style={styles.error}>{historyError}</Text> : null}
      {messages.length === 0 ? (
        <View style={styles.empty}>
          {ready ? (
            <>
              <Text style={styles.emptyTitle}>What can I take off your plate?</Text>
              <Text style={styles.emptySub}>
                Tell me anything. I remember, keep watch, and ask before I act for you.
              </Text>
              <View style={styles.starters}>
                {starters.map((st) => (
                  <Pressable
                    key={st.label}
                    onPress={() => setDraft(st.text)}
                    style={({ pressed }) => [styles.starter, pressed && styles.starterPressed]}
                    accessibilityRole="button"
                    accessibilityHint="Puts this in the message box"
                  >
                    <Text style={styles.starterText}>{st.label}</Text>
                  </Pressable>
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
                <Pressable onPress={() => router.push("/connect" as never)} style={styles.starter} accessibilityRole="button">
                  <Text style={styles.starterText}>Connect your Pod</Text>
                </Pressable>
                <Pressable onPress={() => router.push("/setup-pod" as never)} style={styles.starter} accessibilityRole="button">
                  <Text style={styles.starterText}>Set up a new Pod</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={thread}
          keyExtractor={(it) => it.key}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: Space.lg }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
              cards={cards}
              onSurfaceGone={(id) => setSurfaces((prev) => prev.filter((x) => x.id !== id))}
              onCardDone={(id) => setCards((prev) => prev.filter((x) => x.id !== id))}
            />
          }
          scrollEventThrottle={32}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
            nearBottom.current = atBottom;
            if (atBottom && unseen > 0) setUnseen(0);
            const away = layoutMeasurement.height + contentOffset.y < contentSize.height - 600;
            if (away !== awayFromLatest) setAwayFromLatest(away);
            const sc = contentOffset.y > 4;
            if (sc !== scrolled) setScrolled(sc);
            if (contentOffset.y < 160) void loadEarlier();
          }}
          onContentSizeChange={() => {
            if (nearBottom.current) listRef.current?.scrollToEnd({ animated: true });
          }}
        />
      )}
      <Animated.View style={[styles.dock, dockPad]}>
        {awayFromLatest || unseen > 0 ? (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={styles.jumpWrap} pointerEvents="box-none">
            <Pressable
              onPress={jumpToLatest}
              style={({ pressed }) => [styles.jump, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={unseen > 0 ? `${unseen} new. Jump to latest` : "Jump to latest"}
            >
              <ArrowDown size={14} color={Ghost.text.primary} />
              <Text style={styles.jumpText}>{unseen > 0 ? `${unseen} new` : "Latest"}</Text>
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
        {attachments.length > 0 ? (
          <View style={styles.chipRow}>
            {attachments.map((a, i) => (
              <View key={`${a.uri}-${i}`} style={styles.photoChip}>
                {a.kind === "image" ? (
                  <Image source={{ uri: a.uri }} style={styles.photoThumb} accessibilityLabel={`Attached photo ${a.name}`} />
                ) : (
                  <View style={[styles.photoThumb, styles.fileThumb]}><FileText size={16} color={Ghost.text.secondary} /></View>
                )}
                <Text style={styles.photoText} numberOfLines={1}>{a.kind === "image" ? a.name : `${a.name} · ${fileSize(a.size)}`}</Text>
                <Pressable onPress={() => setAttachments((l) => l.filter((_, j) => j !== i))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${a.name}`}>
                  <X size={16} color={Ghost.text.secondary} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSubmit={send}
          placeholder="Message Ghost"
          minimal
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
  userPhoto: {
    alignSelf: "flex-end",
    width: 180,
    height: 180,
    borderRadius: 18,
    marginTop: Space.lg,
    backgroundColor: Ghost.bg.sunken,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: Space.sm,
  },
  emptyTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    letterSpacing: -0.3,
    color: Ghost.text.primary,
  },
  emptySub: {
    fontSize: 16,
    lineHeight: 23,
    color: Ghost.text.secondary,
  },
  starters: {
    marginTop: Space.lg,
    gap: Space.sm,
    alignItems: "flex-start",
  },
  starter: {
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.strong,
    paddingHorizontal: Space.lg,
    paddingVertical: 11,
    minHeight: 44,
    justifyContent: "center",
  },
  starterPressed: {
    backgroundColor: Ghost.bg.raised,
  },
  starterText: {
    fontSize: 15,
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
    right: 0,
    alignItems: "center",
  },
  jump: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    backgroundColor: Ghost.bg.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.strong,
    boxShadow: "0 4px 14px rgba(26, 22, 17, 0.10)",
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
  userFile: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    maxWidth: "80%",
    marginRight: Space.xl,
    marginBottom: 4,
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Ghost.bg.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
  },
  userFileText: {
    flexShrink: 1,
    fontSize: 13,
    color: Ghost.text.secondary,
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
