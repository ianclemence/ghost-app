import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, RefreshControl, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useRouter } from "expo-router";
import { Ghost, Space, Type } from "@/constants/theme";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EmptyState, GhostButton, GhostInput, GhostList, GhostSheet, OfflineBadge, SectionHeader, StatusPill } from "@/components/ghost";
import { OAuthConnect } from "@/components/oauth-connect";
import {
  connectConnectedApp,
  disconnectConnectedApp,
  fetchConnectedApps,
  type ConnectedAppInfo,
} from "@/lib/ghostApi";
import { useGhostStore } from "@/lib/store";
import { WebsiteLogins } from "@/components/website-logins";
import { EdgeScrollView } from "@/components/scroll-edge";

const isOAuth = (a: ConnectedAppInfo) => a.auth_kind === "oauth" || a.setup === "console_oauth";
const isPair = (a: ConnectedAppInfo) => a.setup === "paste_pair";
const nameOf = (a: ConnectedAppInfo) => a.display_name || a.provider || a.id;

/** The right-hand side of a row: what state it is in, or what tapping does. */
function trailing(a: ConnectedAppInfo): { text: string; tone: "ok" | "warn" | "action" } {
  if (a.status === "connected") return { text: "Connected", tone: "ok" };
  if (a.needs_reauth) return { text: "Reconnect", tone: "warn" };
  if (a.status === "error") return { text: "Error", tone: "warn" };
  return { text: "Connect", tone: "action" };
}

