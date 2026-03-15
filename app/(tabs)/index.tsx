import { Audio } from "expo-av";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown, { ASTNode } from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ErrorCard from "../../components/ErrorCard";
import {
  checkHealth,
  clearChat,
  connectWebSocket,
  fetchHistory,
  GhostError,
  onWSMessage,
  onWSStateChange,
  sendMessage,
  transcribeAudio,
  uploadFile,
} from "../../lib/ghostApi";
import {
  ConnectionState,
  createStreamingPlaceholder,
  ExtendedMessage,
  useGhostStore,
} from "../../lib/store";

// ─── Design tokens ────────────────────────────────────────────────────────
const C = {
  bg: "#080C0F",
  surface: "#0D1117",
  surface2: "#111920",
  border: "#1A2332",
  accent: "#00FF88",
  accentDim: "#00FF8818",
  // Text hierarchy
  textPrimary: "#E6EDF3", // near-white — body copy
  textSecondary: "#8B949E", // muted — timestamps, labels
  textTertiary: "#3A4A5A", // very dim — placeholders
  // Bubbles
  userBg: "#0C2018",
  userBorder: "#00FF8828",
  // Status
  danger: "#FF4455",
  warn: "#FFAA00",
  syncing: "#FFAA00",
  // Code
  codeBg: "#010409",
  codeHeader: "#0D1117",
  codeBorder: "#30363D",
  codeText: "#E6EDF3",
};

// System font stack — readable at every weight
const FONT_SANS = Platform.OS === "ios" ? "System" : "sans-serif";
const FONT_MONO = Platform.OS === "ios" ? "Courier" : "monospace";

// ─── Typing dots ──────────────────────────────────────────────────────────
function TypingDots() {
  // Declare refs individually — calling useRef inside .map() violates Rules of Hooks
  const a0 = useRef(new Animated.Value(0));
  const a1 = useRef(new Animated.Value(0));
  const a2 = useRef(new Animated.Value(0));
  const anims = [a0, a1, a2];

  useEffect(() => {
    anims.forEach((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(a.current, {
            toValue: 1,
            duration: 320,
            useNativeDriver: true,
          }),
          Animated.timing(a.current, {
            toValue: 0,
            duration: 320,
            useNativeDriver: true,
          }),
        ]),
      ).start(),
    );
  }, []);

  return (
    <View style={{ flexDirection: "row", gap: 5, paddingVertical: 6 }}>
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: C.accent,
            opacity: a.current,
            transform: [
              {
                translateY: a.current.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -4],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

// ─── Recording pulse ──────────────────────────────────────────────────────
function RecordingDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.4,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: C.danger,
        transform: [{ scale: pulse }],
      }}
    />
  );
}

// ─── Slash commands ───────────────────────────────────────────────────────
const SLASH_COMMANDS = [
  { command: "/help", description: "Show help and tool list" },
  { command: "/clear", description: "Archive current session history" },
  { command: "/reset", description: "Reset session and summary" },
  { command: "/status", description: "Show Pi system status" },
  { command: "/skills", description: "List all installed skills" },
  { command: "/install", description: "Install a new skill from a URL" },
  { command: "/tools", description: "Show loaded JSON tool schemas" },
  { command: "/think", description: "Enable deep reasoning mode" },
  { command: "/remind", description: "Set a reminder" },
];

