import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { Ghost, Space } from "@/constants/theme";
import { GhostText } from "@/components/themed-text";
import { GhostButton, GhostInput, Panel } from "@/components/ghost";
import {
  deleteWebsiteLogin,
  fetchWebsiteLogins,
  saveWebsiteLogin,
  signOutBrowser,
  type GhostConfig,
  type WebsiteLoginInfo,
} from "@/lib/ghostApi";
import { displayUsername, validateWebsiteLogin } from "@/lib/websiteLogins";

/** WebsiteLogins lets the owner save a site sign-in the browser can use. The
 * password goes to the Pod once and is never rendered again. */
export function WebsiteLogins({ config }: { config: GhostConfig }) {
  const [logins, setLogins] = useState<WebsiteLoginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogins(await fetchWebsiteLogins(config));
    } catch {
      // Offline-safe: keep whatever we had.
    }
    setLoading(false);
  }, [config]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback(async () => {
    const problem = validateWebsiteLogin(url, username, password);
    if (problem) {
      Alert.alert("Couldn't save", problem);
      return;
    }
    setBusy(true);
    try {
      await saveWebsiteLogin(config, { url: url.trim(), username: username.trim(), password });
      setUrl("");
      setUsername("");
      setPassword("");
      await load();
    } catch (e) {
      Alert.alert("Couldn't save", String((e as Error)?.message ?? e));
    }
    setBusy(false);
  }, [config, url, username, password, load]);

  const remove = useCallback(
    (host: string) => {
      Alert.alert("Remove this login?", host, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteWebsiteLogin(config, host);
              await load();
            } catch {
              Alert.alert("Couldn't remove that login.");
            }
          },
        },
      ]);
    },
    [config, load],
  );

  const signOut = useCallback(() => {
    Alert.alert("Sign out of all sites?", "Ghost forgets every browser session and cookie. You'll need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOutBrowser(config);
            Alert.alert("Signed out of all sites");
          } catch {
            Alert.alert("Couldn't sign out.");
          }
        },
      },
    ]);
  }, [config]);

  return (
    <Panel description="Ghost can sign in to a site for you. Saved encrypted on your Pod and never shown in chat.">
      {loading ? (
        <ActivityIndicator color={Ghost.text.primary} />
      ) : logins.length === 0 ? (
        <GhostText type="footnote" style={styles.hint}>Nothing saved yet.</GhostText>
      ) : (
        logins.map((l) => (
          <View key={l.host} style={styles.row}>
            <View style={styles.rowBody}>
              <GhostText type="body" style={styles.rowTitle}>{l.host}</GhostText>
              <GhostText type="footnote" style={styles.hint}>{displayUsername(l.username)}</GhostText>
            </View>
            <GhostButton title="Remove" variant="danger" size="sm" onPress={() => remove(l.host)} />
          </View>
        ))
      )}

      <GhostInput
        placeholder="https://example.com/login"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
        editable={!busy}
      />
      <GhostInput
        placeholder="Username"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        editable={!busy}
      />
      <GhostInput
        placeholder="Password"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!busy}
      />
      <View style={styles.actions}>
        <GhostButton title={busy ? "Saving…" : "Save login"} onPress={add} disabled={busy} />
        <GhostButton title="Sign out of all sites" variant="secondary" onPress={signOut} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: Ghost.text.secondary,
    fontWeight: "300",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: Ghost.text.primary,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: Space.sm,
    marginTop: Space.xs,
    flexWrap: "wrap",
  },
});
