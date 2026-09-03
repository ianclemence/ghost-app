import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Camera, Copy, Mic, Menu, MapPin, Send, Upload } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ghost, Radius, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { MenuDrawer } from "@/components/menu-drawer";
import { formatUptime } from "@/lib/format";
import { useGhostStore } from "@/lib/store";

interface HomeItem {
  id: string;
  title: string;
  preview: string;
  full: string;
  timestamp: number;
  sessionId: string | null;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function groupByDay(items: HomeItem[]): { title: string; data: HomeItem[] }[] {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  const groups: Record<string, HomeItem[]> = {};
  for (const item of items) {
    const d = new Date(item.timestamp);
    const key = d.toDateString();
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  const result: { title: string; data: HomeItem[] }[] = [];
  if (groups[today]) result.push({ title: "TODAY", data: groups[today] });
  if (groups[yesterday]) result.push({ title: "YESTERDAY", data: groups[yesterday] });

  const sortedKeys = Object.keys(groups)
    .filter((k) => k !== today && k !== yesterday)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  for (const key of sortedKeys) {
    const d = new Date(key);
    const label = d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    result.push({ title: label.toUpperCase(), data: groups[key] });
  }

  return result;
}

const STARTER_PROMPT = "Catch me up on what I missed today";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, connectionState, inbox, ghostName, profile, uptimeSeconds, setCurrentSession } = useGhostStore();
  const [greeting] = useState(getGreeting);
  const [draft, setDraft] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const displayName = ghostName ?? profile?.name ?? null;

  const items: HomeItem[] = inbox.map((item) => ({
    id: item.id,
    title: "Ghost noticed",
    preview: item.content.slice(0, 120),
    full: item.content,
    timestamp: item.timestamp,
    sessionId: item.session_id ?? null,
  }));

  const sections = groupByDay(items);
  const latest = items[0] ?? null;
  const online = connectionState === "online";

  const goPrompt = useCallback(
    (prompt: string, sessionId?: string | null) => {
      const q = prompt.trim();
      if (sessionId) setCurrentSession(sessionId);
      if (!q) {
        router.push("/conversation" as any);
        return;
      }
      if (sessionId) {
        router.push({ pathname: "/conversation", params: { prompt: q, sessionId } } as any);
      } else {
        router.push({ pathname: "/conversation", params: { prompt: q } } as any);
      }
    },
    [router, setCurrentSession],
  );

  const handleSubmit = () => {
    goPrompt(draft);
    setDraft("");
  };