// ─── Content sanitizer ────────────────────────────────────────────────────
// Only hide lines that are clearly internal tool-status noise.
// These patterns must match the WHOLE line (or be very specific prefixes)
// so we never accidentally drop real response content.
function sanitize(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim().toLowerCase();
      if (!t) return false;
      // XML thinking tags — internal chain-of-thought
      if (/<\/?thinking>|<\/?thought>/.test(t)) return false;
      // Lines that are ONLY a bracketed status: [thinking...], [using tool: x]
      if (/^\[.*(thinking|tool call|using tool|reasoning).*\]$/i.test(t))
        return false;
      // Explicit tool call prefixes from the agent runtime
      if (/^tool call:/i.test(t)) return false;
      if (/^calling tool:/i.test(t)) return false;
      if (/^tool execution (started|failed|completed)/i.test(t)) return false;
      if (/^ghost is (thinking|reasoning|processing)/i.test(t)) return false;
      if (/^fetched \d+ bytes/i.test(t)) return false;
      if (/command blocked by safety guard/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

// ─── User text with highlighted slash commands ────────────────────────────
function UserText({ content }: { content: string }) {
  // Split on slash-commands so e.g. "/status check this" renders as
  // [accent "/status"] [normal " check this"]
  const parts = content.split(/(\/\w+)/g);
  if (parts.length === 1) {
    // No slash command — plain render, no extra Views
    return <Text style={s.userText}>{content}</Text>;
  }
  return (
    <Text style={s.userText}>
      {parts.map((part, i) =>
        /^\/\w+/.test(part) ? (
          <Text key={i} style={s.userTextCmd}>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </Text>
  );
}

// ─── Code block ───────────────────────────────────────────────────────────
function CodeBlock({ node }: { node: ASTNode }) {
  const lang = (node.sourceInfo || "").toLowerCase();
  const isShell = ["bash", "sh", "shell", "zsh"].includes(lang);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(node.content);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={codeStyles.wrap}>
      {/* Header */}
      <View style={codeStyles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {isShell && (
            <View style={{ flexDirection: "row", gap: 5 }}>
              {["#FF5F56", "#FFBD2E", "#27C93F"].map((c) => (
                <View
                  key={c}
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: c,
                  }}
                />
              ))}
            </View>
          )}
          <Text style={codeStyles.lang}>{lang || "code"}</Text>
        </View>
        <TouchableOpacity
          onPress={handleCopy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[codeStyles.copy, copied && codeStyles.copyDone]}>
            {copied ? "copied ✓" : "copy"}
          </Text>
        </TouchableOpacity>
      </View>
      {/* Code */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={codeStyles.body}>
          {isShell && <Text style={codeStyles.prompt}>$ </Text>}
          <Text style={codeStyles.text}>{node.content.trim()}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const codeStyles = StyleSheet.create({
  wrap: {
    backgroundColor: C.codeBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.codeBorder,
    marginVertical: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.codeHeader,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.codeBorder,
  },
  lang: {
    color: C.textSecondary,
    fontSize: 11,
    fontFamily: FONT_MONO,
    fontWeight: "600",
    textTransform: "lowercase",
    letterSpacing: 0.5,
  },
  copy: {
    color: "#58A6FF",
    fontSize: 11,
    fontFamily: FONT_SANS,
    fontWeight: "500",
  },
  copyDone: { color: C.accent },
  body: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  prompt: {
    color: C.accent,
    fontFamily: FONT_MONO,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  text: {
    color: C.codeText,
    fontFamily: FONT_MONO,
    fontSize: 13,
    lineHeight: 20,
  },
});

// ─── Markdown rules ───────────────────────────────────────────────────────
const markdownRules = {
  fence: (node: ASTNode) => <CodeBlock key={node.key} node={node} />,
};

// ─── Markdown styles ──────────────────────────────────────────────────────
const mkStyles: Record<string, any> = {
  body: {
    color: C.textPrimary,
    fontSize: 16,
    lineHeight: 26,
    fontFamily: FONT_SANS,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 10,
  },
  // Headings — clear hierarchy, no monospace
  heading1: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 22,
    marginTop: 18,
    marginBottom: 8,
  },
  heading2: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 19,
    marginTop: 16,
    marginBottom: 6,
  },
  heading3: {
    color: C.textPrimary,
    fontWeight: "600",
    fontSize: 17,
    marginTop: 12,
    marginBottom: 4,
  },
  // Emphasis
  strong: { color: "#FFFFFF", fontWeight: "700" },
  em: { fontStyle: "italic", color: "#A8C0D0" },
  s: { textDecorationLine: "line-through", color: C.textSecondary },
  // Inline code — subtle pill
  code_inline: {
    backgroundColor: "#161B22",
    color: "#79C0FF",
    fontFamily: FONT_MONO,
    fontSize: 14,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  // Blockquote — accent left bar
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    paddingLeft: 14,
    paddingVertical: 4,
    marginVertical: 8,
    marginLeft: 0,
    backgroundColor: "#0A150F",
    borderRadius: 2,
  },
  // Lists
  bullet_list: { marginVertical: 6 },
  ordered_list: { marginVertical: 6 },
  list_item: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  bullet_list_icon: {
    color: C.accent,
    fontSize: 16,
    marginRight: 10,
    lineHeight: 26,
  },
  ordered_list_icon: {
    color: C.accent,
    fontSize: 15,
    marginRight: 10,
    fontWeight: "700",
    lineHeight: 26,
  },
  // Link
  link: { color: C.accent, textDecorationLine: "underline" },
  // HR
  hr: { backgroundColor: C.border, height: 1, marginVertical: 14 },
  // Tables
  table: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    marginVertical: 10,
    overflow: "hidden",
  },
  thead: { backgroundColor: "#0D1117" },
  tr: { borderBottomWidth: 1, borderBottomColor: C.border },
  th: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  td: {
    color: C.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
};

// ─── Status icon (user messages only) ────────────────────────────────────
function StatusIcon({ status }: { status?: string }) {
  if (status === "sending") return <Text style={s.statusIcon}>⏱</Text>;
  if (status === "completed")
    return <Text style={[s.statusIcon, { color: C.accent }]}>✓</Text>;
  if (status === "failed")
    return <Text style={[s.statusIcon, { color: C.danger }]}>✗</Text>;
  return null;
}

// ─── Connection badge ─────────────────────────────────────────────────────
function ConnectionBadge({ state }: { state: ConnectionState }) {
  const color =
    state === "online" ? C.accent : state === "syncing" ? C.warn : C.danger;
  const label =
    state === "online" ? "ONLINE" : state === "syncing" ? "SYNCING" : "OFFLINE";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }}
      />
      <Text
        style={{
          color,
          fontSize: 9,
          fontWeight: "700",
          letterSpacing: 1.5,
          fontFamily: FONT_MONO,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Message row ──────────────────────────────────────────────────────────
function MessageRow({ msg }: { msg: ExtendedMessage }) {
  const isUser = msg.role === "user";
  const content = isUser ? msg.content : sanitize(msg.content);
  const isPlaceholder = !isUser && msg.status === "streaming" && content === "";

  // Ghost: suppress empty non-placeholder rows
  if (!isUser && !content && !isPlaceholder) return null;

  const timeStr = new Date(msg.timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isUser) {
    return (
      <View style={s.userRow}>
        <View style={s.userBubble}>
          {msg.media_url && (
            <View style={{ marginBottom: 8 }}>
              {msg.media_type?.startsWith("image/") ? (
                <Image
                  source={{ uri: msg.media_url }}
                  style={s.attachedImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={s.fileThumb}>
                  <Text style={{ fontSize: 22 }}>📄</Text>
                </View>
              )}
            </View>
          )}
          <UserText content={content} />
          <View style={s.tsRow}>
            <Text style={s.ts}>{timeStr}</Text>
            <StatusIcon status={msg.status} />
          </View>
        </View>
      </View>
    );
  }

  // Ghost message — no bubble, flows freely
  return (
    <View style={s.ghostRow}>
      {/* Avatar — small, square-ish, sits top-left */}
      <View style={s.ghostAvatar}>
        <Text style={{ fontSize: 13 }}>👻</Text>
      </View>
      <View style={s.ghostContent}>
        {isPlaceholder ? (
          <TypingDots />
        ) : (
          <>
            <Markdown style={mkStyles} rules={markdownRules}>
              {content}
            </Markdown>
            <Text style={s.ts}>{timeStr}</Text>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────────
function SearchBar({
  query,
  onChangeQuery,
  onClose,
  results,
}: {
  query: string;
  onChangeQuery: (q: string) => void;
  onClose: () => void;
  results: number;
}) {
  return (
    <View style={s.searchWrap}>
      <Text style={{ color: C.textSecondary, fontSize: 15 }}>⌕</Text>
      <TextInput
        style={s.searchInput}
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Search messages…"
        placeholderTextColor={C.textTertiary}
        autoFocus
      />
      {query.length > 0 && (
        <Text style={{ color: C.textSecondary, fontSize: 11 }}>
          {results} found
        </Text>
      )}
      <TouchableOpacity onPress={onClose}>
        <Text
          style={{
            color: C.accent,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 0.5,
          }}
        >
          DONE
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const {
    config,
    messages,
    appendMessage,
    appendStream,
    commitStream,
    isStreaming,
    setStreaming,
    connectionState,
    setConnectionState,
    setMessages,
    setLastSentMessage,
    lastSentMessage,
    removeMessage,
    updateMessageStatus,
    enqueueMessage,
    dequeueMessages,
    _lastCommitTime,
    _lastCommitContent,
  } = useGhostStore();

  const [input, setInput] = useState("");
  const [pendingMedia, setPendingMedia] = useState<{
    uri: string;
    b64: string;
    mimeType: string;
    name?: string;
  } | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const localIdSeq = useRef(0);
  const streamTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSendAt = useRef(0);
  // Ref to always hold the latest doSend so the offline-queue effect
  // never captures a stale closure even when doSend is recreated.
  const doSendRef = useRef<
    | ((
        text: string,
        mediaB64?: string,
        mediaType?: string,
        mediaUri?: string,
      ) => void)
    | null
  >(null);
  const [activeError, setActiveError] = useState<{
    error: GhostError;
    partialContent?: string;
  } | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(0);
  const [showSlash, setShowSlash] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const attachAnim = useRef(new Animated.Value(0)).current;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);

  const uid = () => `local-${Date.now()}-${++localIdSeq.current}`;
  const normalize = (t: string) => t.replace(/\s+/g, " ").trim();

  // ── Health poll ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!config) return;
    let live = true;
    const poll = async () => {
      if (!live) return;
      setConnectionState((await checkHealth(config)) ? "online" : "offline");
    };
    poll();
    const t = setInterval(poll, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [config]);

  // ── WS state ─────────────────────────────────────────────────────────
  useEffect(
    () =>
      onWSStateChange((st) => {
        if (st === "connected") setConnectionState("online");
        if (st === "reconnecting") setConnectionState("syncing");
      }),
    [],
  );

  // ── Load history + WS messages ────────────────────────────────────────
  useEffect(() => {
    if (!config) return;
    fetchHistory(config, 60, 0)
      .then((d) => {
        setMessages(
          [...d.messages]
            .reverse()
            .map((m) => ({ ...m, status: "completed" as const })),
        );
        setTotalMessages(d.total);
      })
      .catch(() => {});
    connectWebSocket(config);
    return onWSMessage((msg) => {
      if (msg.type !== "assistant_message") return;
      const st = useGhostStore.getState();
      const incoming = sanitize(msg.content ?? "");
      if (!incoming || st.isStreaming) return;
      if (Date.now() - lastSendAt.current > 120_000) return;
      if (st._lastCommitTime && Date.now() - st._lastCommitTime < 10_000) {
        const ln = normalize(st._lastCommitContent);
        if (ln === incoming || ln.includes(incoming) || incoming.includes(ln))
          return;
      }
      const last = st.messages[st.messages.length - 1];
      if (last?.role === "assistant" && normalize(last.content) === incoming)
        return;
      appendMessage({
        id: uid(),
        role: "assistant",
        content: incoming,
        timestamp: Date.now() / 1000,
        status: "completed",
      });
    });
  }, [config]);

  // ── Flush offline queue ───────────────────────────────────────────────
  useEffect(() => {
    if (connectionState === "online" && config && doSendRef.current) {
      // Use doSendRef.current so we always call the latest version of doSend,
      // not a stale closure from when this effect was first registered.
      const send = doSendRef.current;
      dequeueMessages().forEach((m) =>
        send(m.content, m.mediaB64, m.mediaType),
      );
    }
  }, [connectionState]);

  // ── Scroll to bottom ──────────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  // ── Search count ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(0);
      return;
    }
    const q = searchQuery.toLowerCase();
    setSearchResults(
      messages.filter((m) => m.content.toLowerCase().includes(q)).length,
    );
  }, [searchQuery, messages]);

  // ── Load older ────────────────────────────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (!config || loadingOlder || messages.length >= totalMessages) return;
    setLoadingOlder(true);
    try {
      const d = await fetchHistory(config, 30, messages.length);
      setMessages([
        ...[...d.messages]
          .reverse()
          .map((m) => ({ ...m, status: "completed" as const })),
        ...messages,
      ]);
      setTotalMessages(d.total);
    } catch {}
    setLoadingOlder(false);
  }, [config, messages, loadingOlder, totalMessages]);

  // ── Core send ─────────────────────────────────────────────────────────
  const doSend = useCallback(
    async (
      text: string,
      mediaB64?: string,
      mediaType?: string,
      mediaUri?: string,
    ) => {
      if (!config) return;
      lastSendAt.current = Date.now();
      const msgId = uid();
      appendMessage({
        id: msgId,
        role: "user",
        content: text || "📎 Attachment",
        timestamp: Date.now() / 1000,
        media_url: mediaUri,
        media_type: mediaType,
        status: "sending",
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      appendMessage(createStreamingPlaceholder());
      setStreaming(true);
      setActiveError(null);
      setLastSentMessage({ content: text, mediaB64, mediaType });
      streamTimeout.current = setTimeout(() => {
        if (useGhostStore.getState().isStreaming) commitStream();
      }, 30_000);
      const firstChunk = { got: false };
      await sendMessage(config, {
        content: text,
        mediaB64,
        mediaType,
        onChunk: (chunk) => {
          // Don't sanitize chunks — they're token fragments, not complete lines.
          // Sanitizing here drops partial words matching hide patterns mid-sentence.
          if (!chunk) return;
          if (!firstChunk.got) {
            firstChunk.got = true;
            updateMessageStatus(msgId, "completed");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          appendStream(chunk);
        },
        onDone: (full) => {
          if (streamTimeout.current) clearTimeout(streamTimeout.current);
          commitStream();
          // Check the already-streamed buffer for content, not the raw full string.
          // The buffer was appended chunk-by-chunk without sanitization.
          const state = useGhostStore.getState();
          const buffered = state.messages
            .slice()
            .reverse()
            .find((m) => m.role === "assistant");
          const hasContent = (buffered?.content?.trim().length ?? 0) > 0;
          if (hasContent) {
            updateMessageStatus(msgId, "completed");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            updateMessageStatus(msgId, "failed");
            setActiveError({
              error: {
                kind: "empty_stream",
                message: "Ghost returned no response.",
                retryable: true,
              },
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        },
        onError: (err) => {
          if (streamTimeout.current) clearTimeout(streamTimeout.current);
          const partial = useGhostStore.getState().streamBuffer;
          commitStream();
          updateMessageStatus(msgId, "failed");
          const last = useGhostStore.getState().messages.slice(-1)[0];
          if (last?.role === "assistant" && !last.content.trim())
            removeMessage(last.id);
          setActiveError({
            error: err,
            partialContent: partial?.trim() || undefined,
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      });
    },
    [
      config,
      appendMessage,
      appendStream,
      commitStream,
      setStreaming,
      setLastSentMessage,
      updateMessageStatus,
      removeMessage,
    ],
  );

  // Keep ref in sync with latest doSend (fixes stale closure in offline queue)
  useEffect(() => {
    doSendRef.current = doSend;
  }, [doSend]);

  // ── Send ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!config || (!input.trim() && !pendingMedia) || isStreaming) return;
    const text = input.trim(),
      media = pendingMedia;
    setInput("");
    setPendingMedia(null);
    setShowSlash(false);
    if (connectionState === "offline") {
      enqueueMessage({
        content: text,
        mediaB64: media?.b64,
        mediaType: media?.mimeType,
      });
      appendMessage({
        id: uid(),
        role: "user",
        content: text || "📎 Attachment",
        timestamp: Date.now() / 1000,
        media_url: media?.uri,
        status: "sending",
      });
      return;
    }
    await doSend(text, media?.b64, media?.mimeType, media?.uri);
  }, [
    config,
    input,
    pendingMedia,
    isStreaming,
    connectionState,
    doSend,
    enqueueMessage,
    appendMessage,
  ]);

  const handleRetry = useCallback(() => {
    if (!lastSentMessage || isStreaming) return;
    setActiveError(null);
    doSend(
      lastSentMessage.content,
      lastSentMessage.mediaB64,
      lastSentMessage.mediaType,
    );
  }, [lastSentMessage, isStreaming, doSend]);

  // ── Pickers ───────────────────────────────────────────────────────────
  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (!r.canceled && r.assets[0].base64)
      setPendingMedia({
        uri: r.assets[0].uri,
        b64: r.assets[0].base64,
        mimeType: r.assets[0].mimeType ?? "image/jpeg",
        name: r.assets[0].fileName ?? "image.jpg",
      });
  };
  const pickDoc = async () => {
    if (!config) return;
    const r = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (!r.canceled && r.assets[0]) {
      const a = r.assets[0];
      const { b64, mime_type } = await uploadFile(
        config,
        a.uri,
        a.mimeType ?? "application/octet-stream",
        a.name,
      );
      setPendingMedia({ uri: a.uri, b64, mimeType: mime_type, name: a.name });
    }
  };

  // ── Voice ─────────────────────────────────────────────────────────────
  const startRec = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== "granted") return;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const { recording: rec } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    setRecording(rec);
    setIsRecording(true);
    setRecordDuration(0);
    durationTimer.current = setInterval(
      () => setRecordDuration((d) => d + 1),
      1000,
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  const stopRec = async () => {
    if (!recording || !config) return;
    if (durationTimer.current) clearInterval(durationTimer.current);
    setIsRecording(false);
    setIsTranscribing(true);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    if (uri) {
      const t = await transcribeAudio(config, uri);
      setInput((p) =>
        t ? (p ? `${p} ${t}` : t) : `${p} [Voice — unavailable]`,
      );
    }
    setIsTranscribing(false);
    setRecordDuration(0);
  };
  const toggleRec = () => (isRecording ? stopRec() : startRec());
  const fmtDur = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Clear ─────────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (!config) return;
    if (isStreaming) {
      if (streamTimeout.current) clearTimeout(streamTimeout.current);
      commitStream();
    }
    Alert.alert(
      "Clear chat?",
      "Archives mobile history. Ghost's memory is unaffected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearChat(config);
              setMessages([]);
              setActiveError(null);
              setTotalMessages(0);
            } catch {
              setActiveError({
                error: {
                  kind: "network",
                  message: "Failed to clear chat",
                  retryable: false,
                },
              });
            }
          },
        },
      ],
    );
  }, [config, isStreaming, commitStream, setMessages]);

  // ── Attach tray ───────────────────────────────────────────────────────
  const toggleAttach = () => {
    const to = attachOpen ? 0 : 1;
    setAttachOpen(!attachOpen);
    Animated.spring(attachAnim, {
      toValue: to,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
  };
  const closeAttach = () => {
    setAttachOpen(false);
    Animated.spring(attachAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
  };

  const onInputChange = (t: string) => {
    setInput(t);
    if (t === "/") {
      // Show all commands when just "/" is typed
      setShowSlash(true);
    } else if (t.startsWith("/") && !t.includes(" ")) {
      // Show only if at least one command starts with what's typed
      const hasMatch = SLASH_COMMANDS.some((sc) =>
        sc.command.startsWith(t.toLowerCase()),
      );
      setShowSlash(hasMatch);
    } else {
      setShowSlash(false);
    }
  };

  const displayed = searchQuery.trim()
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : messages;

  if (!config) {
    return (
      <View style={[s.container, s.centered, { paddingTop: insets.top }]}>
        <Text style={{ fontSize: 52, marginBottom: 16 }}>👻</Text>
        <Text style={s.noConfigTitle}>Ghost not configured</Text>
        <Text style={s.noConfigSub}>
          Go to ⚙️ Settings to connect to your Pi
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom + 60 : 0}
    >
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={s.headerTitle}>GHOST</Text>
          <ConnectionBadge state={connectionState} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            style={s.headerBtn}
            onPress={() => setSearchVisible((v) => !v)}
          >
            <Text style={{ color: C.textSecondary, fontSize: 17 }}>⌕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.clearBtn, isStreaming && { opacity: 0.35 }]}
            onPress={handleClear}
            disabled={isStreaming}
          >
            <Text style={s.clearBtnTxt}>CLEAR</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search ── */}
      {searchVisible && (
        <SearchBar
          query={searchQuery}
          onChangeQuery={setSearchQuery}
          onClose={() => {
            setSearchVisible(false);
            setSearchQuery("");
          }}
          results={searchResults}
        />
      )}

      {/* ── Messages ── */}
      <FlatList
        ref={listRef}
        data={displayed}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => <MessageRow msg={item} />}
        contentContainerStyle={s.msgList}
        ItemSeparatorComponent={({
          leadingItem,
          trailingItem,
        }: {
          leadingItem: ExtendedMessage;
          trailingItem: ExtendedMessage;
        }) => {
          // More breathing room between consecutive Ghost messages so they
          // don't run together visually. Tight gap for user↔ghost alternation.
          const sameRole =
            leadingItem?.role === trailingItem?.role &&
            leadingItem?.role === "assistant";
          return <View style={{ height: sameRole ? 16 : 4 }} />;
        }}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
        showsVerticalScrollIndicator={false}
        onStartReached={loadOlder}
        onStartReachedThreshold={0.1}
        ListHeaderComponent={
          loadingOlder ? (
            <View style={{ padding: 16, alignItems: "center" }}>
              <ActivityIndicator color={C.accent} size="small" />
            </View>
          ) : messages.length > 0 && messages.length < totalMessages ? (
            <TouchableOpacity
              style={{ padding: 14, alignItems: "center" }}
              onPress={loadOlder}
            >
              <Text
                style={{ color: C.accent, fontSize: 12, fontWeight: "600" }}
              >
                ↑ Load older
              </Text>
            </TouchableOpacity>
          ) : null
        }
        ListFooterComponent={
          activeError ? (
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <ErrorCard
                error={activeError.error}
                partialContent={activeError.partialContent}
                onRetry={activeError.error.retryable ? handleRetry : undefined}
                onDismiss={() => setActiveError(null)}
              />
            </View>
          ) : null
        }
      />

      {/* ── Media preview ── */}
      {pendingMedia && (
        <View style={s.mediaPreview}>
          {pendingMedia.mimeType?.startsWith("image/") ? (
            <Image source={{ uri: pendingMedia.uri }} style={s.mediaThumb} />
          ) : (
            <View
              style={[
                s.mediaThumb,
                {
                  backgroundColor: C.surface2,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <Text style={{ fontSize: 18 }}>📄</Text>
            </View>
          )}
          <Text style={s.mediaName} numberOfLines={1}>
            {pendingMedia.name ?? "Attachment"}
          </Text>
          <TouchableOpacity
            onPress={() => setPendingMedia(null)}
            style={s.mediaRemove}
          >
            <Text style={{ color: C.danger, fontSize: 12, fontWeight: "700" }}>
              ✕
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Offline banner ── */}
      {connectionState === "offline" && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineText}>📡 Offline — will send on reconnect</Text>
        </View>
      )}

      {/* ── Slash suggestions ── */}
      {showSlash && (
        <View style={s.slashSheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={s.slashScroll}
          >
            {SLASH_COMMANDS.map((sc, i) => (
              <TouchableOpacity
                key={sc.command}
                style={[
                  s.slashRow,
                  i === SLASH_COMMANDS.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => {
                  if (
                    [
                      "/help",
                      "/clear",
                      "/reset",
                      "/status",
                      "/skills",
                      "/tools",
                    ].includes(sc.command)
                  ) {
                    setInput("");
                    setShowSlash(false);
                    doSend(sc.command);
                  } else if (sc.command === "/install") {
                    setInput("/install ");
                    setShowSlash(false);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  } else {
                    setInput(sc.command + " ");
                    setShowSlash(false);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }
                }}
              >
                <Text style={s.slashCmd}>{sc.command}</Text>
                <Text style={s.slashDesc}>{sc.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Attach tray ── */}
      {attachOpen && (
        <Animated.View
          style={[
            s.attachTray,
            {
              opacity: attachAnim,
              transform: [
                {
                  translateY: attachAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {[
            {
              icon: "🖼",
              label: "Photo",
              action: () => {
                pickImage();
                closeAttach();
              },
            },
            {
              icon: "📄",
              label: "File",
              action: () => {
                pickDoc();
                closeAttach();
              },
            },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={s.attachItem}
              onPress={item.action}
            >
              <View style={s.attachIconWrap}>
                <Text style={{ fontSize: 22 }}>{item.icon}</Text>
              </View>
              <Text style={s.attachLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      {/* ── Input bar ── */}
      <View
        style={[
          s.inputBar,
          {
            paddingBottom:
              Platform.OS === "ios" ? Math.max(insets.bottom, 8) + 2 : 8,
          },
        ]}
      >
        {/* + button */}
        <TouchableOpacity
          style={[s.circleBtn, attachOpen && s.circleBtnActive]}
          onPress={toggleAttach}
          disabled={isRecording || isTranscribing}
        >
          <Animated.Text
            style={[
              s.circleBtnIcon,
              {
                transform: [
                  {
                    rotate: attachAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "45deg"],
                    }),
                  },
                ],
              },
            ]}
          >
            +
          </Animated.Text>
        </TouchableOpacity>

        {/* Input pill */}
        {isRecording || isTranscribing ? (
          <View style={s.recPill}>
            {isTranscribing ? (
              <>
                <ActivityIndicator size="small" color={C.warn} />
                <Text style={[s.recText, { color: C.warn }]}>
                  Transcribing…
                </Text>
              </>
            ) : (
              <>
                <RecordingDot />
                <Text style={[s.recText, { color: C.danger }]}>
                  {fmtDur(recordDuration)}
                </Text>
                <Text style={s.recHint}>tap ⏹ to stop</Text>
              </>
            )}
          </View>
        ) : (
          <View style={s.inputPill}>
            <TextInput
              ref={inputRef}
              style={s.textInput}
              value={input}
              onChangeText={onInputChange}
              placeholder="Message Ghost…"
              placeholderTextColor={C.textTertiary}
              multiline
              maxLength={4000}
            />
            <TouchableOpacity style={s.micBtn} onPress={toggleRec}>
              <Text style={{ fontSize: 15 }}>🎤</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Send / Stop */}
        {isRecording ? (
          <TouchableOpacity style={s.stopBtn} onPress={stopRec}>
            <View style={s.stopSquare} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              s.sendBtn,
              (isStreaming ||
                isTranscribing ||
                (!input.trim() && !pendingMedia)) &&
                s.sendBtnOff,
            ]}
            onPress={handleSend}
            disabled={
              isStreaming || isTranscribing || (!input.trim() && !pendingMedia)
            }
          >
            {isStreaming ? (
              <ActivityIndicator color={C.bg} size="small" />
            ) : (
              <Text style={s.sendIcon}>↑</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { justifyContent: "center", alignItems: "center" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    color: C.accent,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 7,
    fontFamily: FONT_MONO,
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff08",
  },
  clearBtn: {
    backgroundColor: C.accentDim,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#00FF8835",
  },
  clearBtnTxt: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    fontFamily: FONT_MONO,
  },

  // Search
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  searchInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 15,
    fontFamily: FONT_SANS,
    paddingVertical: 0,
  },

  // Messages
  msgList: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 20 },

  // Ghost message row — no bubble
  ghostRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 6,
  },
  ghostAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#0D1820",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  ghostContent: {
    flex: 1,
    paddingTop: 2,
  },

  // User bubble
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: 3,
  },
  userBubble: {
    maxWidth: "80%",
    backgroundColor: C.userBg,
    borderRadius: 20,
    borderBottomRightRadius: 5,
    borderWidth: 1,
    borderColor: C.userBorder,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userText: {
    color: C.textPrimary,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONT_SANS,
  },
  userTextCmd: {
    color: C.accent,
    fontFamily: FONT_MONO,
    fontWeight: "700",
    fontSize: 15,
  },
  tsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 5,
  },
  ts: { color: C.textTertiary, fontSize: 10, fontFamily: FONT_SANS },
  statusIcon: { fontSize: 10, color: C.textSecondary },
  attachedImage: { width: 180, height: 120, borderRadius: 10 },
  fileThumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: C.surface2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },

  // Media preview strip
  mediaPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  mediaThumb: { width: 36, height: 36, borderRadius: 8 },
  mediaName: { flex: 1, color: C.textSecondary, fontSize: 13 },
  mediaRemove: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FF445518",
    alignItems: "center",
    justifyContent: "center",
  },

  // Offline
  offlineBanner: {
    backgroundColor: "#13110A",
    borderTopWidth: 1,
    borderTopColor: "#2A2510",
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
  },
  offlineText: {
    color: C.warn,
    fontSize: 12,
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },

  // Slash suggestions
  slashSheet: {
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    maxHeight: 220,
    overflow: "hidden",
  },
  slashScroll: {
    flexGrow: 0,
  },
  slashRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  slashCmd: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "700",
    fontFamily: FONT_MONO,
    minWidth: 72,
  },
  slashDesc: {
    color: C.textSecondary,
    fontSize: 13,
    flex: 1,
    fontFamily: FONT_SANS,
  },

  // Attach tray
  attachTray: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  attachItem: { alignItems: "center", gap: 6 },
  attachIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#0D1A24",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  attachLabel: {
    color: C.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    fontFamily: FONT_SANS,
  },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },

  // + button
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ffffff08",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  circleBtnActive: { backgroundColor: C.accentDim, borderColor: C.accent },
  circleBtnIcon: {
    color: C.textSecondary,
    fontSize: 22,
    fontWeight: "200",
    lineHeight: 26,
    includeFontPadding: false,
  },

  // Input pill
  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff08",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 44,
    maxHeight: 120,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 6,
  },
  textInput: {
    flex: 1,
    color: C.textPrimary,
    fontSize: 16,
    fontFamily: FONT_SANS,
    lineHeight: 22,
    paddingVertical: 0,
  },
  micBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  // Recording pill
  recPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0F0808",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#2A1010",
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
    fontFamily: FONT_MONO,
  },
  recHint: {
    color: C.textSecondary,
    fontSize: 11,
    marginLeft: "auto" as any,
    fontFamily: FONT_SANS,
  },

  // Stop / Send
  stopBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FF445515",
    borderWidth: 1.5,
    borderColor: C.danger,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  stopSquare: {
    width: 11,
    height: 11,
    borderRadius: 2,
    backgroundColor: C.danger,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  sendBtnOff: { backgroundColor: "#102018", opacity: 0.5 },
  sendIcon: { color: C.bg, fontSize: 18, fontWeight: "900" },

  noConfigTitle: { color: C.textPrimary, fontSize: 19, fontWeight: "700" },
  noConfigSub: { color: C.textSecondary, fontSize: 14, marginTop: 8 },
});
