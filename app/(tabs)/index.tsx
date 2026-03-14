import { Audio } from "expo-av";
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

// ─── Palette ───────────────────────────────────────────────────────────────
const C = {
  bg: "#080C0F",
  surface: "#0D1117",
  surface2: "#111920",
  border: "#1A2332",
  accent: "#00FF88",
  accentDim: "#00FF8822",
  text: "#C8D8E8",
  textDim: "#4A6080",
  textMuted: "#1E2E3E",
  userBubble: "#0A2016",
  danger: "#FF4455",
  warn: "#FFAA00",
  syncing: "#FFAA00",
  codeBlock: "#050A0F",
  codeBorder: "#0E2030",
};

// ─── Animated typing dots ─────────────────────────────────────────────────
function TypingDots() {
  const anims = [
    useRef(new Animated.Value(0)),
    useRef(new Animated.Value(0)),
    useRef(new Animated.Value(0)),
  ];
  useEffect(() => {
    anims.forEach((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(a.current, {
            toValue: 1,
            duration: 380,
            useNativeDriver: true,
          }),
          Animated.timing(a.current, {
            toValue: 0,
            duration: 380,
            useNativeDriver: true,
          }),
        ]),
      ).start(),
    );
  }, []);
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 5,
        paddingVertical: 4,
        paddingHorizontal: 2,
      }}
    >
      {anims.map((a, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: C.accent,
            opacity: a.current,
            transform: [
              {
                translateY: a.current.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -5],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

const SLASH_COMMANDS = [
  { command: "/help", description: "Show help and tool list" },
  { command: "/clear", description: "Archive current session history" },
  { command: "/reset", description: "Reset session and summary" },
  { command: "/think", description: "Enable deep reasoning mode" },
  {
    command: "/remind",
    description: "Set a reminder (e.g. /remind buy milk in 10m)",
  },
];

const shouldHideAssistantStatus = (text: string) => {
  const t = text.trim().toLowerCase();
  if (!t) return true;

  // Exact phrases
  if (t === "thinking" || t === "thinking...") return true;

  // Patterns for status updates (handles markdown like *...* or [...])
  const statusPatterns = [
    "thinking",
    "reasoning",
    "thought",
    "using tool",
    "using tools",
    "tool:",
    "tool call",
    "calling tool",
    "assistant tool",
    "ghost is using tool",
    "working...",
    "processing...",
    "searching...",
    "fetching...",
    "reading...",
    "writing...",
    "executing...",
    "finished",
    "done",
  ];

  for (const pattern of statusPatterns) {
    if (t.includes(pattern)) return true;
  }

  // Bracket/Markdown patterns
  if (/^\[.*\]$/.test(t) && /(thinking|tool|reasoning)/i.test(t)) return true;
  if (/\*.*(thinking|tool|reasoning).*\*$/i.test(t)) return true;
  if (/^>.*$/.test(t) && /(thinking|reasoning|thought)/i.test(t)) return true;
  if (/<thinking>/.test(t) || /<\/thinking>/.test(t)) return true;
  if (/<thought>/.test(t) || /<\/thought>/.test(t)) return true;

  return false;
};

const sanitizeAssistantText = (text: string) => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !shouldHideAssistantStatus(line));
  return lines.join("\n").trim();
};

// ─── Recording pulse ──────────────────────────────────────────────────────
function RecordingIndicator() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.35,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: C.danger,
        transform: [{ scale: pulse }],
      }}
    />
  );
}

// ─── Message status icon ──────────────────────────────────────────────────
function MessageStatusIcon({ status }: { status?: string }) {
  if (status === "sending") return <Text style={styles.statusIcon}>⏱</Text>;
  if (status === "completed" || status === "streaming")
    return <Text style={[styles.statusIcon, { color: C.accent }]}>✓</Text>;
  if (status === "failed")
    return <Text style={[styles.statusIcon, { color: C.danger }]}>✗</Text>;
  return null;
}