  const renderItem = useCallback(
    ({ item }: { item: HomeItem }) => (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.6}
        onPress={() => goPrompt(item.full, item.sessionId)}
        accessibilityLabel="Open in conversation"
      >
        <View style={styles.rowTop}>
          <GhostText type="headline" style={styles.rowTitle} numberOfLines={1}>
            {item.title}
          </GhostText>
          <GhostText type="footnote" style={styles.rowTime}>
            {formatTime(item.timestamp)}
          </GhostText>
        </View>
        <GhostText type="callout" style={styles.rowPreview} numberOfLines={2}>
          {item.preview}
        </GhostText>
      </TouchableOpacity>
    ),
    [goPrompt],
  );

  const canSend = draft.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <LinearGradient
        colors={[Ghost.accent.soft, "transparent"]}
        style={styles.heroWash}
        pointerEvents="none"
      />
      <MenuDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <View style={styles.topBar}>
        <TouchableOpacity
          accessibilityLabel="Menu"
          onPress={() => setDrawerOpen(true)}
          hitSlop={12}
        >
          <Menu size={22} color={Ghost.text.primary} />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <GhostText type="headline" style={styles.avatarText}>
            {(displayName ?? "G").slice(0, 1).toUpperCase()}
          </GhostText>
          <View style={[styles.dot, online ? styles.dotOn : styles.dotOff]} />
        </View>
      </View>

      <FlatList
        data={sections}
        keyExtractor={(s, i) => `${s.title}-${i}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={styles.greetingWrap}>
            <GhostText type="display" style={styles.hello}>
              {greeting},{displayName ? ` ${displayName}` : ""}
            </GhostText>
            <GhostText type="display" style={styles.help}>
              How may I help you?
            </GhostText>
            <GhostText type="subhead" style={styles.presence}>
              {online
                ? `Ghost is running${uptimeSeconds ? ` · Up ${formatUptime(uptimeSeconds)}` : ""}`
                : connectionState === "syncing"
                  ? "Ghost is syncing..."
                  : "Ghost is offline."}
            </GhostText>
            {items.length === 0 ? null : (
              <GhostText type="caption" style={styles.inboxLabel}>
                INBOX
              </GhostText>
            )}
          </View>
        }
        renderItem={({ item: section }) => (
          <View>
            <GhostText type="caption" style={styles.sectionTitle}>
              {section.title}
            </GhostText>
            {section.data.map((row) => (
              <View key={row.id}>{renderItem({ item: row })}</View>
            ))}
          </View>
        )}
        ListEmptyComponent={
          items.length === 0 ? (
            <View style={styles.emptyCenter}>
              <GhostText type="body" style={styles.emptyTitle}>
                Nothing new right now.
              </GhostText>
              <GhostText type="subhead" style={styles.emptySubtitle}>
                Ghost will let you know when something comes up.
              </GhostText>
            </View>
          ) : null
        }
      />

      <View style={styles.bottomDock}>
        <View style={styles.cardsRow}>
          <TouchableOpacity
            style={styles.starterCard}
            activeOpacity={0.85}
            onPress={() => goPrompt(STARTER_PROMPT)}
          >
            <GhostText type="callout" style={styles.cardText}>
              {STARTER_PROMPT}
            </GhostText>
            <View style={styles.cardIcon}>
              <Copy size={16} color={Ghost.text.secondary} />
            </View>
          </TouchableOpacity>

          <View style={styles.sideCol}>
            <TouchableOpacity
              style={styles.statusCard}
              activeOpacity={0.85}
              onPress={() =>
                latest
                  ? goPrompt(latest.full, latest.sessionId)
                  : goPrompt("What can you do for me?")
              }
              accessibilityLabel={latest ? "Open latest update in conversation" : "Ask what Ghost can do"}
            >
              <GhostText type="callout" style={styles.cardText} numberOfLines={3}>
                {latest ? latest.preview : "No updates right now"}
              </GhostText>
              <View style={styles.cardIcon}>
                <MapPin size={16} color={Ghost.text.secondary} />
              </View>
            </TouchableOpacity>

            <View style={styles.toolsPill}>
              <TouchableOpacity
                onPress={() => router.push("/conversation" as any)}
                hitSlop={8}
                accessibilityLabel="Attach a file in conversation"
              >
                <Upload size={18} color={Ghost.text.secondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/conversation" as any)}
                hitSlop={8}
                accessibilityLabel="Take a photo in conversation"
              >
                <Camera size={18} color={Ghost.text.secondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/conversation" as any)}
                hitSlop={8}
                accessibilityLabel="Dictate in conversation"
              >
                <Mic size={18} color={Ghost.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + Space.lg }]}>
        <View style={styles.promptBar}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSubmit}
            blurOnSubmit={false}
            returnKeyType="send"
            placeholder="Enter a prompt here"
            placeholderTextColor={Ghost.text.tertiary}
            style={styles.promptInput}
            multiline
            textAlignVertical="top"
            editable={!drawerOpen}
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSend}
            hitSlop={8}
            accessibilityLabel="Send prompt"
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          >
            <Send size={18} color={canSend ? Ghost.bg.base : Ghost.text.tertiary} />
          </TouchableOpacity>
        </View>
        {connectionState !== "online" ? (
          <GhostText type="footnote" style={styles.offlineNote}>
            {connectionState === "syncing" ? "Reconnecting — your prompt will open in conversation." : "Ghost is offline — you can still draft, sending happens in conversation."}
          </GhostText>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  heroWash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 280,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Space.xl,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Ghost.bg.sunken,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: Ghost.text.primary,
  },
  dot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Ghost.bg.base,
  },
  dotOn: {
    backgroundColor: Ghost.status.success,
  },
  dotOff: {
    backgroundColor: Ghost.text.tertiary,
  },
  listContent: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.lg,
    flexGrow: 1,
  },
  greetingWrap: {
    marginTop: Space.section + Space.xxl,
  },
  hello: {
    color: Ghost.text.secondary,
    fontSize: 36,
    lineHeight: 42,
  },
  help: {
    color: Ghost.text.primary,
    fontSize: 36,
    lineHeight: 42,
  },
  presence: {
    color: Ghost.text.tertiary,
    marginTop: Space.sm,
  },
  bottomDock: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
    gap: Space.md,
  },
  cardsRow: {
    flexDirection: "row",
    gap: Space.md,
  },
  emptyCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Space.xxxl,
    gap: Space.xs,
  },
  starterCard: {
    flex: 1.2,
    minHeight: 168,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
    padding: Space.lg,
    justifyContent: "space-between",
  },
  sideCol: {
    flex: 1,
    gap: Space.md,
  },
  statusCard: {
    flex: 1,
    minHeight: 108,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
    padding: Space.md,
    justifyContent: "space-between",
  },
  cardText: {
    color: Ghost.text.primary,
    lineHeight: 20,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Ghost.bg.sunken,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Space.sm,
  },
  toolsPill: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Ghost.border.subtle,
    paddingVertical: Space.sm,
  },
  inboxLabel: {
    color: Ghost.text.tertiary,
    letterSpacing: 0.3,
    marginTop: Space.xxxl,
  },
  sectionTitle: {
    color: Ghost.text.tertiary,
    letterSpacing: 0.3,
    marginTop: Space.xl,
    marginBottom: Space.sm,
  },
  row: {
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowTitle: {
    color: Ghost.text.primary,
    flex: 1,
  },
  rowTime: {
    color: Ghost.text.tertiary,
    marginLeft: Space.sm,
  },
  rowPreview: {
    color: Ghost.text.secondary,
    lineHeight: 20,
  },
  emptyTitle: {
    color: Ghost.text.tertiary,
    textAlign: "center",
  },
  emptySubtitle: {
    color: Ghost.text.tertiary,
    textAlign: "center",
  },
  inputContainer: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
  },
  promptBar: {
    backgroundColor: Ghost.bg.base,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Ghost.border.default,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 56,
    maxHeight: 132,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space.sm,
  },
  promptInput: {
    ...Type.body,
    color: Ghost.text.primary,
    flex: 1,
    minHeight: 24,
    maxHeight: 100,
    paddingVertical: 0,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Ghost.accent.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: Ghost.bg.sunken,
  },
  offlineNote: {
    color: Ghost.text.tertiary,
    marginTop: Space.xs,
  },
});
