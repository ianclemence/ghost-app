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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
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

// ─── Recording pulse indicator ─────────────────────────────────────────────
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

// ─── Status indicator for user messages ────────────────────────────────────
function MessageStatusIcon({ status }: { status?: string }) {
  if (status === "sending") {
    return <Text style={styles.statusIcon}>⏱</Text>;
  }
  if (status === "completed" || status === "streaming") {
    return <Text style={[styles.statusIcon, { color: C.accent }]}>✓</Text>;
  }
  if (status === "failed") {
    return <Text style={[styles.statusIcon, { color: C.danger }]}>✗</Text>;
  }
  return null;
}

// ─── Connection indicator ──────────────────────────────────────────────────
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

// ─── Quick Actions ─────────────────────────────────────────────────────────
function QuickActions({ onSelect }: { onSelect: (text: string) => void }) {
  const suggestions = [
    "Tell me more",
    "Can you explain?",
    "What else?",
    "Summarize that",
  ];
  return (
    <View style={styles.quickActions}>
      {suggestions.map((s) => (
        <TouchableOpacity
          key={s}
          style={styles.quickActionBtn}
          onPress={() => onSelect(s)}
          activeOpacity={0.7}
        >
          <Text style={styles.quickActionText}>{s}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Search bar ────────────────────────────────────────────────────────────
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

// ─── Message Bubble ────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ExtendedMessage }) {
  const isUser = msg.role === "user";
  const isEmpty = msg.content === "" && !isUser;
  const isError = msg.status === "failed" && msg.errorKind;

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
          <Image
            source={{ uri: msg.media_url }}
            style={styles.attachedImage}
            resizeMode="cover"
          />
        )}
        {isEmpty ? (
          <TypingDots />
        ) : isUser ? (
          <Text style={styles.userText}>{msg.content}</Text>
        ) : (
          <Markdown style={mkStyles}>{msg.content}</Markdown>
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
  const localIdSeq = useRef(0);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSendAtRef = useRef(0);
  const [activeError, setActiveError] = useState<{
    error: GhostError;
    partialContent?: string;
  } | null>(null);

  // Search state
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(0);

  // Loading older messages
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);

  const makeLocalMessageId = () => {
    localIdSeq.current += 1;
    return `local-${Date.now()}-${localIdSeq.current}`;
  };
  const normalizeAssistantContent = (text: string) =>
    text.replace(/\s+/g, " ").trim();

  // ── Health polling (30s) ──────────────────────────────────────────────
  useEffect(() => {
    if (!config) return;
    let active = true;

    const poll = async () => {
      if (!active || !config) return;
      const ok = await checkHealth(config);
      if (active) {
        setConnectionState(ok ? "online" : "offline");
      }
    };

    poll(); // immediate
    const interval = setInterval(poll, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [config, setConnectionState]);

  // ── WebSocket state tracking ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onWSStateChange((state) => {
      if (state === "connected") {
        setConnectionState("online");
      } else if (state === "reconnecting") {
        setConnectionState("syncing");
      }
      // Don't set offline from WS — health poll handles that
    });
    return unsub;
  }, [setConnectionState]);

  // Load history on mount / config change
  useEffect(() => {
    if (!config) return;
    fetchHistory(config, 60, 0)
      .then((data) => {
        setMessages(
          [...data.messages].reverse().map((m) => ({
            ...m,
            status: "completed" as const,
          })),
        );
        setTotalMessages(data.total);
      })
      .catch(() => {});

    connectWebSocket(config);
    const unsub = onWSMessage((msg) => {
      if (msg.type === "assistant_message") {
        const state = useGhostStore.getState();
        const incoming = normalizeAssistantContent(msg.content ?? "");
        if (!incoming) return;

        // --- Dedup: Suppress during active stream ---
        if (state.isStreaming) return;
        if (Date.now() - lastSendAtRef.current > 120000) return;

        // --- Dedup: Content-hash check within 3s window ---
        if (
          state._lastCommitTime &&
          Date.now() - state._lastCommitTime < 3000
        ) {
          if (
            normalizeAssistantContent(state._lastCommitContent) === incoming
          ) {
            console.log(
              "[dedup] WS message suppressed (content match within 3s window)",
            );
            return;
          }
        }

        // --- Dedup: Check if last message is identical ---
        const last = state.messages[state.messages.length - 1];
        if (
          last?.role === "assistant" &&
          normalizeAssistantContent(last.content) === incoming
        ) {
          return;
        }

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

  // Flush offline queue when coming online
  useEffect(() => {
    if (connectionState === "online" && config) {
      const queued = dequeueMessages();
      for (const msg of queued) {
        doSend(msg.content, msg.mediaB64, msg.mediaType);
      }
    }
  }, [connectionState]);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  // Search filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(0);
      return;
    }
    const q = searchQuery.toLowerCase();
    const count = messages.filter((m) =>
      m.content.toLowerCase().includes(q),
    ).length;
    setSearchResults(count);
  }, [searchQuery, messages]);

  // ── Load older messages (pull-to-load) ─────────────────────────────────
  const loadOlderMessages = useCallback(async () => {
    if (!config || loadingOlder || messages.length >= totalMessages) return;
    setLoadingOlder(true);
    try {
      const data = await fetchHistory(config, 30, messages.length);
      const older = [...data.messages].reverse().map((m) => ({
        ...m,
        status: "completed" as const,
      }));
      setMessages([...older, ...messages]);
      setTotalMessages(data.total);
    } catch {}
    setLoadingOlder(false);
  }, [config, messages, loadingOlder, totalMessages, setMessages]);

  // ── Core send logic ──────────────────────────────────────────────────
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
        status: "sending",
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      appendMessage(createStreamingPlaceholder());
      setStreaming(true);
      setActiveError(null);
      setLastSentMessage({ content: text, mediaB64, mediaType });

      // 30s stuck-placeholder fallback
      streamTimeoutRef.current = setTimeout(() => {
        const state = useGhostStore.getState();
        if (state.isStreaming) {
          console.log("[ghost] 30s stream placeholder timeout — committing");
          commitStream();
        }
      }, 30_000);

      // Update user message to "delivered" once stream starts
      const firstChunkReceived = { current: false };

      await sendMessage(config, {
        content: text,
        mediaB64,
        mediaType,
        onChunk: (chunk) => {
          if (!firstChunkReceived.current) {
            firstChunkReceived.current = true;
            updateMessageStatus(userMsgId, "completed");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          appendStream(chunk);
        },
        onDone: (fullText) => {
          if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
          const hasReply = fullText.trim().length > 0;
          commitStream();
          if (hasReply) {
            updateMessageStatus(userMsgId, "completed");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            updateMessageStatus(userMsgId, "failed");
            setActiveError({
              error: {
                kind: "empty_stream",
                message:
                  "Ghost marked the request complete but returned no response.",
                retryable: true,
              },
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        },
        onError: (err) => {
          if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
          const state = useGhostStore.getState();
          const partial = state.streamBuffer;
          commitStream();
          updateMessageStatus(userMsgId, "failed");

          // Remove the empty/partial assistant placeholder
          const msgs = useGhostStore.getState().messages;
          const lastMsg = msgs[msgs.length - 1];
          if (lastMsg?.role === "assistant" && lastMsg.content.trim() === "") {
            removeMessage(lastMsg.id);
          }

          setActiveError({
            error: err,
            partialContent:
              partial && partial.trim().length > 0 ? partial : undefined,
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
    setInput("");
    const media = pendingMedia;
    setPendingMedia(null);

    // Queue if offline
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

  const handleDismissError = useCallback(() => {
    setActiveError(null);
  }, []);

  // ── Quick action ──────────────────────────────────────────────────────
  const handleQuickAction = useCallback((text: string) => {
    setInput(text);
  }, []);

  // ── Image picker ─────────────────────────────────────────────────────
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0].base64) {
      setPendingMedia({
        uri: result.assets[0].uri,
        b64: result.assets[0].base64,
        mimeType: "image/jpeg",
      });
    }
  };

  // ── Document picker ───────────────────────────────────────────────────
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
      setPendingMedia({ uri: asset.uri, b64, mimeType: mime_type });
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
      if (transcript) {
        setInput((prev) => (prev ? prev + " " + transcript : transcript));
      } else {
        setInput(
          (prev) => prev + " [Voice message — transcription unavailable]",
        );
      }
    }
    setIsTranscribing(false);
    setRecordDuration(0);
  };

  const toggleRecording = () =>
    isRecording ? stopRecording() : startRecording();

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const handleClearChat = useCallback(() => {
    if (!config) return;

    // If streaming, cancel first
    if (isStreaming) {
      if (streamTimeoutRef.current) clearTimeout(streamTimeoutRef.current);
      commitStream();
    }

    Alert.alert(
      "Clear chat?",
      "This will archive the current mobile chat history. Ghost's long-term memory is unaffected.",
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

  // Filtered messages for search
  const displayMessages = searchQuery.trim()
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : messages;

  // Determine if we should show quick actions
  const showQuickActions =
    !isStreaming &&
    !activeError &&
    messages.length > 0 &&
    messages[messages.length - 1]?.role === "assistant" &&
    messages[messages.length - 1]?.status === "completed";

  // ── No config state ────────────────────────────────────────────────────
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
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
        showsVerticalScrollIndicator={false}
        // Pull-to-load-older messages
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
          <>
            {/* Error card */}
            {activeError && (
              <View style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                <ErrorCard
                  error={activeError.error}
                  partialContent={activeError.partialContent}
                  onRetry={
                    activeError.error.retryable ? handleRetry : undefined
                  }
                  onDismiss={handleDismissError}
                />
              </View>
            )}
            {/* Quick actions */}
            {showQuickActions && <QuickActions onSelect={handleQuickAction} />}
          </>
        }
      />

      {/* ── Pending media preview ── */}
      {pendingMedia && (
        <View style={styles.mediaPreview}>
          <Image source={{ uri: pendingMedia.uri }} style={styles.mediaThumb} />
          <Text style={styles.mediaLabel} numberOfLines={1}>
            Image attached
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

      {/* ── Recording indicator ── */}
      {(isRecording || isTranscribing) && (
        <View style={styles.recordingBar}>
          {isTranscribing ? (
            <>
              <ActivityIndicator
                size="small"
                color={C.warn}
                style={{ transform: [{ scale: 0.8 }] }}
              />
              <Text style={[styles.recordingText, { color: C.warn }]}>
                Transcribing...
              </Text>
            </>
          ) : (
            <>
              <RecordingIndicator />
              <Text style={[styles.recordingText, { color: C.danger }]}>
                Recording {formatDuration(recordDuration)}
              </Text>
              <Text style={styles.recordingHint}>Tap mic to stop</Text>
            </>
          )}
        </View>
      )}

      {/* ── Offline queue indicator ── */}
      {connectionState === "offline" && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            📡 Offline — messages will be sent when reconnected
          </Text>
        </View>
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
        <TouchableOpacity style={styles.iconBtn} onPress={pickImage}>
          <Text style={styles.iconTxt}>🖼</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={pickDocument}>
          <Text style={styles.iconTxt}>📄</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder={isTranscribing ? "Transcribing…" : "Message Ghost…"}
          placeholderTextColor={C.textMuted}
          multiline
          maxLength={4000}
          editable={!isTranscribing}
        />
        <TouchableOpacity
          style={[styles.iconBtn, isRecording && styles.iconBtnActive]}
          onPress={toggleRecording}
          disabled={isTranscribing}
        >
          <Text style={styles.iconTxt}>{isRecording ? "⏹" : "🎤"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sendBtn,
            (isStreaming || (!input.trim() && !pendingMedia)) &&
              styles.sendBtnOff,
          ]}
          onPress={handleSend}
          disabled={isStreaming || (!input.trim() && !pendingMedia)}
        >
          {isStreaming ? (
            <ActivityIndicator color={C.bg} size="small" />
          ) : (
            <Text style={styles.sendArrow}>↑</Text>
          )}
        </TouchableOpacity>
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
  clearBtnOff: {
    opacity: 0.4,
  },
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
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    paddingVertical: 4,
  },
  searchCount: { color: C.textDim, fontSize: 11 },
  msgList: { paddingHorizontal: 10, paddingVertical: 14, gap: 10 },
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
    paddingVertical: 9,
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
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  tsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 5,
  },
  ts: { color: C.textMuted, fontSize: 10, textAlign: "right" },
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
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1A0A0A",
    borderTopWidth: 1,
    borderTopColor: "#3A1A1A",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  recordingText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  recordingHint: { color: C.textDim, fontSize: 11, marginLeft: "auto" },
  offlineBanner: {
    backgroundColor: "#1A1A0A",
    borderTopWidth: 1,
    borderTopColor: "#3A3A1A",
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
  },
  offlineText: {
    color: C.warn,
    fontSize: 12,
    fontWeight: "600",
  },
  quickActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  quickActionBtn: {
    backgroundColor: C.accentDim,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#00FF8830",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickActionText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#ffffff08",
  },
  iconBtnActive: {
    backgroundColor: "#FF445522",
    borderWidth: 1,
    borderColor: "#FF445540",
  },
  iconTxt: { fontSize: 17 },
  textInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 110,
    color: C.text,
    backgroundColor: "#ffffff08",
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 8,
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    borderWidth: 1,
    borderColor: C.border,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnOff: { backgroundColor: C.textMuted, opacity: 0.3 },
  sendArrow: { color: C.bg, fontSize: 17, fontWeight: "900" },
  noConfigTitle: {
    color: C.text,
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  noConfigSub: { color: C.textDim, fontSize: 14, marginTop: 10 },
});

const mkStyles = {
  body: {
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  } as any,
  code_inline: {
    backgroundColor: "#00FF8814",
    color: C.accent,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 13,
  } as any,
  fence: {
    backgroundColor: "#080F18",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  } as any,
  code_block: {
    color: C.accent,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
    fontSize: 13,
  } as any,
  link: { color: C.accent } as any,
  strong: { color: "#FFFFFF", fontWeight: "700" as const },
  heading1: { color: "#FFF", fontWeight: "800" as const, fontSize: 19 },
  heading2: { color: "#FFF", fontWeight: "700" as const, fontSize: 16 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: C.accent,
    paddingLeft: 10,
    opacity: 0.8,
  } as any,
  hr: { backgroundColor: C.border, height: 1 } as any,
};