// ─── Connection indicator ─────────────────────────────────────────────────
function ConnectionIndicator({ state }: { state: ConnectionState }) {
  const color =
    state === "online" ? C.accent : state === "syncing" ? C.syncing : C.danger;
  const label =
    state === "online" ? "ONLINE" : state === "syncing" ? "SYNCING" : "OFFLINE";
  return (
    <View style={styles.headerStatus}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusLabel, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Search overlay ───────────────────────────────────────────────────────
function SearchOverlay({
  visible,
  query,
  onChangeQuery,
  onClose,
  results,
}: {
  visible: boolean;
  query: string;
  onChangeQuery: (q: string) => void;
  onClose: () => void;
  results: number;
}) {
  if (!visible) return null;
  return (
    <View style={styles.searchOverlay}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search messages..."
          placeholderTextColor={C.textMuted}
          autoFocus
        />
        {query.length > 0 && (
          <Text style={styles.searchCount}>{results} found</Text>
        )}
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: C.accent, fontSize: 13, fontWeight: "700" }}>
            CLOSE
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Custom Markdown Rules ───────────────────────────────────────────────
const markdownRules = {
  fence: (
    node: ASTNode,
    children: React.ReactNode,
    parent: ASTNode[],
    styles: any,
  ) => {
    const language = node.sourceInfo || "code";
    return (
      <View key={node.key} style={styles.fence}>
        <View style={styles.codeHeader}>
          <Text style={styles.codeLanguage}>{language.toUpperCase()}</Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              // Simplified copy hint
              Alert.alert("Code Block", "Copying to clipboard...");
            }}
          >
            <Text style={styles.copyButton}>Copy</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text style={styles.code_block}>{node.content}</Text>
        </ScrollView>
      </View>
    );
  },
};

