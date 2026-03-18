import { useTerminalColor } from "@/hooks/use-terminal-color";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  Activity,
  AlertCircle,
  ArrowUp,
  Check,
  ChevronDown,
  Edit3,
  FileText,
  Image as ImageIcon,
  Mic,
  Plus,
  Search,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown, { ASTNode } from "react-native-markdown-display";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GHOST_LOGO = require("../../assets/images/logo.png");

import { Colors, Fonts, UI } from "@/constants/theme";
import {
  checkHealth,
  connectWebSocket,
  deleteSession,
  disconnectWebSocket,
  fetchAvailableTools,
  fetchHistory,
  GhostConfig,
  GhostError,
  onWSMessage,
  onWSStateChange,
  renameSession as renameSessionApi,
  saveConfig,
  sendMessage,
  transcribeAudio,
} from "../../lib/ghostApi";
import {
  ConnectionState,
  ExtendedMessage,
  useGhostStore,
} from "../../lib/store";

// ─── Design tokens ────────────────────────────────────────────────────────
const C = Colors.dark;
const FONT_MONO = Fonts.mono;
const FONT_SANS = Fonts.sans;

// ─── Action Modal ─────────────────────────────────────────────────────────
function ActionModal({
  visible,
  onClose,
  onCopy,
  onShare,
  onRetry,
  role,
}: {
  visible: boolean;
  onClose: () => void;
  onCopy: () => void;
  onShare: () => void;
  onRetry?: () => void;
  role: "user" | "assistant";
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={s.modalBackdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={s.modalContent}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>MESSAGE ACTIONS</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={20} color={C.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={s.sessionItem}
          onPress={() => {
            onCopy();
            onClose();
          }}
        >
          <Text style={s.sessionText}>Copy Text</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.sessionItem}
          onPress={() => {
            onShare();
            onClose();
          }}
        >
          <Text style={s.sessionText}>Share</Text>
        </TouchableOpacity>
        {role === "user" && onRetry && (
          <TouchableOpacity
            style={s.sessionItem}
            onPress={() => {
              onRetry();
              onClose();
            }}
          >
            <Text style={s.sessionText}>Re-run Command</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────
function SkeletonLoader() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  return (
    <View style={{ gap: 8, paddingVertical: 10 }}>
      <Animated.View
        style={{
          height: 12,
          width: "80%",
          backgroundColor: C.border,
          opacity: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 0.7],
          }),
        }}
      />
      <Animated.View
        style={{
          height: 12,
          width: "60%",
          backgroundColor: C.border,
          opacity: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 0.7],
          }),
        }}
      />
      <Animated.View
        style={{
          height: 12,
          width: "90%",
          backgroundColor: C.border,
          opacity: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 0.7],
          }),
        }}
      />
    </View>
  );
}

// ─── Voice Waveform ───────────────────────────────────────────────────────
function VoiceWaveform() {
  const anims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    anims.forEach((anim, i) => {
      const duration = 300 + Math.random() * 400;
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    });
  }, []);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        height: 24,
        paddingHorizontal: 10,
      }}
    >
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3,
            borderRadius: 1.5,
            backgroundColor: C.terminalGreen,
            height: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [4, 20],
            }),
            opacity: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.4, 1],
            }),
          }}
        />
      ))}
    </View>
  );
}

type SlashCommand = {
  command: string;
  description: string;
  requiresTool?: string;
};

// ─── Slash commands ───────────────────────────────────────────────────────
const SLASH_COMMANDS: SlashCommand[] = [
  { command: "/help", description: "Show help and tool list" },
  { command: "/clear", description: "Archive current session history" },
  { command: "/reset", description: "Reset session and summary" },
  {
    command: "/status",
    description: "Show system status",
    requiresTool: "exec",
  },
  { command: "/skills", description: "List all installed skills" },
  { command: "/install", description: "Install a new skill" },
  { command: "/tools", description: "List available tools" },
  { command: "/think", description: "Enable reasoning" },
  { command: "/remind", description: "Set a reminder", requiresTool: "cron" },
  { command: "/doctor", description: "Run system health check" },
];

