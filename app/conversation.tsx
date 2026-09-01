import { ArrowLeft, Paperclip, Send, X } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
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
import {
  fetchHistory,
  sendMessage,
  uploadFile,
  normalizeSession,
} from "@/lib/ghostApi";

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    config,
    currentSession,
    messages,
    setMessages,
    appendMessage,
    isStreaming,
    setStreaming,
    streamBuffer,
    appendStream,
    commitStream,
  } = useGhostStore();

  const [input, setInput] = useState("");
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

  useEffect(() => {
    if (!config) return;
    const session = currentSession || normalizeSession(config.session);
    const loadHistory = async () => {
      try {
        const { messages: history } = await fetchHistory(
          config,
          50,
          0,
          undefined,
          session,
        );
        setMessages(history);
      } catch {
        // Fine
      }
    };
    loadHistory();
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

  const handleSend = useCallback(async () => {
    if (!config || isStreaming) return;
    const text = input.trim();
    if (!text && !pendingMedia) return;

    const userMessage: ExtendedMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text || (pendingMedia ? `[${pendingMedia.type === "image" ? "Image" : "File"}: ${pendingMedia.filename}]` : ""),
      timestamp: Date.now(),
      status: "sending",
    };

    appendMessage(userMessage);

    const assistantPlaceholder: ExtendedMessage = {
      id: `temp-assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      status: "streaming",
    };
    appendMessage(assistantPlaceholder);

    const mediaB64 = pendingMedia?.base64;
    const mediaType = pendingMedia?.mimeType;
    setPendingMedia(null);
    setInput("");
    setStreaming(true);

    try {
      if (pendingMedia && !mediaB64) {
        setUploading(true);
        const uploaded = await uploadFile(
          config,
          pendingMedia.uri,
          pendingMedia.mimeType,
          pendingMedia.filename,
        );
        setUploading(false);
        await sendMessage(config, {
          content: text || "",
          mediaB64: uploaded.b64,
          mediaType: uploaded.mime_type,
          sessionKey: currentSession || normalizeSession(config.session),
          onChunk: (token) => appendStream(token),
          onDone: () => commitStream(),
          onError: () => setStreaming(false),
        });
      } else {
        await sendMessage(config, {
          content: text || "",
          mediaB64,
          mediaType,
          sessionKey: currentSession || normalizeSession(config.session),
          onChunk: (token) => appendStream(token),
          onDone: () => commitStream(),
          onError: () => setStreaming(false),
        });
      }
    } catch {
      setStreaming(false);
    }
  }, [config, input, isStreaming, currentSession, pendingMedia]);

  const renderMessage = useCallback(
    ({ item, index }: { item: ExtendedMessage; index: number }) => {
      const isUser = item.role === "user";
      return (
        <View style={styles.messageBlock}>
          <Text style={[styles.messageLabel, isUser && styles.messageLabelUser]}>
            {isUser ? "You" : "Ghost"}
          </Text>
          {isUser ? (
            <View style={styles.userBubble}>
              <Markdown style={markdownStyles}>{item.content}</Markdown>
            </View>
          ) : (
            <Markdown style={markdownStyles}>{item.content}</Markdown>
          )}
        </View>
      );
    },
    [],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={Ghost.text.secondary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Ghost
          </Text>
          {isStreaming && (
            <EmberIndicator state="thinking" size={6} style={{ marginLeft: Space.xs }} />
          )}
        </View>
        <View style={styles.headerRight} />
      </View>

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
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
      />

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
            onPress={showAttachmentOptions}
          >
            <Paperclip size={20} color={Ghost.text.secondary} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={uploading ? "Uploading..." : "Message Ghost..."}
            placeholderTextColor={Ghost.text.tertiary}
            multiline
            maxLength={2000}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            editable={!uploading}
          />
          {(input.trim().length > 0 || pendingMedia) && (
            <TouchableOpacity
              style={[styles.sendButton, uploading && styles.sendButtonDisabled]}
              activeOpacity={0.7}
              onPress={handleSend}
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
    letterSpacing: 0.3,
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
  inputContainer: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Ghost.border.subtle,
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
    flex: 1,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    color: Ghost.text.primary,
    fontSize: 16,
    lineHeight: 24,
    maxHeight: 120,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Ghost.ember,
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
    color: Ghost.ember,
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
    borderLeftWidth: 3,
    borderLeftColor: Ghost.ember,
    paddingLeft: Space.md,
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
