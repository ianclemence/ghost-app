import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { Bell, Camera, Menu, Mic, Sparkles, Upload } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ghost, Radius, Space } from "@/constants/theme";
import { Composer } from "@/components/composer";
import { GhostText } from "@/components/themed-text";
import { EmptyState } from "@/components/ghost";
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
  const { connectionState, inbox, ghostName, profile, uptimeSeconds, setCurrentSession } = useGhostStore();
  const [greeting] = useState(getGreeting);
  const [draft, setDraft] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navBusy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      navBusy.current = false;
      return () => {
        navBusy.current = true;
      };
    }, []),
  );

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

  const freshSessionId = useCallback(
    () => `mobile:home:${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    [],
  );

  const openOriginSession = useCallback(
    (sessionId: string | null) => {
      if (!sessionId) return false;
      setCurrentSession(sessionId);
      router.push({ pathname: "/conversation", params: { sessionId } } as any);
      return true;
    },
    [router, setCurrentSession],
  );

  const startFreshPrompt = useCallback(
    (prompt: string, attach?: "camera" | "photo" | "file", autoSend?: boolean) => {
      if (navBusy.current) return;
      const q = prompt.trim();
      if (!q && !attach) return;
      navBusy.current = true;
      const id = freshSessionId();
      setCurrentSession(id);
      const params: Record<string, string> = { sessionId: id };
      if (q) params.prompt = q;
      if (attach) params.attach = attach;
      if (autoSend && q) params.autoSend = "1";
      router.push({ pathname: "/conversation", params } as any);
    },
    [router, setCurrentSession, freshSessionId],
  );

  const sendCardPrompt = useCallback(
    (prompt: string) => startFreshPrompt(prompt, undefined, true),
    [startFreshPrompt],
  );

  const openFreshConversation = useCallback(() => {
    if (navBusy.current) return;
    navBusy.current = true;
    const id = freshSessionId();
    setCurrentSession(id);
    router.push({ pathname: "/conversation", params: { sessionId: id } } as any);
  }, [router, setCurrentSession, freshSessionId]);

  const handleSubmit = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setDraft("");
    startFreshPrompt(q);
  };

  const renderItem = useCallback(
    ({ item }: { item: HomeItem }) => (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.6}
        onPress={() => {
          if (!openOriginSession(item.sessionId)) startFreshPrompt(item.full);
        }}
        accessibilityLabel="Open origin conversation"
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
    [openOriginSession, startFreshPrompt],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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
            <GhostText type="largeTitle" style={styles.hello}>
              {greeting},{displayName ? ` ${displayName}` : ""}
            </GhostText>
            <GhostText type="largeTitle" style={styles.help}>
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
              <EmptyState
                title="Nothing new right now."
                subtitle="Ghost will let you know when something comes up."
              />
            </View>
          ) : null
        }
      />

      <View style={styles.bottomDock}>
        <View style={styles.cardsRow}>
          <TouchableOpacity
            style={styles.starterCard}
            activeOpacity={0.85}
            onPress={() => sendCardPrompt(STARTER_PROMPT)}
            accessibilityLabel="Send briefing prompt to Ghost now"
          >
            <GhostText type="callout" style={styles.cardText}>
              {STARTER_PROMPT}
            </GhostText>
            <View style={styles.cardIcon}>
              <Sparkles size={16} color={Ghost.text.secondary} />
            </View>
          </TouchableOpacity>

          <View style={styles.sideCol}>
            <TouchableOpacity
              style={styles.statusCard}
              activeOpacity={0.85}
              onPress={() => {
                if (latest?.sessionId) openOriginSession(latest.sessionId);
                else sendCardPrompt("What can you do for me?");
              }}
              accessibilityLabel={latest?.sessionId ? "Open the conversation this update came from" : "Send to Ghost now"}
            >
              <GhostText type="callout" style={styles.cardText} numberOfLines={3}>
                {latest ? latest.preview : "No updates right now"}
              </GhostText>
              <View style={styles.cardIcon}>
                <Bell size={16} color={Ghost.text.secondary} />
              </View>
            </TouchableOpacity>

            <View style={styles.toolsPill}>
              <TouchableOpacity
                onPress={() => startFreshPrompt("", "file")}
                hitSlop={8}
                accessibilityLabel="Start a new conversation with file picker"
              >
                <Upload size={18} color={Ghost.text.secondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => startFreshPrompt("", "camera")}
                hitSlop={8}
                accessibilityLabel="Start a new conversation with camera"
              >
                <Camera size={18} color={Ghost.text.secondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openFreshConversation}
                hitSlop={8}
                accessibilityLabel="Start a new conversation with voice input"
              >
                <Mic size={18} color={Ghost.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.inputContainer, { paddingBottom: insets.bottom }]}>
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSubmit={handleSubmit}
          placeholder="Enter a prompt here"
          editable={!drawerOpen}
          minimal
          showMic={false}
          minHeight={72}
        />
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
    marginTop: Space.xxxl + Space.sm,
  },
  hello: {
    color: Ghost.text.secondary,
  },
  help: {
    color: Ghost.text.primary,
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
    marginTop: Space.xxxl,
  },
  sectionTitle: {
    color: Ghost.text.tertiary,
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
  inputContainer: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
  },
});