export default function ConnectionsScreen() {
  const router = useRouter();
  const { config } = useGhostStore();
  const connectionState = useGhostStore((s) => s.connectionState);
  const [items, setItems] = useState<ConnectedAppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What is open: the key sheet, the manage sheet, or the sign-in flow.
  const [keyFor, setKeyFor] = useState<ConnectedAppInfo | null>(null);
  const [manage, setManage] = useState<ConnectedAppInfo | null>(null);
  const [signIn, setSignIn] = useState<ConnectedAppInfo | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheetNote, setSheetNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!config) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        setItems(await fetchConnectedApps(config));
      } catch {
        setError("Couldn't load connected apps.");
      }
      setLoading(false);
    },
    [config],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const open = (a: ConnectedAppInfo) => {
    setSheetError(null);
    setSheetNote(null);
    if (a.status === "connected") return setManage(a);
    if (isOAuth(a)) return setSignIn(a);
    setKeyValue("");
    setUrlValue("");
    setKeyFor(a);
  };

  const saveKey = async () => {
    if (!config || !keyFor || busy) return;
    const value = keyValue.trim();
    const extra = urlValue.trim();
    if (isPair(keyFor) ? !value || !extra : !value) {
      setSheetError(isPair(keyFor) ? "Enter both the address and the token." : "Paste the key first.");
      return;
    }
    setBusy(true);
    setSheetError(null);
    try {
      // Home Assistant is the address and the token; everything else is one key.
      const result = isPair(keyFor)
        ? await connectConnectedApp(config, keyFor.id, extra, value)
        : await connectConnectedApp(config, keyFor.id, value);
      // Saved, but the service couldn't be reached to check it: say so and stay.
      if (result.note) {
        setSheetNote(result.note);
        setKeyFor(null);
        setManage({ ...keyFor, status: "connected" });
      } else {
        setKeyFor(null);
      }
      await load(true);
    } catch (e) {
      // The Pod says why, in plain words ("GitHub didn't accept that").
      setSheetError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    }
    setBusy(false);
  };

  const disconnect = async () => {
    if (!config || !manage || busy) return;
    setBusy(true);
    try {
      await disconnectConnectedApp(config, manage.id);
      setManage(null);
      await load(true);
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : "Couldn't disconnect.");
    }
    setBusy(false);
  };

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Connected apps" subtitle="What Ghost is plugged into" />
      {config && connectionState !== "online" ? (
        <View style={styles.offlineWrap}>
          <OfflineBadge state={connectionState === "syncing" ? "syncing" : "offline"} />
        </View>
      ) : null}
      {!config ? (
        <EmptyState
          title="Not connected"
          subtitle="Connected apps live on a Ghost Pod. Connect one to use them."
          action={<GhostButton title="Connect a Ghost Pod" onPress={() => router.push("/connect")} />}
        />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={Ghost.text.secondary} /></View>
      ) : error && items.length === 0 ? (
        <View style={styles.center}><EmptyState title="Couldn't load apps." subtitle={error} action={<GhostButton title="Retry" onPress={() => void load()} />} /></View>
      ) : (
        <KeyboardAvoidingView style={styles.fill} behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}>
          <EdgeScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={Ghost.text.secondary} />}
          >
          <SectionHeader title="Apps" style={styles.firstSection} />
          <GhostList>
            {items.map((c) => {
              const t = trailing(c);
              return (
                <View key={c.id} style={styles.row} accessible accessibilityLabel={`${nameOf(c)}, ${t.text}`}>
                  <View style={styles.rowBody}>
                    <Text style={styles.name}>{nameOf(c)}</Text>
                    {c.help ? <Text style={styles.help} numberOfLines={2}>{c.help}</Text> : null}
                  </View>
                  {t.tone === "ok" ? (
                    <GhostButton title="Manage" size="sm" variant="secondary" onPress={() => open(c)} />
                  ) : (
                    <GhostButton
                      title={t.text}
                      size="sm"
                      variant="secondary"
                      onPress={() => open(c)}
                    />
                  )}
                </View>
              );
            })}
          </GhostList>
          <SectionHeader title="Website logins" />
          <WebsiteLogins config={config} />
          </EdgeScrollView>
        </KeyboardAvoidingView>
      )}

      {/* A key, or an address and a token. */}
      <GhostSheet
        visible={keyFor !== null}
        onClose={() => { if (!busy) setKeyFor(null); }}
        title={keyFor ? `Connect ${nameOf(keyFor)}` : ""}
      >
        {keyFor ? (
          <>
            {keyFor.help ? <Text style={styles.sheetText}>{keyFor.help}</Text> : null}
            {isPair(keyFor) ? (
              <GhostInput value={urlValue} onChangeText={setUrlValue} placeholder="https://homeassistant.local:8123" keyboardType="url" editable={!busy} />
            ) : null}
            <GhostInput value={keyValue} onChangeText={setKeyValue} placeholder={isPair(keyFor) ? "Long-lived token" : "Paste your key"} secureTextEntry editable={!busy} />
            <Text style={styles.sheetText}>Kept sealed on your Pod, never shown back or sent to the AI.</Text>
            {sheetError ? <Text style={styles.sheetError} accessibilityLiveRegion="polite">{sheetError}</Text> : null}
            <GhostButton title="Connect" fullWidth loading={busy} onPress={() => void saveKey()} />
          </>
        ) : null}
      </GhostSheet>

      {/* Something already connected: the one thing to do with it. */}
      <GhostSheet
        visible={manage !== null}
        onClose={() => { if (!busy) setManage(null); }}
        title={manage ? nameOf(manage) : ""}
        message={sheetNote ?? "Connected. Ghost stops using it the moment you disconnect."}
      >
        {sheetError ? <Text style={styles.sheetError}>{sheetError}</Text> : null}
        <GhostButton title="Disconnect" variant="danger" fullWidth loading={busy} onPress={() => void disconnect()} />
      </GhostSheet>

      {/* Google, Microsoft and Spotify: your own app, then sign in. */}
      {config ? (
        <OAuthConnect
          config={config}
          app={signIn ? { id: signIn.id, name: nameOf(signIn) } : null}
          onClose={() => setSignIn(null)}
          onConnected={() => {
            setSignIn(null);
            void load(true);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  fill: { flex: 1 },
  offlineWrap: { alignItems: "center" },
  center: { flex: 1, justifyContent: "center" },
  list: { paddingBottom: 96 },
  firstSection: { paddingTop: Space.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    paddingVertical: Space.md,
    paddingHorizontal: Space.xl,
    gap: Space.md,
  },
  rowBody: { flex: 1, gap: 1 },
  name: { fontSize: 16, lineHeight: 21, fontWeight: "500", letterSpacing: -0.15, color: Ghost.text.primary },
  help: { fontSize: 13.5, lineHeight: 19, fontWeight: "300", color: Ghost.text.secondary },
  sheetText: { ...Type.subhead, color: Ghost.text.tertiary },
  sheetError: { ...Type.callout, color: Ghost.status.error },
});
