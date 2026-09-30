import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Ghost, Radius, Space, Type, Fonts } from "@/constants/theme";
import { GhostButton, GhostInput, GhostSheet } from "@/components/ghost";
import {
  fetchOAuthSetup,
  finishOAuth,
  looksLikeSignInAddress,
  saveOAuthSetup,
  startOAuth,
  type GhostConfig,
  type OAuthSetupInfo,
} from "@/lib/ghostApi";

/**
 * Connect Google Calendar, Gmail, Outlook or Spotify from the phone.
 *
 * These providers only let an app the owner registered sign in, and Ghost ships
 * none, so the first time this walks through registering one (and keeps its ID
 * and secret sealed on the Pod). Signing in is then: approve in the browser, come
 * back, and the copied address finishes it. The page the browser ends on says it
 * can't be reached; that is expected, and it is where the address comes from.
 */

type Stage = "loading" | "setup" | "signin";

function Steps({ items }: { items: string[] }) {
  return (
    <View style={styles.steps}>
      {items.map((t, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.stepNo}>{i + 1}</Text>
          <Text style={styles.stepText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export function OAuthConnect({
  config,
  app,
  onClose,
  onConnected,
}: {
  config: GhostConfig;
  app: { id: string; name: string } | null;
  onClose: () => void;
  onConnected: (message: string) => void;
}) {
  const [stage, setStage] = useState<Stage>("loading");
  const [info, setInfo] = useState<OAuthSetupInfo | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tenant, setTenant] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const id = app?.id ?? null;

  const begin = useCallback(async () => {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const { authUrl: url } = await startOAuth(config, id);
      if (url) {
        setAuthUrl(url);
        setStage("signin");
        void Linking.openURL(url).catch(() => setError("Couldn't open the browser. Use “Open sign-in again”."));
      } else {
        setInfo(await fetchOAuthSetup(config, id));
        setStage("setup");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach your Pod.");
      setStage("setup");
    }
    setBusy(false);
  }, [config, id]);

  // A new app resets the sheet and starts.
  useEffect(() => {
    if (!id) return;
    setStage("loading");
    setInfo(null);
    setAuthUrl(null);
    setClientId("");
    setClientSecret("");
    setTenant("");
    setAddress("");
    setError(null);
    void begin();
  }, [id, begin]);

  const finish = useCallback(
    async (text: string) => {
      if (!id || busyRef.current) return;
      if (!looksLikeSignInAddress(text)) {
        setError("That isn't the address from the sign-in page. Copy the whole address from the top of that page.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const r = await finishOAuth(config, id, text);
        if (r.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          onConnected(r.message);
        } else {
          setError(r.message);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't reach your Pod.");
      }
      setBusy(false);
    },
    [config, id, onConnected],
  );

  // Coming back from the browser with the address copied finishes the sign-in.
  useEffect(() => {
    if (stage !== "signin") return;
    const sub = AppState.addEventListener("change", async (s) => {
      if (s !== "active" || busyRef.current) return;
      try {
        const text = await Clipboard.getStringAsync();
        if (looksLikeSignInAddress(text)) void finish(text);
      } catch {
        // No clipboard access: the button and the field still work.
      }
    });
    return () => sub.remove();
  }, [stage, finish]);

  const finishWithCopied = async () => {
    try {
      await finish(await Clipboard.getStringAsync());
    } catch {
      setError("Couldn't read what you copied. Paste it below instead.");
    }
  };

  const saveSetup = async () => {
    if (!id) return;
    if (!clientId.trim() || !clientSecret.trim()) {
      setError("Paste both the client ID and the client secret.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveOAuthSetup(config, id, { clientId, clientSecret, tenant });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
      setBusy(false);
      return;
    }
    setBusy(false);
    await begin();
  };

  const copyRedirect = async () => {
    if (!info) return;
    await Clipboard.setStringAsync(info.redirect).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const name = app?.name ?? "";

  return (
    <GhostSheet
      visible={app !== null}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={stage === "setup" ? `Set up ${name}` : `Connect ${name}`}
    >
      {stage === "loading" ? <Text style={styles.note}>One moment…</Text> : null}

      {stage === "setup" && info ? (
        <>
          <Text style={styles.lead}>
            {name} signs in through an app that you own. It takes a few minutes, is free, and is done once.
          </Text>
          <Steps items={info.steps} />
          <Pressable onPress={() => void Linking.openURL(info.consoleUrl)} accessibilityRole="link" hitSlop={8}>
            <Text style={styles.link}>Open the provider’s page ↗</Text>
          </Pressable>
          {info.provider !== "google" ? (
            <View style={styles.copyRow}>
              <Text style={styles.code} numberOfLines={1}>{info.redirect}</Text>
              <Pressable onPress={() => void copyRedirect()} style={styles.copyBtn} accessibilityRole="button" accessibilityLabel="Copy the redirect address">
                <Text style={styles.copyText}>{copied ? "Copied" : "Copy"}</Text>
              </Pressable>
            </View>
          ) : null}
          <GhostInput value={clientId} onChangeText={setClientId} placeholder="Client ID" />
          <GhostInput value={clientSecret} onChangeText={setClientSecret} placeholder="Client secret" secureTextEntry />
          {info.needsTenant ? <GhostInput value={tenant} onChangeText={setTenant} placeholder="Account type (optional): common" /> : null}
          <Text style={styles.note}>Kept sealed on your Pod, like your API keys. Never shown back.</Text>
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          <GhostButton title="Save and sign in" fullWidth loading={busy} onPress={() => void saveSetup()} />
        </>
      ) : null}

      {stage === "setup" && !info && error ? (
        <>
          <Text style={styles.error}>{error}</Text>
          <GhostButton title="Try again" fullWidth onPress={() => void begin()} />
        </>
      ) : null}

      {stage === "signin" ? (
        <>
          <Steps
            items={[
              "Approve access in the browser that just opened.",
              "Afterwards it will say the page can’t be reached. That’s expected: it means the sign-in worked.",
              "Copy the whole address from the top of that page, then come back here.",
            ]}
          />
          <GhostButton title="Use the address I copied" fullWidth loading={busy} onPress={() => void finishWithCopied()} />
          <GhostInput value={address} onChangeText={setAddress} placeholder="Or paste the address here" keyboardType="url" />
          {address.trim() ? <GhostButton title="Connect" variant="secondary" fullWidth disabled={busy} onPress={() => void finish(address)} /> : null}
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          <View style={styles.links}>
            {authUrl ? (
              <Pressable onPress={() => void Linking.openURL(authUrl)} hitSlop={8} accessibilityRole="link">
                <Text style={styles.link}>Open sign-in again</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={async () => {
                setError(null);
                try {
                  if (id) setInfo(await fetchOAuthSetup(config, id));
                  setStage("setup");
                } catch {
                  setError("Couldn't reach your Pod.");
                }
              }}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.link}>Change app details</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </GhostSheet>
  );
}

const styles = StyleSheet.create({
  lead: { ...Type.callout, color: Ghost.text.secondary },
  note: { ...Type.subhead, color: Ghost.text.tertiary },
  error: { ...Type.callout, color: Ghost.status.error },
  link: { ...Type.callout, color: Ghost.accent.primary, fontWeight: "500" },
  links: { flexDirection: "row", justifyContent: "space-between", paddingTop: Space.xs },
  steps: { gap: 10 },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepNo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    overflow: "hidden",
    textAlign: "center",
    lineHeight: 22,
    fontSize: 12,
    fontWeight: "700",
    color: Ghost.text.secondary,
    backgroundColor: Ghost.bg.sunken,
  },
  stepText: { ...Type.callout, flex: 1, color: Ghost.text.primary },
  copyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    backgroundColor: Ghost.bg.sunken,
    borderRadius: Radius.lg,
    borderCurve: "continuous",
    paddingLeft: Space.md,
    paddingRight: 6,
    paddingVertical: 6,
  },
  code: { flex: 1, fontFamily: Fonts?.mono ?? "monospace", fontSize: 13, color: Ghost.text.primary },
  copyBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Ghost.bg.raised },
  copyText: { fontSize: 13, fontWeight: "600", color: Ghost.text.primary },
});
