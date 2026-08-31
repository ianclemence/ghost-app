import { ArrowLeft, Send } from "lucide-react-native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
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

  const handleSend = useCallback(async () => {
    if (!config || !input.trim() || isStreaming) return;

    const userMessage: ExtendedMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: input.trim(),
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

    setInput("");
    setStreaming(true);

    try {
      await sendMessage(config, {
        content: input.trim(),
        sessionKey: currentSession || normalizeSession(config.session),
        onChunk: (token) => appendStream(token),
        onDone: () => commitStream(),
        onError: () => setStreaming(false),
      });
    } catch {
      setStreaming(false);
    }
  }, [config, input, isStreaming, currentSession]);

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
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Message Ghost..."
            placeholderTextColor={Ghost.text.tertiary}
            multiline
            maxLength={2000}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          {input.trim().length > 0 && (
            <TouchableOpacity
              style={styles.sendButton}
              activeOpacity={0.7}
              onPress={handleSend}
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
