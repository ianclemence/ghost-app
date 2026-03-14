import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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

import {
  connectWebSocket,
  fetchHistory,
  onWSMessage,
  sendMessage,
  transcribeAudio,
  uploadFile,
} from "../../lib/ghostApi";
import { createStreamingPlaceholder, useGhostStore } from "../../lib/store";

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

// ─── Message Bubble ────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: any }) {
  const isUser = msg.role === "user";
  const isEmpty = msg.content === "" && !isUser;
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
        <Text style={styles.ts}>
          {new Date(msg.timestamp * 1000).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
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
    isConnected,
    setMessages,
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

  // Load history on mount / config change
  useEffect(() => {
    if (!config) return;
    fetchHistory(config, 60, 0)
      .then((data) => setMessages([...data.messages].reverse()))
      .catch(() => {});

    connectWebSocket(config);
    const unsub = onWSMessage((msg) => {
      if (msg.type === "assistant_message") {
        appendMessage({
          id: String(Date.now()),
          role: "assistant",
          content: msg.content,
          timestamp: Date.now() / 1000,
        });
      }
    });
    return unsub;
  }, [config]);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  // ── Send ──────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!config || (!input.trim() && !pendingMedia) || isStreaming) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const text = input.trim();
    setInput("");
    const media = pendingMedia;
    setPendingMedia(null);

    appendMessage({
      id: String(Date.now()),
      role: "user",
      content: text || "📎 Attachment",
      timestamp: Date.now() / 1000,
      media_url: media?.uri,
    });

    appendMessage(createStreamingPlaceholder());
    setStreaming(true);

    await sendMessage(config, {
      content: text,
      mediaB64: media?.b64,
      mediaType: media?.mimeType,
      onChunk: appendStream,
      onDone: () => commitStream(),
      onError: (err) => {
        commitStream();
        appendMessage({
          id: String(Date.now()),
          role: "assistant",
          content: `⚠️ ${err}`,
          timestamp: Date.now() / 1000,
        });
      },
    });
  }, [config, input, pendingMedia, isStreaming]);

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
        // Fallback: attach as audio message if transcription unavailable
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
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom + 60 : 0}
      enabled={Platform.OS === "ios"}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>GHOST</Text>
          <View style={styles.headerStatus}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? C.accent : C.danger },
              ]}
            />
            <Text
              style={[
                styles.statusLabel,
                { color: isConnected ? C.accent : C.danger },
              ]}
            >
              {isConnected ? "ONLINE" : "OFFLINE"}
            </Text>
          </View>
        </View>
        {isStreaming && (
          <View style={styles.streamingBadge}>
            <ActivityIndicator
              size="small"
              color={C.accent}
              style={{ transform: [{ scale: 0.7 }] }}
            />
            <Text style={styles.streamingText}>thinking</Text>
          </View>
        )}
      </View>

      {/* ── Messages ── */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => <MessageBubble msg={item} />}
        contentContainerStyle={styles.msgList}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
        showsVerticalScrollIndicator={false}
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

      {/* ── Input bar ── */}
      <View
        style={[
          styles.inputBar,
          { paddingBottom: Platform.OS === "ios" ? Math.max(insets.bottom, 8) + 2 : 8 },
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
  streamingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.accentDim,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#00FF8840",
  },
  streamingText: {
    color: C.accent,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace",
  },
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
  ts: { color: C.textMuted, fontSize: 10, marginTop: 5, textAlign: "right" },
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
