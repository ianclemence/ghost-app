import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ghost, Space, Type } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { PlusMenu } from "@/components/plus-menu";
import { EmptyState, GhostButton } from "@/components/ghost";
import {
  connectConnectedApp,
  disconnectConnectedApp,
  fetchConnectedApps,
  type ConnectedAppInfo,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";

function statusLabel(s: string): string {
  switch (s) {
    case "connected":
      return "Connected";
    case "not_configured":
      return "Not connected";
    case "configuring":
      return "Setting up";
    case "expired":
    case "invalid":
    case "revoked":
      return "Needs attention";
    case "error":
      return "Error";
    default:
      return s ? s.replace(/_/g, " ") : "Unknown";
  }
}

function setupHint(app: ConnectedAppInfo): string {
  if (app.setup === "console_oauth" || app.auth_kind === "oauth") {
    return "Browser sign-in required — use the web console, then pull to refresh.";
  }
  if (app.setup === "paste_pair") {
    return "Needs instance URL + token.";
  }
  return "Paste a key to connect.";
}

export default function ConnectionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config } = useGhostStore();
  const [items, setItems] = useState<ConnectedAppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState<Record<string, string>>({});
  const [urlInput, setUrlInput] = useState<Record<string, string>>({});

  const load = useCallback(async (silent = false) => {
    if (!config) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      setItems(await fetchConnectedApps(config));
    } catch {
      setError("Couldn't load connected apps.");
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const handleConnect = useCallback(async (app: ConnectedAppInfo) => {
    if (!config || busyId) return;
    if (app.auth_kind === "oauth" || app.setup === "console_oauth") {
      Alert.alert(
        "Browser sign-in needed",
        `${app.display_name || app.id} uses secure OAuth. Connect in the Ghost web console, then pull to refresh here.`,
      );
      return;
    }
    const value = (keyInput[app.id] ?? "").trim();
    const extra = (urlInput[app.id] ?? "").trim();
    // paste_pair (Home Assistant): value=token, extra=url — accept either order.
    if (app.setup === "paste_pair" && (!value || !extra)) {
      Alert.alert("Missing details", "Enter both the instance URL and token.");
      return;
    }
    if (app.setup !== "paste_pair" && !value) {
      Alert.alert("Missing key", "Paste the key first.");
      return;
    }
    setBusyId(app.id);
    try {
      if (app.setup === "paste_pair") {
        await connectConnectedApp(config, app.id, extra, value);
      } else {
        await connectConnectedApp(config, app.id, value);
      }
      setKeyInput((m) => ({ ...m, [app.id]: "" }));
      setUrlInput((m) => ({ ...m, [app.id]: "" }));
      await load(true);
    } catch (e) {
      Alert.alert("Connect failed", e instanceof Error ? e.message : "Unknown error");
    }
    setBusyId(null);
  }, [config, busyId, keyInput, urlInput, load]);

  const handleDisconnect = useCallback(async (app: ConnectedAppInfo) => {
    if (!config || busyId) return;
    Alert.alert("Disconnect?", `${app.display_name || app.id} will stop working until you reconnect.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect", style: "destructive",
        onPress: async () => {
          setBusyId(app.id);
          try {
            await disconnectConnectedApp(config, app.id);
            await load(true);
          } catch (e) {
            Alert.alert("Disconnect failed", e instanceof Error ? e.message : "Unknown error");
          }
          setBusyId(null);
        },
      },
    ]);
  }, [config, busyId, load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <GhostText type="largeTitle" style={styles.title} accessibilityRole="header">Connected Apps</GhostText>
        <GhostText type="subhead" style={styles.sub}>What Ghost can act on — email, calendar, home, music, code. Messaging channels live elsewhere.</GhostText>
      </View>
      {!config ? (
        <EmptyState
          title="Not connected"
          subtitle="Connected apps live on a Ghost Pod. Connect one to use them."
          action={<GhostButton title="Connect a Ghost Pod" onPress={() => router.push("/connect")} />}
        />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={Ghost.text.primary} size="large" /></View>
      ) : error && items.length === 0 ? (
        <View style={styles.center}><EmptyState title="Couldn't load apps." subtitle={error} action={<GhostButton title="Retry" onPress={() => load()} />} /></View>
      ) : items.length === 0 ? (
        <View style={styles.center}><EmptyState title="No apps yet." subtitle="Connected services will appear here." /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={Ghost.text.primary} />}
        >
          {items.map((c) => {
            const connected = c.status === "connected";
            const busy = busyId === c.id;
            return (
              <View key={c.id} style={styles.row}>
                <View style={styles.rowBody}>
                  <GhostText type="headline" style={styles.rowTitle}>{c.display_name || c.provider}</GhostText>
                  <GhostText type="footnote" style={styles.rowMeta}>
                    {statusLabel(c.status)}{c.needs_reauth ? " — reconnect needed" : ""}
                  </GhostText>
                  {Array.isArray(c.capabilities) && c.capabilities.length > 0 ? (
                    <GhostText type="footnote" style={styles.rowCaps}>{c.capabilities.join(" · ")}</GhostText>
                  ) : null}
                  {!connected ? (
                    <GhostText type="footnote" style={styles.rowHint}>{setupHint(c)}</GhostText>
                  ) : null}
                  {c.help ? (
                    <GhostText type="footnote" style={styles.rowHint}>{c.help}</GhostText>
                  ) : null}
                  {!connected && c.setup === "paste_pair" ? (
                    <TextInput
                      style={styles.input}
                      placeholder="https://homeassistant.local:8123"
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={urlInput[c.id] ?? ""}
                      onChangeText={(t) => setUrlInput((m) => ({ ...m, [c.id]: t }))}
                      editable={!busy}
                    />
                  ) : null}
                  {!connected && c.setup !== "console_oauth" && c.auth_kind !== "oauth" ? (
                    <TextInput
                      style={styles.input}
                      placeholder={c.setup === "paste_pair" ? "Long-lived token" : "Paste key"}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                      value={keyInput[c.id] ?? ""}
                      onChangeText={(t) => setKeyInput((m) => ({ ...m, [c.id]: t }))}
                      editable={!busy}
                    />
                  ) : null}
                  <View style={styles.actions}>
                    {!connected && c.setup !== "console_oauth" && c.auth_kind !== "oauth" ? (
                      <GhostButton title={busy ? "Working…" : "Connect"} onPress={() => handleConnect(c)} />
                    ) : null}
                    {connected ? (
                      <GhostButton title={busy ? "Working…" : "Disconnect"} onPress={() => handleDisconnect(c)} />
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
          <GhostText type="footnote" style={styles.note}>OAuth apps (Gmail, Outlook, Calendar, Spotify) connect via browser sign-in. GitHub, Notion, and provider keys can be pasted here. Keys never leave your Ghost.</GhostText>
        </ScrollView>
      )}
      <PlusMenu />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  header: {
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  title: {
    ...Type.largeTitle,
    color: Ghost.text.primary,
  },
  sub: {
    ...Type.subhead,
    color: Ghost.text.secondary,
    marginTop: 2,
  },
  center: {
    flex: 1,
    justifyContent: "center",
  },
  list: {
    paddingHorizontal: Space.xl,
    paddingBottom: Space.huge,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Ghost.border?.subtle ?? "transparent",
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: Ghost.text.primary,
  },
  rowMeta: {
    color: Ghost.text.secondary,
  },
  rowCaps: {
    color: Ghost.text.tertiary,
  },
  rowHint: {
    color: Ghost.text.tertiary,
  },
  input: {
    borderWidth: 1,
    borderColor: Ghost.border?.subtle ?? "#333",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: Ghost.text.primary,
    marginTop: 6,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  note: {
    color: Ghost.text.tertiary,
    marginTop: Space.lg,
  },
});
