import { ArrowLeft, Send } from "lucide-react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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

import { Colors, Fonts, Ghost, Radius, Space, Type } from "@/constants/theme";
import { useGhostStore, ExtendedMessage } from "@/lib/store";
import {
  fetchHistory,
  sendMessage,
} from "@/lib/ghostApi";

const FONT = Fonts.sans;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const {
    config,
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

  // Load history on mount
  useEffect(() => {
    if (!config || !params.id) return;
    const loadHistory = async () => {
      try {
        const { messages: history } = await fetchHistory(config, 50, 0);
        setMessages(history);
      } catch {
        // Fine
      }
    };
    loadHistory();
  }, [config, params.id]);

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
    setInput("");
    setStreaming(true);

    try {
      await sendMessage(config, {
        content: input.trim(),
        onChunk: (token) => appendStream(token),
        onDone: () => commitStream(),
        onError: () => setStreaming(false),
      });
    } catch {
      setStreaming(false);
    }
  }, [config, input, isStreaming]);

  const renderMessage = useCallback(
    ({ item }: { item: ExtendedMessage }) => {
      const isUser = item.role === "user";
      return (
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          {!isUser && (
            <View style={styles.ghostAvatar}>
              <Text style={styles.ghostAvatarText}>G</Text>
            </View>
          )}
          <View style={[styles.messageContent, isUser && styles.userContent]}>
            {isUser ? (
              <Text style={styles.userText}>{item.content}</Text>
            ) : (
              <Markdown style={markdownStyles}>{item.content}</Markdown>
            )}
            <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
          </View>
        </View>
      );
    },
    [],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={Ghost.accent.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Ghost
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={[
          styles.messageList,
          { paddingBottom: insets.bottom + Space.xl },
        ]}
        showsVerticalScrollIndicator={false}
        inverted={false}
        onContentSizeChange={() =>
          flatListRef.current?.scrollToEnd({ animated: true })
        }
      />

      {/* Streaming indicator */}
      {isStreaming && (
        <View style={styles.streamingIndicator}>
          <ActivityIndicator size="small" color={Ghost.accent.primary} />
          <Text style={styles.streamingText}>Ghost is thinking...</Text>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + Space.sm }]}>
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Ghost..."
            placeholderTextColor={Ghost.text.tertiary}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!input.trim() || isStreaming) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            <Send size={18} color={Ghost.text.inverse} />
          </TouchableOpacity>
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
  headerTitle: {
    ...Type.headline,
    fontFamily: FONT,
    color: Ghost.text.primary,
    flex: 1,
    textAlign: "center",
  },
  headerRight: {
    width: 40,
  },
  messageList: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    gap: Space.lg,
  },
  messageBubble: {
    flexDirection: "row",
    gap: Space.sm,
    maxWidth: "85%",
  },
  userBubble: {
    alignSelf: "flex-end",
  },
  assistantBubble: {
    alignSelf: "flex-start",
  },
  ghostAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Ghost.accent.soft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  ghostAvatarText: {
    ...Type.caption,
    fontFamily: FONT,
    color: Ghost.accent.primary,
    fontWeight: "600",
  },
  messageContent: {
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.xl,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  userContent: {
    backgroundColor: Ghost.accent.primary,
  },
  userText: {
    ...Type.body,
    fontFamily: FONT,
    color: Ghost.text.inverse,
  },
  messageTime: {
    ...Type.caption,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    marginTop: Space.xs,
  },
  streamingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.sm,
  },
  streamingText: {
    ...Type.footnote,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
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
    fontFamily: FONT,
    fontSize: 16,
    lineHeight: 24,
    maxHeight: 120,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Ghost.accent.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});

const markdownStyles = {
  body: {
    color: Ghost.text.primary,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONT,
  },
  heading1: {
    color: Ghost.text.primary,
    fontWeight: "700" as const,
    fontSize: 22,
    marginBottom: 8,
  },
  heading2: {
    color: Ghost.text.primary,
    fontWeight: "600" as const,
    fontSize: 18,
    marginBottom: 6,
  },
  code_inline: {
    backgroundColor: Ghost.bg.sunken,
    color: Ghost.text.primary,
    fontFamily: Fonts.mono,
    borderRadius: Radius.sm,
    paddingHorizontal: 5,
    fontSize: 14,
  },
  fence: {
    backgroundColor: Ghost.bg.sunken,
    borderRadius: Radius.md,
    padding: Space.md,
  },
  code_block: {
    color: Ghost.text.primary,
    fontFamily: Fonts.mono,
    fontSize: 14,
  },
  link: {
    color: Ghost.accent.primary,
  },
  strong: {
    color: Ghost.text.primary,
    fontWeight: "600" as const,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: Ghost.accent.primary,
    paddingLeft: Space.md,
    opacity: 0.85,
  },
  hr: {
    backgroundColor: Ghost.border.subtle,
    height: 1,
  },
  list_item: {
    color: Ghost.text.primary,
    fontSize: 16,
    fontFamily: FONT,
  },
};