// ─── Message Bubble ───────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ExtendedMessage }) {
  const isUser = msg.role === "user";
  const assistantContent = isUser
    ? msg.content
    : sanitizeAssistantText(msg.content);
  const isStreamingPlaceholder =
    !isUser && msg.status === "streaming" && assistantContent === "";
  const isEmpty = !isUser && assistantContent === "";
  if (!isUser && isEmpty && !isStreamingPlaceholder) return null;

  return (
    <View
      style={[
        styles.bubbleRow,
        isUser ? styles.bubbleRowUser : styles.bubbleRowAI,
      ]}
    >
      {!isUser && (
        <View style={styles.avatar}>
          <Text style={{ fontSize: 14 }}>👻</Text>
        </View>
      )}
      <View
        style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}
      >
        {msg.media_url && (
          <View style={{ marginBottom: 8 }}>
            {msg.media_type?.startsWith("image/") ? (
              <Image
                source={{ uri: msg.media_url }}
                style={styles.attachedImage}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.attachedImage,
                  {
                    backgroundColor: C.surface2,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: C.border,
                  },
                ]}
              >
                <Text style={{ fontSize: 24, marginBottom: 4 }}>📄</Text>
                <Text
                  style={{ color: C.textDim, fontSize: 11 }}
                  numberOfLines={1}
                >
                  File Attachment
                </Text>
              </View>
            )}
          </View>
        )}
        {isStreamingPlaceholder ? (
          <TypingDots />
        ) : isUser ? (
          <Text style={styles.userText}>{msg.content}</Text>
        ) : (
          <Markdown style={mkStyles} rules={markdownRules}>
            {assistantContent}
          </Markdown>
        )}
        <View style={styles.tsRow}>
          <Text style={styles.ts}>
            {new Date(msg.timestamp * 1000).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          {isUser && <MessageStatusIcon status={msg.status} />}
        </View>
      </View>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────
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
    setConnected,
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
  } | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const localIdSeq = useRef(0);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSendAtRef = useRef(0);
  const [activeError, setActiveError] = useState<{
    error: GhostError;
    partialContent?: string;
  } | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(0);
  const [showSlashSuggestions, setShowSlashSuggestions] = useState(false);
  const [attachExpanded, setAttachExpanded] = useState(false);
  const attachAnim = useRef(new Animated.Value(0)).current;
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);

  // Tracks input bar Y position so slash modal can anchor to it
  const inputBarY = useRef(0);

  const makeLocalMessageId = () => {
    localIdSeq.current += 1;
    return `local-${Date.now()}-${localIdSeq.current}`;
  };
  const normalizeAssistantContent = (text: string) =>
    text.replace(/\s+/g, " ").trim();

  // ── Health polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!config) return;
    let active = true;
    const poll = async () => {
      if (!active || !config) return;
      const ok = await checkHealth(config);
      if (active) setConnectionState(ok ? "online" : "offline");
    };
    poll();
    const interval = setInterval(poll, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [config, setConnectionState]);

  // ── WS state ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onWSStateChange((state) => {
      if (state === "connected") setConnectionState("online");
      else if (state === "reconnecting") setConnectionState("syncing");
    });
    return unsub;
  }, [setConnectionState]);

  // ── Load history ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!config) return;
    fetchHistory(config, 60, 0)
      .then((data) => {
        setMessages(
          [...data.messages]
            .reverse()
            .map((m) => ({ ...m, status: "completed" as const })),
        );
        setTotalMessages(data.total);
      })
      .catch(() => {});

    connectWebSocket(config);
    const unsub = onWSMessage((msg) => {
      if (msg.type === "assistant_message") {
        const state = useGhostStore.getState();
        const incoming = sanitizeAssistantText(msg.content ?? "");
        if (!incoming) return;
        if (state.isStreaming) {
          if (state.streamBuffer.trim().length === 0) {
            appendStream(incoming);
            commitStream();
            const lastUser = [...state.messages]
              .reverse()
              .find((m) => m.role === "user" && m.status === "sending");
            if (lastUser?.id) updateMessageStatus(lastUser.id, "completed");
          }
          return;
        }
        if (Date.now() - lastSendAtRef.current > 120000) return;
        if (
          state._lastCommitTime &&
          Date.now() - state._lastCommitTime < 10000
        ) {
          // Robust comparison: check if the new message is just a subset or exact match of the last one
          const lastNormalized = normalizeAssistantContent(
            state._lastCommitContent,
          );
          if (
            lastNormalized === incoming ||
            lastNormalized.includes(incoming) ||
            incoming.includes(lastNormalized)
          )
            return;
        }
        const last = state.messages[state.messages.length - 1];
        if (
          last?.role === "assistant" &&
          normalizeAssistantContent(last.content) === incoming
        )
          return;
        appendMessage({
          id: makeLocalMessageId(),
          role: "assistant",
          content: incoming,
          timestamp: Date.now() / 1000,
          status: "completed",
        });
      }
    });
    return unsub;
  }, [config, appendMessage, setMessages]);

  // ── Flush offline queue ───────────────────────────────────────────────
  useEffect(() => {
    if (connectionState === "online" && config) {
      const queued = dequeueMessages();
      for (const msg of queued)
        doSend(msg.content, msg.mediaB64, msg.mediaType);
    }
  }, [connectionState]);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  // ── Search filter ─────────────────────────────────────────────────────
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

  // ── Load older messages ───────────────────────────────────────────────
  const loadOlderMessages = useCallback(async () => {
    if (!config || loadingOlder || messages.length >= totalMessages) return;
    setLoadingOlder(true);
    try {
      const data = await fetchHistory(config, 30, messages.length);
      const older = [...data.messages]
        .reverse()
        .map((m) => ({ ...m, status: "completed" as const }));
      setMessages([...older, ...messages]);
      setTotalMessages(data.total);
    } catch {}
    setLoadingOlder(false);
  }, [config, messages, loadingOlder, totalMessages, setMessages]);

  // ── Core send ─────────────────────────────────────────────────────────
  const doSend = useCallback(
    async (
      text: string,
      mediaB64?: string,
      mediaType?: string,
      mediaUri?: string,
    ) => {
      if (!config) return;
      lastSendAtRef.current = Date.now();
      const userMsgId = makeLocalMessageId();
      appendMessage({
        id: userMsgId,
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

      streamTimeoutRef.current = setTimeout(() => {
        if (useGhostStore.getState().isStreaming) commitStream();
      }, 30_000);

      const firstChunkReceived = { current: false };

      await sendMessage(config, {
        content: text,
        mediaB64,
        mediaType,
        onChunk: (chunk) => {
          const cleanedChunk = sanitizeAssistantText(chunk);
          if (!cleanedChunk) return;
          if (!firstChunkReceived.current) {
            firstChunkReceived.current = true;
            updateMessageStatus(userMsgId, "completed");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          appendStream(cleanedChunk);
        },
        onDone: (fullText) => {
          if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
          const cleaned = sanitizeAssistantText(fullText);
          const hasReply = cleaned.trim().length > 0;
          commitStream();
          if (hasReply) {
            updateMessageStatus(userMsgId, "completed");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            const state = useGhostStore.getState();
            const lastAssistant = [...state.messages]
              .reverse()
              .find((m) => m.role === "assistant");
            if (lastAssistant?.content?.trim().length) {
              updateMessageStatus(userMsgId, "completed");
              return;
            }
            updateMessageStatus(userMsgId, "failed");
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
          if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
          const partial = useGhostStore.getState().streamBuffer;
          commitStream();
          updateMessageStatus(userMsgId, "failed");
          const msgs = useGhostStore.getState().messages;
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.role === "assistant" && lastMsg.content.trim() === "")
            removeMessage(lastMsg.id);
          setActiveError({
            error: err,
            partialContent: partial?.trim().length > 0 ? partial : undefined,
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

  // ── Send handler ──────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!config || (!input.trim() && !pendingMedia) || isStreaming) return;
    const text = input.trim();
    const media = pendingMedia;
    setInput("");
    setPendingMedia(null);
    if (connectionState === "offline") {
      enqueueMessage({
        content: text,
        mediaB64: media?.b64,
        mediaType: media?.mimeType,
      });
      appendMessage({
        id: makeLocalMessageId(),
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

  // ── Retry ─────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    if (!lastSentMessage || isStreaming) return;
    setActiveError(null);
    doSend(
      lastSentMessage.content,
      lastSentMessage.mediaB64,
      lastSentMessage.mediaType,
    );
  }, [lastSentMessage, isStreaming, doSend]);

  const handleDismissError = useCallback(() => setActiveError(null), []);

  // ── Image / document pickers ──────────────────────────────────────────
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0].base64) {
      const asset = result.assets[0];
      setPendingMedia({
        uri: asset.uri,
        b64: asset.base64,
        mimeType: asset.mimeType ?? "image/jpeg",
        name: asset.fileName ?? "image.jpg",
      });
    }
  };

  const pickDocument = async () => {
    if (!config) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const { b64, mime_type } = await uploadFile(
        config,
        asset.uri,
        asset.mimeType ?? "application/octet-stream",
        asset.name,
      );
      setPendingMedia({
        uri: asset.uri,
        b64,
        mimeType: mime_type,
        name: asset.name,
      });
    }
  };

  // ── Voice recording ───────────────────────────────────────────────────
  const startRecording = async () => {
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

  const stopRecording = async () => {
    if (!recording || !config) return;
    if (durationTimer.current) clearInterval(durationTimer.current);
    setIsRecording(false);
    setIsTranscribing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    if (uri) {
      const transcript = await transcribeAudio(config, uri);
      setInput((prev) =>
        transcript
          ? prev
            ? prev + " " + transcript
            : transcript
          : prev + " [Voice — transcription unavailable]",
      );
    }
    setIsTranscribing(false);
    setRecordDuration(0);
  };

  const toggleRecording = () =>
    isRecording ? stopRecording() : startRecording();
  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Clear chat ────────────────────────────────────────────────────────
  const handleClearChat = useCallback(() => {
    if (!config) return;
    if (isStreaming) {
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
      commitStream();
    }
    Alert.alert(
      "Clear chat?",
      "This archives the mobile history. Ghost's long-term memory is unaffected.",
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

  // ── Input change ──────────────────────────────────────────────────────
  const handleInputChange = (text: string) => {
    setInput(text);
    setShowSlashSuggestions(
      text === "/" || (text.startsWith("/") && !text.includes(" ")),
    );
  };

  // ── Attach tray toggle ───────────────────────────────────────────────
  const toggleAttach = () => {
    const toValue = attachExpanded ? 0 : 1;
    setAttachExpanded(!attachExpanded);
    Animated.spring(attachAnim, {
      toValue,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
  };

  const displayMessages = searchQuery.trim()
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : messages;

  // ── No config ─────────────────────────────────────────────────────────
  if (!config) {
    return (
      <View
        style={[styles.container, styles.centered, { paddingTop: insets.top }]}
      >
        <Text style={{ fontSize: 54, marginBottom: 18 }}>👻</Text>
        <Text style={styles.noConfigTitle}>Ghost not configured</Text>
        <Text style={styles.noConfigSub}>
          Go to ⚙️ Settings to connect to your Pi
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom + 60 : 0}
      enabled
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>GHOST</Text>
          <ConnectionIndicator state={connectionState} />
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={() => setSearchVisible(!searchVisible)}
          >
            <Text style={styles.searchBtnText}>⌕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.clearBtn, isStreaming && styles.clearBtnOff]}
            onPress={handleClearChat}
            disabled={isStreaming}
          >
            <Text style={styles.clearBtnText}>CLEAR</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search overlay ── */}
      <SearchOverlay
        visible={searchVisible}
        query={searchQuery}
        onChangeQuery={setSearchQuery}
        onClose={() => {
          setSearchVisible(false);
          setSearchQuery("");
        }}
        results={searchResults}
      />

      {/* ── Messages ── */}
      <FlatList
        ref={listRef}
        data={displayMessages}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => <MessageBubble msg={item} />}
        contentContainerStyle={styles.msgList}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
        showsVerticalScrollIndicator={false}
        onStartReached={loadOlderMessages}
        onStartReachedThreshold={0.1}
        ListHeaderComponent={
          loadingOlder ? (
            <View style={{ padding: 12, alignItems: "center" }}>
              <ActivityIndicator color={C.accent} size="small" />
              <Text style={{ color: C.textDim, fontSize: 11, marginTop: 4 }}>
                Loading older messages…
              </Text>
            </View>
          ) : messages.length > 0 && messages.length < totalMessages ? (
            <TouchableOpacity
              style={{ padding: 12, alignItems: "center" }}
              onPress={loadOlderMessages}
            >
              <Text
                style={{ color: C.accent, fontSize: 12, fontWeight: "600" }}
              >
                ↑ Load older messages
              </Text>
            </TouchableOpacity>
          ) : null
        }
        ListFooterComponent={
          activeError ? (
            <View style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
              <ErrorCard
                error={activeError.error}
                partialContent={activeError.partialContent}
                onRetry={activeError.error.retryable ? handleRetry : undefined}
                onDismiss={handleDismissError}
              />
            </View>
          ) : null
        }
      />

      {/* ── Pending media preview ── */}
      {pendingMedia && (
        <View style={styles.mediaPreview}>
          {pendingMedia.mimeType?.startsWith("image/") ? (
            <Image
              source={{ uri: pendingMedia.uri }}
              style={styles.mediaThumb}
            />
          ) : (
            <View
              style={[
                styles.mediaThumb,
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
          <Text style={styles.mediaLabel} numberOfLines={1}>
            {pendingMedia.name ||
              (pendingMedia.mimeType?.startsWith("image/")
                ? "Image attached"
                : "File attached")}
          </Text>
          <TouchableOpacity
            onPress={() => setPendingMedia(null)}
            style={styles.mediaRemove}
          >
            <Text style={{ color: C.danger, fontSize: 13, fontWeight: "700" }}>
              ✕
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Offline banner ── */}
      {connectionState === "offline" && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📡 Offline — messages will be sent when reconnected
          </Text>
        </View>
      )}

      {/* ── Slash suggestions ── */}
      {showSlashSuggestions && (
        <View style={styles.slashOverlay}>
          {SLASH_COMMANDS.map((sc, idx) => (
            <TouchableOpacity
              key={sc.command}
              style={[
                styles.slashItem,
                idx === SLASH_COMMANDS.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={() => {
                const cmd = sc.command;
                if (cmd === "/help" || cmd === "/clear" || cmd === "/reset") {
                  // Send immediately
                  setInput("");
                  setShowSlashSuggestions(false);
                  doSend(cmd);
                } else {
                  // Just fill and focus
                  setInput(cmd + " ");
                  setShowSlashSuggestions(false);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }
              }}
            >
              <Text style={styles.slashCmd}>{sc.command}</Text>
              <Text style={styles.slashDesc}>{sc.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Attach tray — slides in above input bar ── */}
      {attachExpanded && (
        <Animated.View
          style={[
            styles.attachTray,
            {
              opacity: attachAnim,
              transform: [
                {
                  translateY: attachAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.attachOption}
            onPress={() => {
              pickImage();
              setAttachExpanded(false);
              Animated.spring(attachAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 120,
                friction: 10,
              }).start();
            }}
          >
            <View style={styles.attachOptionIcon}>
              <Text style={{ fontSize: 20 }}>🖼</Text>
            </View>
            <Text style={styles.attachOptionLabel}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachOption}
            onPress={() => {
              pickDocument();
              setAttachExpanded(false);
              Animated.spring(attachAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 120,
                friction: 10,
              }).start();
            }}
          >
            <View style={styles.attachOptionIcon}>
              <Text style={{ fontSize: 20 }}>📄</Text>
            </View>
            <Text style={styles.attachOptionLabel}>File</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Input bar ── */}
      <View
        style={[
          styles.inputBar,
          {
            paddingBottom:
              Platform.OS === "ios" ? Math.max(insets.bottom, 8) + 2 : 8,
          },
        ]}
      >
        {/* + attach button */}
        <TouchableOpacity
          style={[styles.attachBtn, attachExpanded && styles.attachBtnActive]}
          onPress={toggleAttach}
          disabled={isRecording || isTranscribing}
        >
          <Animated.Text
            style={[
              styles.attachBtnIcon,
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

        {/* Text input with mic inside — OR recording state */}
        {isRecording || isTranscribing ? (
          /* ── Recording / transcribing replaces the text input ── */
          <View style={styles.recordingInput}>
            {isTranscribing ? (
              <>
                <ActivityIndicator
                  size="small"
                  color={C.warn}
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.recordingInputText, { color: C.warn }]}>
                  Transcribing…
                </Text>
              </>
            ) : (
              <>
                <RecordingIndicator />
                <Text style={[styles.recordingInputText, { color: C.danger }]}>
                  {formatDuration(recordDuration)}
                </Text>
                <Text style={styles.recordingInputHint}>Recording...</Text>
              </>
            )}
          </View>
        ) : (
          /* ── Normal text input with mic icon inside right edge ── */
          <View style={styles.inputWrapper}>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              value={input}
              onChangeText={handleInputChange}
              placeholder="Message Ghost…"
              placeholderTextColor={C.textMuted}
              multiline
              maxLength={4000}
            />
            <TouchableOpacity
              style={styles.micInside}
              onPress={toggleRecording}
            >
              <Text style={styles.micInsideIcon}>🎤</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Stop button when recording / Send button otherwise */}
        {isRecording ? (
          <TouchableOpacity style={styles.stopBtn} onPress={stopRecording}>
            <View style={styles.stopDot} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (isStreaming ||
                isTranscribing ||
                (!input.trim() && !pendingMedia)) &&
                styles.sendBtnOff,
            ]}
            onPress={handleSend}
            disabled={
              isStreaming || isTranscribing || (!input.trim() && !pendingMedia)
            }
          >
            {isStreaming ? (
              <ActivityIndicator color={C.bg} size="small" />
            ) : (
              <Text style={styles.sendArrow}>↑</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: {
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 17,
    fontWeight: "800",
    color: C.accent,
    letterSpacing: 7,
  },
  headerStatus: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  searchBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#ffffff08",
  },
  searchBtnText: { color: C.textDim, fontSize: 16 },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.accentDim,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#00FF8840",
  },
  clearBtnOff: { opacity: 0.4 },
  clearBtnText: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  searchOverlay: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchIcon: { color: C.textDim, fontSize: 16 },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    paddingVertical: 4,
  },
  searchCount: { color: C.textDim, fontSize: 11 },

  // ── Slash suggestions — no absolute positioning ───────────────────────
  slashOverlay: {
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderBottomWidth: 0,
  },
  slashItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  slashCmd: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "700",
    minWidth: 72,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  slashDesc: { color: C.textDim, fontSize: 12, flex: 1 },

  // ── Messages ──────────────────────────────────────────────────────────
  msgList: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 20 },
  bubbleRow: { flexDirection: "row", gap: 8 },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAI: { justifyContent: "flex-start", alignItems: "flex-end" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: C.userBubble,
    borderWidth: 1,
    borderColor: "#00FF8828",
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  tsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 6,
  },
  ts: { color: C.textMuted, fontSize: 10 },
  statusIcon: { fontSize: 10, color: C.textDim },
  attachedImage: { width: 190, height: 130, borderRadius: 8, marginBottom: 8 },

  mediaPreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    padding: 8,
    gap: 8,
  },
  mediaThumb: { width: 38, height: 38, borderRadius: 6 },
  mediaLabel: { flex: 1, color: C.textDim, fontSize: 12 },
  mediaRemove: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF445520",
    borderRadius: 11,
  },
  // recordingBar removed — recording state lives inside the input bar
  offlineBanner: {
    backgroundColor: "#1A1A0A",
    borderTopWidth: 1,
    borderTopColor: "#3A3A1A",
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
  },
  offlineText: { color: C.warn, fontSize: 12, fontWeight: "600" },
  // ── Input bar ───────────────────────────────────────────────────────────
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },

  // + attach button
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#ffffff0A",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  attachBtnActive: {
    backgroundColor: C.accentDim,
    borderColor: C.accent,
  },
  attachBtnIcon: {
    color: C.textDim,
    fontSize: 22,
    fontWeight: "300",
    lineHeight: 26,
    includeFontPadding: false,
  },

  // attach tray
  attachTray: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  attachOption: {
    alignItems: "center",
    gap: 5,
  },
  attachOptionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#0D1F2D",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  attachOptionLabel: {
    color: C.textDim,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },

  // text input wrapper (holds input + inline mic)
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center", // keeps placeholder vertically centred
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
    color: C.text,
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
    lineHeight: 22,
    paddingVertical: 0, // wrapper padding handles vertical space
    // no background/border — wrapper handles it
  },

  // mic button inside the input
  micInside: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  micInsideIcon: { fontSize: 16 },

  // recording state replaces text input
  recordingInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#140808",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#3A1A1A",
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recordingInputText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  recordingInputHint: {
    color: C.textDim,
    fontSize: 11,
    marginLeft: "auto" as any,
  },

  // stop button (shown while recording)
  stopBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FF445522",
    borderWidth: 1.5,
    borderColor: C.danger,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  stopDot: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: C.danger,
  },

  // send button
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  sendBtnOff: { backgroundColor: "#1A3028", opacity: 0.6 },
  sendArrow: { color: C.bg, fontSize: 18, fontWeight: "900" },
  noConfigTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  noConfigSub: { color: C.textDim, fontSize: 14, marginTop: 10 },
});

// ─── Markdown styles ──────────────────────────────────────────────────────
const mkStyles: Record<string, any> = {
  // Base text
  body: {
    color: C.text,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 12,
    flexWrap: "wrap",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },

  // Headings
  heading1: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 24,
    marginTop: 20,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  heading2: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 20,
    marginTop: 18,
    marginBottom: 8,
  },
  heading3: {
    color: "#E0F0FF",
    fontWeight: "700",
    fontSize: 18,
    marginTop: 16,
    marginBottom: 6,
  },

  // Emphasis
  strong: { color: "#FFFFFF", fontWeight: "800" },
  em: { color: "#A8C8E8", fontStyle: "italic" },
  s: { color: C.textDim, textDecorationLine: "line-through" },

  // Inline code
  code_inline: {
    backgroundColor: "#1A2332",
    color: "#88FFCC",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 14,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#2A3A4A",
  },

  // Code block (fence)
  fence: {
    backgroundColor: "#050A0F",
    borderRadius: 12,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: "#1A2332",
    overflow: "hidden",
  },
  codeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111920",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1A2332",
  },
  codeLanguage: {
    color: "#4A6080",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  copyButton: {
    color: "#00FF88",
    fontSize: 11,
    fontWeight: "600",
  },
  code_block: {
    color: "#88FFCC",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 13,
    lineHeight: 20,
    padding: 14,
  },

  // Blockquote
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: C.accent,
    paddingLeft: 16,
    marginLeft: 0,
    marginVertical: 12,
    opacity: 0.9,
    backgroundColor: "#0F1A15",
    borderRadius: 4,
    paddingVertical: 10,
  },

  // Lists
  bullet_list: { marginVertical: 8 },
  ordered_list: { marginVertical: 8 },
  list_item: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bullet_list_icon: {
    color: C.accent,
    fontSize: 18,
    marginRight: 12,
    lineHeight: 24,
  },
  ordered_list_icon: {
    color: C.accent,
    fontSize: 16,
    marginRight: 12,
    fontWeight: "800",
    lineHeight: 24,
  },

  // Links
  link: { color: C.accent, textDecorationLine: "underline" },

  // Horizontal rule
  hr: { backgroundColor: C.border, height: 1, marginVertical: 16 },

  // Tables
  table: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    marginVertical: 12,
    overflow: "hidden",
    backgroundColor: "#050D14",
  },
  thead: { backgroundColor: "#0D1117" },
  tbody: { backgroundColor: "#050D14" },
  tr: { borderBottomWidth: 1, borderBottomColor: C.border },
  th: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  td: {
    color: C.text,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
};