// ─── Content sanitizer ────────────────────────────────────────────────────
function sanitize(text: string): string {
  const hasCorruptRatio = (line: string): boolean => {
    const replacementCount = (line.match(/\uFFFD/g) || []).length;
    if (replacementCount === 0) return false;
    return (
      replacementCount > 8 || replacementCount / Math.max(line.length, 1) > 0.04
    );
  };

  const trimmed = text.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return "";
    } catch {}
  }

  return text
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .split("\n")
    .filter((line) => {
      const cleanLine = line.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      const t = cleanLine.trim().toLowerCase();
      if (!t) return false;
      if (hasCorruptRatio(cleanLine)) return false;
      if (/^\d{4}[-/]\d{2}[-/]\d{2}.*\[(info|warn|error|debug)\]/i.test(t))
        return false;
      if (/^\[ghost(-api|-chat)?\]/i.test(t)) return false;
      if (/^command (successfully )?executed/i.test(t)) return false;
      if (/^latency:\s*\d+ms/i.test(t)) return false;
      if (/<\/?thinking>|<\/?thought>/.test(t)) return false;
      if (/^\[.*(thinking|tool call|using tool|reasoning).*\]$/i.test(t))
        return false;
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

type OutboxState = "queued" | "sending" | "retrying";
type OutboxItem = {
  id: string;
  session: string;
  content: string;
  mediaB64?: string;
  mediaType?: string;
  mediaUri?: string;
  createdAt: number;
  attempts: number;
  state: OutboxState;
};

const outboxKey = (session: string) =>
  `ghost:outbox:${session || "mobile:default"}`;

function makeClientMessageId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeAssistantPlaceholderId(requestId: string): string {
  return `temp-${requestId}`;
}

function normalizeSessionInput(session?: string): string {
  const s = (session || "").trim();
  return s.length ? s : "mobile:default";
}

function hasInternalArtifact(text: string): boolean {
  const t = text.toLowerCase();
  if (!t.trim()) return true;
  if (/\/skills\/|\\skills\\/.test(t)) return true;
  if (/^name:\s*[a-z0-9_\-]+\s*$/im.test(t) && /description:/im.test(t))
    return true;
  if (
    /tool[_\s-]?call|tool[_\s-]?execution|internal_api|workspace\/memory/i.test(
      t,
    )
  )
    return true;
  if (/```json[\s\S]*"(name|description|inputs|homepage)"/i.test(t))
    return true;
  return false;
}

// ─── Code block ───────────────────────────────────────────────────────────
function CodeBlock({ node }: { node: ASTNode }) {
  const lang = (
    (node as unknown as { sourceInfo?: string }).sourceInfo || ""
  ).toLowerCase();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(node.content);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={codeStyles.wrap}>
      <View style={codeStyles.header}>
        <Text style={codeStyles.lang}>{lang || "TEXT"}</Text>
        <TouchableOpacity
          onPress={handleCopy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[codeStyles.copy, copied && codeStyles.copyDone]}>
            {copied ? "COPIED" : "COPY"}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={codeStyles.body}>
          <Text style={codeStyles.text}>{node.content.trim()}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const codeStyles = StyleSheet.create({
  wrap: {
    backgroundColor: "#0E1116",
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 12,
    marginBottom: 14,
    borderRadius: 8,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#141A22",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  lang: {
    color: C.icon,
    fontSize: 10,
    fontFamily: FONT_MONO,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  copy: {
    color: C.terminalGreen,
    fontSize: 10,
    fontFamily: FONT_MONO,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  copyDone: { color: C.text },
  body: { paddingHorizontal: 12, paddingVertical: 10 },
  text: {
    color: "#D6E2F0",
    fontFamily: FONT_MONO,
    fontSize: 12.5,
    lineHeight: 20,
  },
});

const taskStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 2,
    marginBottom: 8,
  },
  box: {
    width: 17,
    height: 17,
    borderWidth: 1.2,
    borderColor: C.icon,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 3,
    backgroundColor: C.card,
  },
  boxChecked: {
    borderColor: C.terminalGreen,
    backgroundColor: "rgba(74, 222, 128, 0.12)",
  },
  content: { flex: 1 },
  contentChecked: { opacity: 0.86 },
});

// ─── Markdown rules & styles ──────────────────────────────────────────────
const markdownRules = {
  fence: (node: ASTNode) => <CodeBlock key={node.key} node={node} />,
  list_item: (node: ASTNode, children: any) => {
    const text = node.children[0]?.content || "";
    const isTask = text.startsWith("[ ] ") || text.startsWith("[x] ");
    const isChecked = text.startsWith("[x] ");

    if (isTask) {
      return (
        <View key={node.key} style={taskStyles.row}>
          <View style={[taskStyles.box, isChecked && taskStyles.boxChecked]}>
            {isChecked && <Check size={12} color={C.terminalGreen} />}
          </View>
          <View
            style={[taskStyles.content, isChecked && taskStyles.contentChecked]}
          >
            {children}
          </View>
        </View>
      );
    }
    return children;
  },
};

const mkStyles: Record<string, any> = {
  body: {
    color: C.text,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: FONT_SANS,
    letterSpacing: 0.1,
  },
  paragraph: { marginTop: 0, marginBottom: 12 },
  heading1: {
    color: C.terminalGreen,
    fontWeight: "800",
    fontSize: 22,
    fontFamily: FONT_SANS,
    marginTop: 20,
    marginBottom: 10,
    lineHeight: 29,
  },
  heading2: {
    color: C.terminalGreen,
    fontWeight: "700",
    fontSize: 19,
    fontFamily: FONT_SANS,
    marginTop: 18,
    marginBottom: 8,
    lineHeight: 26,
  },
  heading3: {
    color: C.text,
    fontWeight: "700",
    fontSize: 16,
    fontFamily: FONT_SANS,
    marginTop: 15,
    marginBottom: 6,
    lineHeight: 22,
  },
  strong: { color: C.text, fontWeight: "700", fontFamily: FONT_SANS },
  em: { fontStyle: "italic", color: "#A6B6C8", fontFamily: FONT_SANS },
  bullet_list: { marginBottom: 8, marginTop: 2 },
  ordered_list: { marginBottom: 8, marginTop: 2 },
  bullet_list_icon: { color: C.terminalGreen, marginRight: 6, marginTop: 2 },
  bullet_list_content: { marginRight: 2 },
  ordered_list_icon: { color: C.terminalGreen, marginRight: 8, marginTop: 1 },
  ordered_list_content: { marginRight: 2 },
  list_item: {
    color: C.text,
    fontSize: 15,
    lineHeight: 24,
    fontFamily: FONT_SANS,
    marginBottom: 4,
  },
  code_inline: {
    backgroundColor: "#1D252E",
    color: "#8BE9FD",
    fontFamily: FONT_MONO,
    fontSize: 12.5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(139,233,253,0.28)",
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: C.terminalGreen,
    paddingLeft: 12,
    paddingRight: 8,
    marginTop: 8,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  blockquote_content: {
    color: "#B7C6D7",
    fontSize: 14.5,
    lineHeight: 23,
    fontFamily: FONT_SANS,
  },
  hr: { backgroundColor: C.border, height: 1, marginVertical: 14 },
  link: {
    color: "#7BE3A4",
    textDecorationLine: "underline",
    textDecorationColor: "rgba(123,227,164,0.65)",
  },
  table: {
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 6,
    overflow: "hidden",
  },
  thead: { backgroundColor: "#151B22" },
  th: {
    color: "#DCE6F1",
    fontWeight: "700",
    fontSize: 12,
    fontFamily: FONT_MONO,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  td: {
    color: C.text,
    fontSize: 12.5,
    fontFamily: FONT_SANS,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: "rgba(255,255,255,0.015)",
  },
};

// ─── Connection badge ─────────────────────────────────────────────────────
function ConnectionBadge({ state }: { state: ConnectionState }) {
  const color =
    state === "online"
      ? C.terminalGreen
      : state === "syncing"
        ? C.terminalAmber
        : C.error;
  const icon =
    state === "online" ? (
      <Wifi size={12} color={color} />
    ) : (
      <WifiOff size={12} color={color} />
    );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {icon}
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }}
      />
      <Text
        style={{
          color,
          fontFamily: FONT_MONO,
          fontSize: UI.typography.status,
          letterSpacing: 1,
          fontWeight: "700",
        }}
      >
        {state === "online"
          ? "ONLINE"
          : state === "syncing"
            ? "SYNCING"
            : "OFFLINE"}
      </Text>
    </View>
  );
}

// ─── Message row ──────────────────────────────────────────────────────────
function MessageRow({
  msg,
  isGrouped,
  onLongPress,
  traceLabel,
}: {
  msg: ExtendedMessage;
  isGrouped: boolean;
  onLongPress: (content: string, role: "user" | "assistant") => void;
  traceLabel?: string;
}) {
  const accent = useTerminalColor();
  const isUser = msg.role === "user";
  const content = isUser ? msg.content : sanitize(msg.content);
  const isPlaceholder = !isUser && msg.status === "streaming" && content === "";

  if (!isUser && !content && !isPlaceholder) return null;

  const timeStr = new Date(msg.timestamp * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(content, msg.role);
  };

  if (isUser) {
    return (
      <TouchableOpacity
        style={[s.userRow, isGrouped && { marginBottom: 4 }]}
        onLongPress={handleLongPress}
        activeOpacity={0.8}
      >
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
                  <FileText size={20} color={C.text} />
                </View>
              )}
            </View>
          )}
          <Text style={s.userText}>{content}</Text>
          <View style={s.tsRow}>
            <Text style={s.ts}>{timeStr}</Text>
            {(msg.status === "sending" || msg.status === "retrying") && (
              <Activity size={10} color={C.icon} />
            )}
            {msg.status === "completed" && <Check size={10} color={accent} />}
            {msg.status === "failed" && (
              <AlertCircle size={10} color={C.error} />
            )}
          </View>
          {traceLabel ? <Text style={s.traceText}>{traceLabel}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[s.ghostRow, isGrouped && { marginTop: -12 }]}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      <View style={s.ghostAvatar}>
        {!isGrouped ? (
          <Terminal size={14} color={accent} />
        ) : (
          <View style={{ width: 14 }} />
        )}
      </View>
      <View style={s.ghostContent}>
        {isPlaceholder ? (
          <SkeletonLoader />
        ) : (
          <>
            <Markdown style={mkStyles} rules={markdownRules}>
              {content}
            </Markdown>
            <Text style={s.ts}>{timeStr}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Session Switcher Modal ───────────────────────────────────────────────
function SessionModal({
  visible,
  onClose,
  currentSession,
  recentSessions,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  currentSession: string;
  recentSessions: string[];
  onSwitch: (s: string) => void;
  onCreate: () => void;
  onRename: (oldName: string, newName: string) => Promise<string | null>;
  onDelete: (name: string) => void;
}) {
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renameErrors, setRenameErrors] = useState<Record<string, string>>({});

  const handleRenameSubmit = async (sess: string) => {
    const candidate = newName.trim();
    if (!candidate || candidate === sess) {
      setEditingSession(null);
      setRenameErrors((prev) => {
        const next = { ...prev };
        delete next[sess];
        return next;
      });
      return;
    }
    const error = await onRename(sess, candidate);
    if (error) {
      setRenameErrors((prev) => ({ ...prev, [sess]: error }));
      return;
    }
    setRenameErrors((prev) => {
      const next = { ...prev };
      delete next[sess];
      return next;
    });
    setEditingSession(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={s.modalBackdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={s.modalContent}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Sessions</Text>
          <TouchableOpacity onPress={onClose}>
            <X size={20} color={C.text} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 400 }}>
          {recentSessions.map((sess) => (
            <View
              key={sess}
              style={[
                s.sessionItem,
                sess === currentSession && s.sessionItemActive,
              ]}
            >
              {editingSession === sess ? (
                <View style={s.editWrap}>
                  <View style={s.editRow}>
                    <TextInput
                      style={s.editInput}
                      value={newName}
                      onChangeText={(text) => {
                        setNewName(text);
                        setRenameErrors((prev) => {
                          const next = { ...prev };
                          delete next[sess];
                          return next;
                        });
                      }}
                      autoFocus
                      onSubmitEditing={() => handleRenameSubmit(sess)}
                    />
                    <TouchableOpacity onPress={() => handleRenameSubmit(sess)}>
                      <Check size={18} color={C.terminalGreen} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingSession(null);
                        setRenameErrors((prev) => {
                          const next = { ...prev };
                          delete next[sess];
                          return next;
                        });
                      }}
                    >
                      <X size={18} color={C.error} />
                    </TouchableOpacity>
                  </View>
                  {!!renameErrors[sess] && (
                    <Text style={s.renameErrorText}>{renameErrors[sess]}</Text>
                  )}
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={s.sessionMain}
                    onPress={() => {
                      onSwitch(sess);
                      onClose();
                    }}
                  >
                    <Terminal
                      size={16}
                      color={sess === currentSession ? C.terminalGreen : C.icon}
                    />
                    <Text
                      style={[
                        s.sessionText,
                        sess === currentSession && { color: C.terminalGreen },
                      ]}
                      numberOfLines={1}
                    >
                      {sess}
                    </Text>
                  </TouchableOpacity>
                  <View style={s.sessionActions}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingSession(sess);
                        setNewName(sess);
                        setRenameErrors((prev) => {
                          const next = { ...prev };
                          delete next[sess];
                          return next;
                        });
                      }}
                      style={s.actionIcon}
                    >
                      <Edit3 size={14} color={C.icon} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onDelete(sess)}
                      style={s.actionIcon}
                    >
                      <Trash2 size={14} color={C.error} />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity
          style={s.newSessionBtn}
          onPress={() => {
            onCreate();
            onClose();
          }}
        >
          <Plus size={16} color={C.background} />
          <Text style={s.newSessionText}>New Session</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const {
    config,
    setConfig,
    messages,
    appendMessage,
    appendStream,
    commitStream,
    isStreaming,
    setStreaming,
    connectionState,
    setConnectionState,
    setMessages,
    removeMessage,
    updateMessageStatus,
    availableTools,
    setAvailableTools,
    clearStreamBuffer,
    currentSession,
    setCurrentSession,
    clearSeenMessageIds,
    accentColor,
  } = useGhostStore();

  const [input, setInput] = useState("");
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [recentSessions, setRecentSessions] = useState<string[]>([]);
  const [pendingMedia, setPendingMedia] = useState<
    { uri: string; b64: string; mimeType: string; name?: string }[]
  >([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(0);
  const [showSlash, setShowSlash] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [outboxReady, setOutboxReady] = useState(false);
  const [traceByRequest, setTraceByRequest] = useState<
    Record<string, string[]>
  >({});
  const [lastSanitizedAt, setLastSanitizedAt] = useState<number | null>(null);
  const [activeError, setActiveError] = useState<{
    error: GhostError;
    partialContent?: string;
  } | null>(null);

  const [actionMenu, setActionMenu] = useState<{
    visible: boolean;
    content: string;
    role: "user" | "assistant";
  }>({
    visible: false,
    content: "",
    role: "user",
  });

  const recording = useRef<Audio.Recording | null>(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const attachAnim = useRef(new Animated.Value(0)).current;
  const lastSendAt = useRef(0);
  const lastReconnectAt = useRef(0);
  const previousConnectionState = useRef<ConnectionState>("offline");
  const doSendRef = useRef<any>(null);
  const activeRequestRef = useRef<string | null>(null);

  // ─── Voice Logic ──────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recording.current = rec;
      setIsRecording(true);
      setRecordDuration(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  };

  const stopRecording = async () => {
    if (!recording.current) return;
    setIsRecording(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await recording.current.stopAndUnloadAsync();
      const uri = recording.current.getURI();
      recording.current = null;
      if (uri && config) {
        setIsTranscribing(true);
        const text = await transcribeAudio(config, uri);
        setIsTranscribing(false);
        if (text.trim()) {
          setInput(text);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (err) {
      console.error("Failed to stop recording", err);
      setIsTranscribing(false);
    }
  };

  // Session Management
  useEffect(() => {
    AsyncStorage.getItem("ghost:recentSessions").then((data) => {
      if (data) {
        setRecentSessions(JSON.parse(data));
      } else {
        setRecentSessions(["mobile:default"]);
      }
    });
  }, []);

  useEffect(() => {
    if (!currentSession) return;
    setRecentSessions((prev) => {
      const next = Array.from(new Set([currentSession, ...prev])).slice(0, 10);
      AsyncStorage.setItem("ghost:recentSessions", JSON.stringify(next));
      return next;
    });
  }, [currentSession]);

  const persistOutbox = useCallback(
    async (session: string, items: OutboxItem[]) => {
      await AsyncStorage.setItem(outboxKey(session), JSON.stringify(items));
    },
    [],
  );

  const loadOutbox = useCallback(
    async (session: string): Promise<OutboxItem[]> => {
      const raw = await AsyncStorage.getItem(outboxKey(session));
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((x) => x && typeof x.id === "string");
      } catch {
        return [];
      }
    },
    [],
  );

  const upsertOutboxItem = useCallback(
    async (item: OutboxItem) => {
      const session = item.session || "mobile:default";
      setOutbox((prev) => {
        const next = prev.some((x) => x.id === item.id)
          ? prev.map((x) => (x.id === item.id ? item : x))
          : [...prev, item];
        persistOutbox(session, next).catch(() => {});
        return next;
      });
    },
    [persistOutbox],
  );

  const removeOutboxItem = useCallback(
    async (session: string, id: string) => {
      setOutbox((prev) => {
        const next = prev.filter((x) => x.id !== id);
        persistOutbox(session, next).catch(() => {});
        return next;
      });
    },
    [persistOutbox],
  );

  const appendLifecycle = useCallback((requestID: string, state: string) => {
    if (!requestID || !state) return;
    setTraceByRequest((prev) => {
      const existing = prev[requestID] ?? [];
      if (existing[existing.length - 1] === state) return prev;
      return { ...prev, [requestID]: [...existing, state] };
    });
  }, []);

  const switchSession = async (newSession: string) => {
    if (!config || !newSession.trim()) return;
    const nextSession = newSession.trim();
    const nextCfg: GhostConfig = { ...config, session: nextSession };
    await saveConfig(nextCfg);
    setConfig(nextCfg);
    setCurrentSession(nextSession);
    clearSeenMessageIds();
    setMessages([]);
    fetchHistory(nextCfg, 50, 0)
      .then((h) => {
        setMessages(
          h.messages
            .map((m) => ({ ...m, status: "completed" as const }))
            .sort((a, b) => a.timestamp - b.timestamp),
        );
      })
      .catch(() => setMessages([]));
    connectWebSocket(nextCfg);
  };

  const createNewSession = () => {
    const next = `mobile:${Date.now()}`;
    switchSession(next);
  };

  const renameSession = async (
    oldName: string,
    newName: string,
  ): Promise<string | null> => {
    if (!config || !newName.trim()) return "Name is required.";
    const nextName = newName.trim();
    if (oldName === nextName) return null;

    try {
      await renameSessionApi(config, oldName, nextName);
    } catch (err: any) {
      console.error("Failed to rename session", err);
      return err instanceof Error && err.message.includes("409")
        ? "Already exists."
        : "Failed to rename on the Pi.";
    }

    // Update list in AsyncStorage
    setRecentSessions((prev) => {
      const next = prev.map((s) => (s === oldName ? nextName : s));
      AsyncStorage.setItem("ghost:recentSessions", JSON.stringify(next));
      return next;
    });

    // If it's the current session, update config and store
    if (currentSession === oldName) {
      const nextCfg: GhostConfig = { ...config, session: nextName };
      await saveConfig(nextCfg);
      setConfig(nextCfg);
      setCurrentSession(nextName);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return null;
  };

  const deleteSessionHandler = async (name: string) => {
    if (!config) return;

    const performDelete = async () => {
      try {
        // 1. Call API to delete messages from DB
        await deleteSession(config, name);

        // 2. Update local list
        const next = recentSessions.filter((s) => s !== name);
        setRecentSessions(next);
        await AsyncStorage.setItem(
          "ghost:recentSessions",
          JSON.stringify(next),
        );

        // 3. If it was the current session, switch to default or latest
        if (currentSession === name) {
          const fallback = next[0] || "mobile:default";
          await switchSession(fallback);
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        console.error("Failed to delete session", err);
        Alert.alert("Error", "Failed to delete session on the Pi.");
      }
    };

    if (Platform.OS === "web") {
      if (confirm(`Delete all messages in "${name}"?`)) {
        performDelete();
      }
    } else {
      Alert.alert(
        "Delete Session",
        `Permanently delete all messages in "${name}"?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: performDelete },
        ],
      );
    }
  };

  // ... (Keep existing logic for polling, WS, Send, Voice, Attach, etc. adapted for new UI)
  // Simplified for brevity in this response, but I will include the core logic.

  // Health poll
  useEffect(() => {
    if (!config) return;
    const poll = async () =>
      setConnectionState((await checkHealth(config)) ? "online" : "offline");
    poll();
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, [config]);

  // WS State
  useEffect(
    () =>
      onWSStateChange((st) => {
        if (st === "connected") {
          lastReconnectAt.current = Date.now();
          setConnectionState("online");
        } else if (st === "reconnecting") {
          clearStreamBuffer();
          setConnectionState("syncing");
        } else {
          clearStreamBuffer();
          setConnectionState("offline");
        }
      }),
    [clearStreamBuffer, setConnectionState],
  );

  // Load History
  useEffect(() => {
    if (!config) return;
    setOutboxReady(false);
    fetchHistory(config, 60, 0)
      .then((d) => {
        let quarantinedCount = 0;
        const serverMessages = d.messages
          .filter((m) => {
            if (m.role !== "assistant") return true;
            const cleaned = sanitize(m.content || "");
            const keep = !!cleaned && !hasInternalArtifact(cleaned);
            if (!keep) quarantinedCount += 1;
            return keep;
          })
          .map((m) => ({
            ...m,
            content:
              m.role === "assistant" ? sanitize(m.content || "") : m.content,
          }))
          .map((m) => ({ ...m, status: "completed" as const }))
          .sort((a, b) => a.timestamp - b.timestamp);
        loadOutbox(currentSession || "mobile:default").then((items) => {
          setOutbox(items);
          const pendingUserMessages: ExtendedMessage[] = items
            .filter((item) => {
              const match = serverMessages.find(
                (m) =>
                  m.role === "user" &&
                  m.content.trim() === item.content.trim() &&
                  Math.abs((m.timestamp || 0) * 1000 - item.createdAt) < 120000,
              );
              return !match;
            })
            .map((item) => ({
              id: item.id,
              role: "user",
              content: item.content || "Attachment",
              timestamp: item.createdAt / 1000,
              media_url: item.mediaUri,
              status: item.state === "queued" ? "sending" : "retrying",
            }));
          setMessages(
            [...serverMessages, ...pendingUserMessages].sort(
              (a, b) => a.timestamp - b.timestamp,
            ),
          );
          if (quarantinedCount > 0) setLastSanitizedAt(Date.now());
          setOutboxReady(true);
        });
      })
      .catch(async () => {
        const items = await loadOutbox(currentSession || "mobile:default");
        setOutbox(items);
        setMessages(
          items.map((item) => ({
            id: item.id,
            role: "user",
            content: item.content || "Attachment",
            timestamp: item.createdAt / 1000,
            media_url: item.mediaUri,
            status: item.state === "queued" ? "sending" : "retrying",
          })),
        );
        setOutboxReady(true);
      });
    fetchAvailableTools(config)
      .then(setAvailableTools)
      .catch(() => {});
    connectWebSocket(config);
    const unsub = onWSMessage((msg) => {
      if (msg.type !== "assistant_message") return;
      if (msg.channel && msg.channel !== "mobile") return;
      if (typeof msg.content !== "string") return;
      const cleaned = sanitize(msg.content || "");
      if (!cleaned || hasInternalArtifact(cleaned)) {
        setLastSanitizedAt(Date.now());
        return;
      }
      if (useGhostStore.getState().isStreaming) return;
      appendMessage({
        id: msg.id || `ws-${Date.now()}`,
        role: "assistant",
        content: cleaned,
        timestamp: msg.timestamp || Date.now() / 1000,
        status: "completed",
      });
    });
    return () => {
      unsub();
      disconnectWebSocket();
    };
  }, [config?.session, currentSession, loadOutbox]); // Reload on session change

  // Send Logic
  const doSend = useCallback(
    async (item: OutboxItem) => {
      if (!config) return;
      activeRequestRef.current = item.id;
      const session = item.session || normalizeSessionInput(config.session);
      const current = {
        ...item,
        state: "sending" as OutboxState,
        attempts: item.attempts + 1,
      };
      await upsertOutboxItem(current);
      updateMessageStatus(item.id, "sending");
      appendMessage({
        id: item.id,
        role: "user",
        content: item.content || "Attachment",
        timestamp: item.createdAt / 1000,
        media_url: item.mediaUri,
        status: "sending",
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      appendMessage({
        id: makeAssistantPlaceholderId(item.id),
        role: "assistant",
        content: "",
        timestamp: Date.now() / 1000,
        status: "streaming",
      });
      setStreaming(true);
      appendLifecycle(item.id, "sent_to_gateway");

      await sendMessage(config, {
        requestId: item.id,
        content: item.content,
        mediaB64: item.mediaB64,
        mediaType: item.mediaType,
        onLifecycle: (requestID, state) => appendLifecycle(requestID, state),
        onSanitized: () => setLastSanitizedAt(Date.now()),
        onChunk: (c) => {
          if (!c || hasInternalArtifact(c)) {
            setLastSanitizedAt(Date.now());
            return;
          }
          appendStream(c);
        },
        onDone: (fullText) => {
          commitStream();
          if (
            !sanitize(fullText || "").trim() ||
            hasInternalArtifact(fullText || "")
          ) {
            removeMessage(makeAssistantPlaceholderId(item.id));
            upsertOutboxItem({
              ...current,
              state: "retrying",
            }).catch(() => {});
            updateMessageStatus(item.id, "retrying");
            setActiveError({
              error: {
                kind: "interrupted",
                message:
                  "Response contained internal artifacts and was dropped.",
                retryable: true,
              },
            });
            setLastSanitizedAt(Date.now());
          } else {
            updateMessageStatus(item.id, "completed");
            removeOutboxItem(session, item.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          activeRequestRef.current = null;
        },
        onError: (e) => {
          clearStreamBuffer();
          removeMessage(makeAssistantPlaceholderId(item.id));
          const shouldRetry = e.retryable || connectionState !== "online";
          if (shouldRetry) {
            const retryItem: OutboxItem = {
              ...current,
              state: "retrying",
            };
            upsertOutboxItem(retryItem).catch(() => {});
            updateMessageStatus(item.id, "retrying");
          } else {
            removeOutboxItem(session, item.id).catch(() => {});
            updateMessageStatus(item.id, "failed");
            setActiveError({ error: e });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
          activeRequestRef.current = null;
        },
      });
    },
    [
      config,
      appendMessage,
      appendStream,
      commitStream,
      clearStreamBuffer,
      setStreaming,
      removeMessage,
      removeOutboxItem,
      upsertOutboxItem,
      updateMessageStatus,
      appendLifecycle,
      connectionState,
    ],
  );

  useEffect(() => {
    doSendRef.current = doSend;
  }, [doSend]);

  useEffect(() => {
    if (!outboxReady) return;
    if (connectionState !== "online") return;
    if (isStreaming) return;
    if (activeRequestRef.current) return;
    const next = [...outbox]
      .filter(
        (x) =>
          x.state === "queued" ||
          x.state === "retrying" ||
          x.state === "sending",
      )
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!next) return;
    doSend(next).catch(() => {});
  }, [outbox, outboxReady, connectionState, isStreaming, doSend]);

  const handleSend = async () => {
    if (!input.trim() && pendingMedia.length === 0) return;
    const t = input.trim();
    const media = [...pendingMedia];
    setInput("");
    setPendingMedia([]);
    setShowSlash(false);

    // Intercept clear/reset commands to update local state immediately
    const cmd = t.toLowerCase().trim();
    if (cmd === "/clear" || cmd === "/reset") {
      setMessages([]);
      clearSeenMessageIds();
    }

    const clientMessageId = makeClientMessageId();
    const session = currentSession || normalizeSessionInput(config?.session);
    const item: OutboxItem = {
      id: clientMessageId,
      session,
      content: t || "Attachment",
      mediaB64: media[0]?.b64,
      mediaType: media[0]?.mimeType,
      mediaUri: media[0]?.uri,
      createdAt: Date.now(),
      attempts: 0,
      state: connectionState === "online" ? "sending" : "queued",
    };

    if (connectionState !== "online") {
      await upsertOutboxItem(item);
      appendLifecycle(item.id, "queued");
      appendMessage({
        id: item.id,
        role: "user",
        content: item.content,
        timestamp: item.createdAt / 1000,
        status: "retrying",
      });
      return;
    }
    await doSend(item);
  };

  // Pickers
  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!r.canceled) {
      const next = r.assets.map((a) => ({
        uri: a.uri,
        b64: a.base64 || "",
        mimeType: a.mimeType ?? "image/jpeg",
        name: a.fileName || "image.jpg",
      }));
      setPendingMedia((prev) => [...prev, ...next]);
    }
  };

  const pickDocument = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (!r.canceled && r.assets) {
      const next = await Promise.all(
        r.assets.map(async (asset) => {
          try {
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            return new Promise<{
              uri: string;
              b64: string;
              mimeType: string;
              name: string;
            }>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                const base64data = (reader.result as string).split(",")[1];
                resolve({
                  uri: asset.uri,
                  b64: base64data,
                  mimeType: asset.mimeType ?? "application/octet-stream",
                  name: asset.name,
                });
              };
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.error("Failed to read file", e);
            return null;
          }
        }),
      );
      setPendingMedia((prev) => [...prev, ...(next.filter(Boolean) as any)]);
    }
  };

  if (!config)
    return (
      <View style={[s.container, s.centered, { paddingTop: insets.top }]}>
        <Image source={GHOST_LOGO} style={{ width: 64, height: 64 }} />
        <Text style={s.noConfigTitle}>Offline</Text>
        <Text style={s.noConfigSub}>Configure connection in Settings</Text>
      </View>
    );

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
    >
      {/* ── Header ── */}
      <View
        style={[
          s.header,
          { paddingTop: insets.top + 10 },
          isStreaming && {
            borderBottomColor:
              accentColor === "green"
                ? "#4ADE80"
                : accentColor === "amber"
                  ? "#FBBF24"
                  : "#22D3EE",
          },
        ]}
      >
        <TouchableOpacity
          style={s.sessionBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSessionMenuOpen(true);
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Image source={GHOST_LOGO} style={{ width: 18, height: 18 }} />
            <View>
              <Text style={s.headerTitle}>
                {currentSession || "mobile:default"}
              </Text>
              {isStreaming && (
                <Text
                  style={[
                    s.headerSub,
                    {
                      color:
                        accentColor === "green"
                          ? "#4ADE80"
                          : accentColor === "amber"
                            ? "#FBBF24"
                            : "#22D3EE",
                    },
                  ]}
                >
                  THINKING...
                </Text>
              )}
              {connectionState === "syncing" && (
                <Text style={[s.headerSub, { color: C.terminalAmber }]}>
                  SYNCING...
                </Text>
              )}
            </View>
            <ChevronDown size={14} color={C.icon} />
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <ConnectionBadge state={connectionState} />
          <TouchableOpacity onPress={() => setSearchVisible(!searchVisible)}>
            <Search size={18} color={C.icon} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Search Bar ── */}
      {searchVisible && (
        <View style={s.searchBar}>
          <TextInput
            style={s.searchInput}
            placeholder="Search history..."
            placeholderTextColor={C.icon}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          <TouchableOpacity
            style={s.searchCloseBtn}
            onPress={() => setSearchVisible(false)}
          >
            <X size={18} color={C.icon} />
          </TouchableOpacity>
        </View>
      )}
      {lastSanitizedAt && Date.now() - lastSanitizedAt < 180000 && (
        <View style={s.quarantineBanner}>
          <AlertCircle size={12} color={C.terminalAmber} />
          <Text style={s.quarantineText}>
            Response sanitized to protect chat from internal artifacts.
          </Text>
        </View>
      )}

      {/* ── Messages ── */}
      <FlatList
        ref={listRef}
        data={[...messages].reverse()}
        inverted
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item, index }) => {
          const prevMsg = messages[messages.length - 1 - index - 1];
          const isGrouped = prevMsg && prevMsg.role === item.role;
          return (
            <MessageRow
              msg={item}
              isGrouped={!!isGrouped}
              traceLabel={
                item.role === "user"
                  ? traceByRequest[item.id]?.join(" → ")
                  : undefined
              }
              onLongPress={(content, role) =>
                setActionMenu({ visible: true, content, role })
              }
            />
          );
        }}
        contentContainerStyle={s.msgList}
        showsVerticalScrollIndicator={false}
      />

      {/* ── Input Area ── */}
      <View
        style={[s.inputArea, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        {/* Attachments Tray */}
        {attachOpen && (
          <View style={s.attachTray}>
            <TouchableOpacity
              style={s.attachItem}
              onPress={() => {
                pickImage();
                setAttachOpen(false);
              }}
            >
              <ImageIcon size={20} color={C.text} />
              <Text style={s.attachLabel}>Image</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.attachItem}
              onPress={() => {
                pickDocument();
                setAttachOpen(false);
              }}
            >
              <FileText size={20} color={C.text} />
              <Text style={s.attachLabel}>File</Text>
            </TouchableOpacity>
            {/* Add more attachment types here if needed */}
          </View>
        )}

        {/* Pending Media */}
        {pendingMedia.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.pendingCarousel}
          >
            {pendingMedia.map((m, i) => (
              <View key={i} style={s.pendingMedia}>
                <Text style={s.pendingMediaText} numberOfLines={1}>
                  {m.name || "Attachment"}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    setPendingMedia((prev) =>
                      prev.filter((_, idx) => idx !== i),
                    )
                  }
                >
                  <X size={16} color={C.text} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={s.inputRow}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAttachOpen(!attachOpen);
            }}
          >
            <Plus size={20} color={attachOpen ? C.terminalGreen : C.icon} />
          </TouchableOpacity>

          <View style={s.inputWrap}>
            {isRecording ? (
              <VoiceWaveform />
            ) : (
              <TextInput
                ref={inputRef}
                style={s.input}
                value={input}
                onChangeText={(t) => {
                  setInput(t);
                  setShowSlash(t.startsWith("/"));
                }}
                onFocus={() => {
                  if (searchQuery.trim().length === 0) {
                    setSearchVisible(false);
                  }
                }}
                placeholder={
                  isTranscribing ? "Transcribing..." : "Type a message..."
                }
                placeholderTextColor={C.icon}
                multiline
                maxLength={2000}
                editable={!isTranscribing}
              />
            )}
          </View>

          {input.trim() || pendingMedia ? (
            <TouchableOpacity
              style={s.sendBtn}
              onPress={handleSend}
              disabled={isStreaming}
            >
              {isStreaming ? (
                <ActivityIndicator color={C.background} size="small" />
              ) : (
                <ArrowUp size={20} color={C.background} />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                s.iconBtn,
                isRecording && {
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  borderRadius: 22,
                },
              ]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
              disabled={isTranscribing}
            >
              {isTranscribing ? (
                <ActivityIndicator size="small" color={C.terminalGreen} />
              ) : (
                <Mic size={20} color={isRecording ? C.error : C.icon} />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Slash Suggestions */}
        {showSlash && (
          <View style={s.slashSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {SLASH_COMMANDS.filter((c) => c.command.startsWith(input)).map(
                (c) => (
                  <TouchableOpacity
                    key={c.command}
                    style={s.slashItem}
                    onPress={() => {
                      setInput(c.command + " ");
                      setShowSlash(false);
                    }}
                  >
                    <Text style={s.slashCmd}>{c.command}</Text>
                    <Text style={s.slashDesc}>{c.description}</Text>
                  </TouchableOpacity>
                ),
              )}
            </ScrollView>
          </View>
        )}
      </View>

      <ActionModal
        visible={actionMenu.visible}
        onClose={() => setActionMenu({ ...actionMenu, visible: false })}
        role={actionMenu.role}
        onCopy={() => {
          Clipboard.setStringAsync(actionMenu.content);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onShare={async () => {
          try {
            await Share.share({ message: actionMenu.content });
          } catch (err) {
            console.error("Share failed", err);
          }
        }}
        onRetry={
          actionMenu.role === "user"
            ? () => {
                setInput(actionMenu.content);
                // Auto-send can be added here if desired
              }
            : undefined
        }
      />

      <SessionModal
        visible={sessionMenuOpen}
        onClose={() => setSessionMenuOpen(false)}
        currentSession={currentSession || "mobile:default"}
        recentSessions={recentSessions}
        onSwitch={switchSession}
        onCreate={createNewSession}
        onRename={renameSession}
        onDelete={deleteSessionHandler}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: {
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: UI.spacing.screenX,
    paddingBottom: UI.spacing.headerY,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.background,
    zIndex: 10,
  },
  headerTitle: {
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 14,
    fontWeight: "700",
  },
  headerSub: {
    fontSize: UI.typography.meta,
    fontFamily: FONT_MONO,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  sessionBtn: { flexDirection: "row", alignItems: "center", padding: 4 },
  noConfigTitle: {
    color: C.terminalGreen,
    fontFamily: FONT_MONO,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1,
  },
  noConfigSub: { color: C.icon, fontFamily: FONT_MONO, fontSize: 14 },
  msgList: { paddingHorizontal: 16, paddingVertical: 16 },

  // Message Styles
  userRow: { alignSelf: "flex-end", maxWidth: "85%", marginBottom: 16 },
  userBubble: {
    backgroundColor: C.card,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  userText: {
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 14,
    lineHeight: 20,
  },
  ghostRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    paddingRight: 16,
  },
  ghostAvatar: { marginTop: 4 },
  ghostContent: { flex: 1 },
  tsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 4,
  },
  ts: { color: C.icon, fontSize: UI.typography.meta, fontFamily: FONT_MONO },
  traceText: {
    color: C.terminalAmber,
    fontFamily: FONT_MONO,
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
  },
  attachedImage: { width: 200, height: 120, borderRadius: 4 },
  fileThumb: {
    width: 40,
    height: 40,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },

  // Input Area
  inputArea: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.background,
    paddingHorizontal: UI.spacing.screenX,
    paddingTop: UI.spacing.section,
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  prompt: {
    color: C.terminalGreen,
    fontFamily: FONT_MONO,
    fontSize: 16,
    marginRight: 8,
    fontWeight: "700",
  },
  input: {
    flex: 1,
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 14,
    paddingVertical: 10,
    maxHeight: 100,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 44,
    height: 44,
    backgroundColor: C.terminalGreen,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },

  // Attachments
  attachTray: { flexDirection: "row", gap: 16, paddingBottom: 12 },
  attachItem: { alignItems: "center", gap: 4 },
  attachLabel: { color: C.text, fontFamily: FONT_MONO, fontSize: 10 },
  pendingCarousel: { marginBottom: 8 },
  pendingMedia: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.card,
    padding: 8,
    marginRight: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
    maxWidth: 150,
  },
  pendingMediaText: {
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },

  // Slash
  slashSheet: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    maxHeight: 200,
    borderRadius: 4,
  },
  slashItem: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
  },
  slashCmd: {
    color: C.terminalGreen,
    fontFamily: FONT_MONO,
    fontWeight: "700",
  },
  slashDesc: { color: C.icon, fontFamily: FONT_MONO, flex: 1, fontSize: 12 },

  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    paddingHorizontal: 0,
    paddingVertical: 4,
    marginHorizontal: 0,
    marginBottom: 0,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: C.border,
  },
  quarantineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(251,191,36,0.12)",
    borderColor: C.terminalAmber,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quarantineText: {
    color: C.terminalAmber,
    fontFamily: FONT_MONO,
    fontSize: 10,
    flex: 1,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  searchCloseBtn: {
    width: 44,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },

  // Modal
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: UI.modal.backdrop,
  },
  modalContent: {
    position: "absolute",
    top: UI.modal.top,
    left: UI.modal.side,
    right: UI.modal.side,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.terminalGreen,
    borderRadius: UI.radius.panel,
    padding: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: UI.modal.headerPadding,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  modalTitle: {
    color: C.terminalGreen,
    fontFamily: FONT_MONO,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
  sessionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  sessionItemActive: { backgroundColor: "rgba(74, 222, 128, 0.15)" },
  sessionMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sessionText: {
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 14,
    fontWeight: "500",
  },
  sessionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  actionIcon: {
    padding: 4,
  },
  editRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  editWrap: {
    flex: 1,
    gap: 6,
  },
  editInput: {
    flex: 1,
    color: C.text,
    fontFamily: FONT_MONO,
    fontSize: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.terminalGreen,
    paddingVertical: 4,
  },
  renameErrorText: {
    color: C.error,
    fontFamily: FONT_MONO,
    fontSize: 11,
  },
  newSessionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: UI.modal.bodyPadding,
    backgroundColor: C.terminalGreen,
  },
  newSessionText: {
    color: C.background,
    fontFamily: FONT_MONO,
    fontWeight: "700",
    fontSize: 14,
  },
});
