import { ArrowLeft, Paperclip, Send, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Image as RNImage,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";

import { Fonts, Ghost, Radius, Space, Type } from "@/constants/theme";
import { EmberIndicator } from "@/components/ember";
import { useGhostStore, ExtendedMessage } from "@/lib/store";
import { cleanTitleText } from "@/lib/format";
import {
  fetchHistory,
  sendMessage,
  uploadFile,
  normalizeSession,
  onWSMessage,
  respondClarify,
} from "@/lib/ghostApi";

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { prompt, sessionId, attach, title } = useLocalSearchParams<{
    prompt?: string;
    sessionId?: string;
    attach?: string;
    title?: string;
  }>();
  const {
    config,
    currentSession,
    messages,
    setMessages,
    appendMessage,
    removeMessage,
    isStreaming,
    setStreaming,
    appendStream,
    commitStream,
    clearStreamBuffer,
    toolActivity,
    setToolActivity,
    setLastSentMessage,
    lastSentMessage,
    clarifyRequest,
    setClarifyRequest,
  } = useGhostStore();
  const [clarifyAnswer, setClarifyAnswer] = useState("");
  const [clarifySending, setClarifySending] = useState(false);
  const [clarifyError, setClarifyError] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const nearBottom = useRef(true);
  const [pendingMedia, setPendingMedia] = useState<{
    uri: string;
    mimeType: string;
    filename: string;
    type: "image" | "file";
    base64?: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const appliedPrompt = useRef<string | null>(null);

  useEffect(() => {
    if (typeof sessionId === "string" && sessionId.trim()) {
      const target = sessionId.trim();
      if (useGhostStore.getState().currentSession !== target) {
        useGhostStore.getState().setCurrentSession(target);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    const key = `${typeof sessionId === "string" ? sessionId : ""}|${typeof prompt === "string" ? prompt : ""}`;
    if (typeof prompt === "string" && prompt.trim() && appliedPrompt.current !== key) {
      appliedPrompt.current = key;
      setInput(prompt);
      inputRef.current?.focus();
    }
  }, [prompt, sessionId]);

  useEffect(() => {
    const off = onWSMessage((msg) => {
      const t = typeof msg.type === "string" ? msg.type : (msg.metadata as any)?.type;
      if (t !== "clarify_request") return;
      const meta = (msg.metadata ?? {}) as any;
      const qid = typeof meta.question_id === "string" ? meta.question_id : typeof msg.id === "string" ? msg.id : "";
      const question = typeof msg.content === "string" && msg.content ? msg.content : typeof meta.question === "string" ? meta.question : "";
      const choices = Array.isArray(meta.choices) ? meta.choices.filter((c: any) => typeof c === "string") : [];
      if (!qid || !question) return;
      if (msg.session_id && msg.session_id !== useGhostStore.getState().currentSession) return;
      setClarifyRequest({ questionId: qid, question, choices });
      setClarifyError(null);
      setClarifyAnswer("");
    });
    return off;
  }, [setClarifyRequest]);

  useEffect(() => {
    if (!config) return;
    const session = currentSession || normalizeSession(config.session);
    let cancelled = false;
    const loadHistory = async () => {
      setHistoryError(null);
      try {
        const { messages: history } = await fetchHistory(
          config,
          50,
          0,
          undefined,
          session,
        );
        if (!cancelled) setMessages(history);
      } catch {
        if (!cancelled) setHistoryError("Couldn't load history. Pull to retry.");
      }
    };
    clearStreamBuffer();
    setSendError(null);
    setToolActivity(null);
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [config, currentSession]);

  const pickImage = useCallback(async (useCamera: boolean) => {
    try {
      const launcher = useCamera
        ? ImagePicker.launchCameraAsync
        : ImagePicker.launchImageLibraryAsync;
      const result = await launcher({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setPendingMedia({
          uri: asset.uri,
          mimeType: asset.mimeType ?? "image/jpeg",
          filename: asset.fileName ?? `photo-${Date.now()}.jpg`,
          type: "image",
          base64: asset.base64 ?? undefined,
        });
      }
    } catch {
      // User cancelled or permission denied
    }
  }, []);

  const pickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setPendingMedia({
          uri: asset.uri,
          mimeType: asset.mimeType ?? "application/octet-stream",
          filename: asset.name ?? `file-${Date.now()}`,
          type: "file",
        });
      }
    } catch {
      // User cancelled
    }
  }, []);

  const showAttachmentOptions = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take Photo", "Choose Photo", "Choose File"],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) pickImage(true);
          else if (buttonIndex === 2) pickImage(false);
          else if (buttonIndex === 3) pickFile();
        },
      );
    } else {
      Alert.alert("Attach", "Choose an option", [
        { text: "Cancel", style: "cancel" },
        { text: "Take Photo", onPress: () => pickImage(true) },
        { text: "Choose Photo", onPress: () => pickImage(false) },
        { text: "Choose File", onPress: pickFile },
      ]);
    }
  }, [pickImage, pickFile]);

  const appliedAttach = useRef<string | null>(null);
  useEffect(() => {
    if (typeof attach !== "string" || !attach) return;
    const key = `${typeof sessionId === "string" ? sessionId : ""}|${attach}`;
    if (appliedAttach.current === key) return;
    appliedAttach.current = key;
    const t = setTimeout(() => {
      if (attach === "camera") pickImage(true);
      else if (attach === "photo") pickImage(false);
      else if (attach === "file") pickFile();
    }, 350);
    return () => clearTimeout(t);
  }, [attach, sessionId, pickImage, pickFile]);

  const handleSend = useCallback(async (retryText?: string) => {
    if (!config || isStreaming) return;
    const text = (retryText ?? input).trim();
    if (!text && !pendingMedia && !retryText) return;

    const activeMedia = retryText ? undefined : pendingMedia;
    const userMessage: ExtendedMessage = {
      id: `temp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      role: "user",
      content: text || (activeMedia ? `[${activeMedia.type === "image" ? "Image" : "File"}: ${activeMedia.filename}]` : ""),
      timestamp: Date.now(),
      status: "sending",
    };

    appendMessage(userMessage);

    const assistantId = `temp-assistant-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const assistantPlaceholder: ExtendedMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      status: "streaming",
    };
    appendMessage(assistantPlaceholder);

    const mediaB64 = activeMedia?.base64;
    const mediaType = activeMedia?.mimeType;
    const sessionAtSend = currentSession || normalizeSession(config.session);
    setLastSentMessage({ content: text, mediaB64, mediaType });
    if (!retryText) {
      setPendingMedia(null);
      setInput("");
    }
    setSendError(null);
    setStreaming(true);
    setToolActivity(null);

    const fail = (message: string) => {
      removeMessage(assistantId);
      setStreaming(false);
      setToolActivity(null);
      setSendError(message);
    };

    try {
      let finalB64 = mediaB64;
      let finalType = mediaType;
      if (activeMedia && !mediaB64) {
        setUploading(true);
        try {
          const uploaded = await uploadFile(
            config,
            activeMedia.uri,
            activeMedia.mimeType,
            activeMedia.filename,
          );
          finalB64 = uploaded.b64;
          finalType = uploaded.mime_type || activeMedia.mimeType;
        } finally {
          setUploading(false);
        }
      }
      await sendMessage(config, {
        content: text || "",
        mediaB64: finalB64,
        mediaType: finalType,
        sessionKey: sessionAtSend,
        onChunk: (token) => {
          if (useGhostStore.getState().currentSession !== sessionAtSend) return;
          appendStream(token);
        },
        onToolStatus: (_tool, label) => setToolActivity(label),
        onDone: (fullText) => {
          if (useGhostStore.getState().currentSession !== sessionAtSend) {
            setStreaming(false);
            return;
          }
          if (!fullText.trim()) {
            fail("Ghost didn't respond. Try rephrasing.");
            return;
          }
          commitStream();
        },
        onError: (err) => fail(err.message),
      });
    } catch {
      fail("Can't reach Ghost — check connection and retry.");
    }
  }, [config, input, isStreaming, currentSession, pendingMedia]);

  const renderMessage = useCallback(
    ({ item }: { item: ExtendedMessage; index: number }) => {
      const isUser = item.role === "user";
      if (!isUser && !item.content.trim()) {
        return (
          <View style={styles.messageBlock}>
            <Text style={styles.messageLabel}>Ghost</Text>
            <Text style={styles.thinkingText}>{toolActivity ?? "Thinking…"}</Text>
          </View>
        );
      }
      return (
        <View style={styles.messageBlock}>
          <Text style={[styles.messageLabel, isUser && styles.messageLabelUser]}>
            {isUser ? "You" : "Ghost"}
          </Text>
          {isUser ? (
            <View style={styles.userBubble}>
              <Text style={styles.userText}>{item.content}</Text>
            </View>
          ) : (
            <Markdown style={markdownStyles as any}>{item.content}</Markdown>
          )}
        </View>
      );
    },
    [toolActivity],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.backButton}
          hitSlop={12}
          accessibilityLabel="Go back"
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={Ghost.text.secondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {typeof title === "string" && cleanTitleText(title) ? cleanTitleText(title) : "Ghost"}
          </Text>
          {isStreaming && (
            <EmberIndicator state="thinking" size={6} style={{ marginLeft: Space.xs }} />
          )}
        </View>
        <View style={styles.headerRight} />
      </View>

      {historyError ? (
        <TouchableOpacity
          style={styles.inlineError}
          onPress={() => {
            setHistoryError(null);
            if (!config) return;
            fetchHistory(config, 50, 0, undefined, currentSession || normalizeSession(config.session))
              .then(({ messages: history }) => setMessages(history))
              .catch(() => setHistoryError("Couldn't load history. Tap to retry."));
          }}
        >
          <Text style={styles.inlineErrorText}>{historyError} Tap to retry.</Text>
        </TouchableOpacity>
      ) : null}
      {toolActivity && !isStreaming ? null : null}
      {/* Messages */}
      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={[
          styles.messageList,
          { paddingBottom: insets.bottom + Space.xl },
        ]}
        showsVerticalScrollIndicator={false}
        inverted={false}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          nearBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
        }}
        scrollEventThrottle={200}
        onContentSizeChange={() => {
          if (nearBottom.current) flatListRef.current?.scrollToEnd({ animated: true });
        }}
      />
      {clarifyRequest ? (
        <View style={styles.clarifyCard}>
          <Text style={styles.clarifyTitle}>Ghost needs a detail</Text>
          <Text style={styles.clarifyQuestion}>{clarifyRequest.question}</Text>
          {clarifyRequest.choices.length > 0 ? (
            <View style={styles.chipRow}>
              {clarifyRequest.choices.map((c) => (
                <TouchableOpacity key={c} style={styles.chip} onPress={() => setClarifyAnswer(c)}>
                  <Text style={styles.chipText} numberOfLines={1}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <View style={styles.clarifyInputRow}>
            <TextInput
              value={clarifyAnswer}
              onChangeText={(t) => {
                setClarifyAnswer(t);
                if (clarifyError) setClarifyError(null);
              }}
              placeholder="Type your answer…"
              placeholderTextColor={Ghost.text.tertiary}
              style={styles.clarifyInput}
              editable={!clarifySending}
              returnKeyType="send"
              onSubmitEditing={() => {
                if (!config || !clarifyAnswer.trim() || clarifySending) return;
                setClarifySending(true);
                respondClarify(config, clarifyRequest.questionId, clarifyAnswer.trim()).then((r) => {
                  setClarifySending(false);
                  if (r.ok) {
                    setClarifyRequest(null);
                    setClarifyAnswer("");
                  } else {
                    setClarifyError(r.error ?? "Couldn't send answer. Try again.");
                  }
                });
              }}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!clarifyAnswer.trim() || clarifySending) && styles.sendButtonDisabled]}
              disabled={!clarifyAnswer.trim() || clarifySending}
              onPress={() => {
                if (!config || !clarifyAnswer.trim() || clarifySending) return;
                setClarifySending(true);
                respondClarify(config, clarifyRequest.questionId, clarifyAnswer.trim()).then((r) => {
                  setClarifySending(false);
                  if (r.ok) {
                    setClarifyRequest(null);
                    setClarifyAnswer("");
                  } else {
                    setClarifyError(r.error ?? "Couldn't send answer. Try again.");
                  }
                });
              }}
              accessibilityLabel="Send clarification answer"
            >
              <Send size={18} color={Ghost.text.primary} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          {clarifyError ? <Text style={styles.clarifyError}>{clarifyError}</Text> : null}
        </View>
      ) : null}
      {sendError ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>{sendError}</Text>
          <TouchableOpacity
            onPress={() => {
              const retry = lastSentMessage?.content ?? "";
              setSendError(null);
              if (retry) handleSend(retry);
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + Space.sm }]}>
        {/* Media Preview */}
        {pendingMedia && (
          <View style={styles.previewContainer}>
            {pendingMedia.type === "image" ? (
              <RNImage source={{ uri: pendingMedia.uri }} style={styles.previewImage} />
            ) : (
              <View style={styles.previewFile}>
                <Text style={styles.previewFileName} numberOfLines={1}>
                  {pendingMedia.filename}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.previewRemove}
              onPress={() => setPendingMedia(null)}
            >
              <X size={14} color={Ghost.text.primary} />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputRow}>
          <TouchableOpacity
            style={styles.attachButton}
            activeOpacity={0.7}
            hitSlop={10}
            accessibilityLabel="Attach a photo or file"
            onPress={showAttachmentOptions}
          >
            <Paperclip size={20} color={Ghost.text.secondary} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={input}
            onChangeText={(t) => {
              setInput(t);
              if (sendError) setSendError(null);
            }}
            placeholder={uploading ? "Uploading..." : "Message Ghost..."}
            placeholderTextColor={Ghost.text.tertiary}
            multiline
            maxLength={2000}
            onSubmitEditing={() => handleSend()}
            blurOnSubmit={false}
            editable={!uploading}
          />
          {(input.trim().length > 0 || pendingMedia) && (
            <TouchableOpacity
              style={[styles.sendButton, uploading && styles.sendButtonDisabled]}
              activeOpacity={0.7}
              hitSlop={10}
              accessibilityLabel="Send message"
              onPress={() => handleSend()}
              disabled={uploading}
            >
              <Send size={18} color={Ghost.text.primary} strokeWidth={2.5} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Ghost.border.subtle,
  },
  backButton: {
    padding: Space.sm,
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Type.headline,
    color: Ghost.text.primary,
  },
  headerRight: {
    width: 40,
  },
  messageList: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
  },
  messageBlock: {
    paddingVertical: Space.lg,
  },
  messageLabel: {
    ...Type.caption,
    color: Ghost.text.tertiary,
    marginBottom: Space.sm,
  },
  messageLabelUser: {
    color: Ghost.text.secondary,
  },
  userBubble: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  userText: {
    ...Type.body,
    color: Ghost.text.primary,
  },
  thinkingText: {
    ...Type.callout,
    color: Ghost.text.tertiary,
  },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.md,
    marginHorizontal: Space.xl,
    marginBottom: Space.sm,
    backgroundColor: Ghost.bg.raised,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  inlineErrorText: {
    ...Type.subhead,
    color: Ghost.text.secondary,
    flex: 1,
  },
  retryText: {
    ...Type.subhead,
    color: Ghost.accent.primary,
    fontWeight: "600",
  },
  clarifyCard: {
    marginHorizontal: Space.xl,
    marginBottom: Space.sm,
    backgroundColor: Ghost.bg.raised,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: Radius.lg,
    padding: Space.md,
    gap: Space.sm,
  },
  clarifyTitle: {
    ...Type.caption,
    color: Ghost.text.tertiary,
  },
  clarifyQuestion: {
    ...Type.body,
    color: Ghost.text.primary,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: Radius.full,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    maxWidth: "100%",
  },
  chipText: {
    ...Type.subhead,
    color: Ghost.text.primary,
  },
  clarifyInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  clarifyInput: {
    ...Type.body,
    color: Ghost.text.primary,
    flex: 1,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  clarifyError: {
    ...Type.subhead,
    color: Ghost.status.error,
  },
  inputContainer: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.sm,
    backgroundColor: Ghost.bg.base,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space.sm,
  },
  attachButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  textInput: {
    ...Type.body,
    flex: 1,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    color: Ghost.text.primary,
    maxHeight: 120,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Ghost.accent.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Space.sm,
    gap: Space.sm,
  },
  previewImage: {
    width: 64,
    height: 64,
    borderRadius: Radius.md,
    backgroundColor: Ghost.bg.sunken,
  },
  previewFile: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Ghost.bg.sunken,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
    paddingHorizontal: Space.md,
    justifyContent: "center",
  },
  previewFileName: {
    ...Type.body,
    color: Ghost.text.primary,
    fontSize: 13,
  },
  previewRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Ghost.bg.raised,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
});

const markdownStyles = {
  body: {
    color: Ghost.text.primary,
    fontSize: 16,
    lineHeight: 24,
  },
  paragraph: {
    color: Ghost.text.primary,
    fontSize: 16,
    lineHeight: 24,
    marginVertical: Space.sm,
  },
  text: {
    color: Ghost.text.primary,
    fontSize: 16,
    lineHeight: 24,
  },
  heading1: {
    color: Ghost.text.primary,
    fontWeight: "700",
    fontSize: 24,
    lineHeight: 30,
    marginVertical: Space.md,
  },
  heading2: {
    color: Ghost.text.primary,
    fontWeight: "700",
    fontSize: 20,
    lineHeight: 26,
    marginVertical: Space.md,
  },
  heading3: {
    color: Ghost.text.primary,
    fontWeight: "600",
    fontSize: 17,
    lineHeight: 23,
    marginVertical: Space.sm,
  },
  heading4: {
    color: Ghost.text.primary,
    fontWeight: "600",
    fontSize: 16,
    lineHeight: 22,
    marginVertical: Space.sm,
  },
  strong: {
    color: Ghost.text.primary,
    fontWeight: "700",
  },
  em: {
    color: Ghost.text.primary,
    fontStyle: "italic",
  },
  link: {
    color: Ghost.accent.primary,
    textDecorationLine: "underline",
  },
  code_inline: {
    backgroundColor: Ghost.bg.sunken,
    color: Ghost.text.primary,
    fontFamily: Fonts.mono,
    borderRadius: Radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 14,
  },
  fence: {
    backgroundColor: Ghost.bg.sunken,
    borderRadius: Radius.md,
    padding: Space.md,
    marginVertical: Space.sm,
  },
  code_block: {
    color: Ghost.text.primary,
    fontFamily: Fonts.mono,
    fontSize: 14,
    lineHeight: 20,
  },
  bullet_list: {
    marginVertical: Space.sm,
  },
  ordered_list: {
    marginVertical: Space.sm,
  },
  list_item: {
    color: Ghost.text.primary,
    fontSize: 16,
    lineHeight: 24,
    marginVertical: 2,
  },
  bullet_list_icon: {
    color: Ghost.text.secondary,
    fontSize: 16,
    lineHeight: 24,
  },
  ordered_list_icon: {
    color: Ghost.text.secondary,
    fontSize: 16,
    lineHeight: 24,
  },
  blockquote: {
    backgroundColor: Ghost.accent.soft,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    marginVertical: Space.sm,
    color: Ghost.text.secondary,
  },
  hr: {
    backgroundColor: Ghost.border.subtle,
    height: 1,
    marginVertical: Space.md,
  },
  table: {
    borderColor: Ghost.border.default,
    borderRadius: Radius.sm,
    marginVertical: Space.sm,
  },
  thead: {
    backgroundColor: Ghost.bg.sunken,
  },
  th: {
    color: Ghost.text.primary,
    fontWeight: "700",
    padding: Space.sm,
    borderColor: Ghost.border.default,
  },
  td: {
    color: Ghost.text.primary,
    padding: Space.sm,
    borderColor: Ghost.border.default,
  },
  image: {
    borderRadius: Radius.md,
    marginVertical: Space.sm,
  },
};
