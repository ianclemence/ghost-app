import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { CircleCheck, Eye, EyeOff, Lock, ShieldCheck } from "lucide-react-native";
import { Text } from "@/components/text";
import { GlassCard } from "@/components/glass";
import { GhostButton, GhostInput, GhostToggle } from "@/components/ghost";
import { SiteIcon } from "@/components/vault-icon";
import { alpha, Fonts, Ghost, Space } from "@/constants/theme";
import { answerVaultCredentials, resolveCard, type GhostConfig } from "@/lib/ghostApi";
import type { RichCard } from "@/lib/cards";
import { credentialFootnote, siteHost, siteName } from "@/lib/vault";

/**
 * A credentials card: Ghost needs to sign in to a site it has no login for.
 * The owner types the sign-in here, on their phone. It goes straight from this
 * form to the Pod's Vault, sealed on the way; the model never sees it, and the
 * card itself holds only the site. The footer says the same thing in the
 * owner's words: never shown to Ghost, only filled on that site.
 */
export function CredentialsCard({
  card,
  config,
  onResolved,
}: {
  card: RichCard;
  config: GhostConfig;
  onResolved?: (card: RichCard) => void;
}) {
  const host = siteHost(typeof card.data?.host === "string" ? card.data.host : "");
  const service = typeof card.data?.service === "string" && card.data.service ? card.data.service : siteName(host) || host;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [save, setSave] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState<"submit" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // The card can be resolved on another device while this one is open.
  if (card.resolved) {
    return (
      <View style={styles.receipt} accessible accessibilityLabel={`${card.title}. ${card.resolved.label}`}>
        <CircleCheck size={16} color={Ghost.status.success} strokeWidth={1.9} />
        <Text style={styles.receiptText} numberOfLines={2}>{card.resolved.label}</Text>
      </View>
    );
  }

  const submit = async () => {
    if (busy) return;
    if (!username.trim() || !password) {
      setError("Enter both the username and the password.");
      return;
    }
    setBusy("submit");
    setError(null);
    const r = await answerVaultCredentials(config, {
      card_id: card.id,
      username: username.trim(),
      password,
      save,
    });
    // Whatever happened, the secret leaves this component's state now.
    setPassword("");
    if (!alive.current) return;
    setBusy(null);
    if (!r.ok) {
      setError(r.error ?? "That sign-in wasn't saved.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (r.card) onResolved?.(r.card);
    else onResolved?.({ ...card, resolved: { action_id: "submitted", label: `Signed in to ${host}` } });
  };

  const dismiss = async () => {
    if (busy) return;
    setBusy("dismiss");
    setError(null);
    const r = await resolveCard(config, card.id, "dismiss");
    if (!alive.current) return;
    setBusy(null);
    if (r.card) onResolved?.(r.card);
    else if (r.ok) onResolved?.({ ...card, resolved: { action_id: "dismiss", label: "Dismissed" } });
    else setError(r.error ?? "Couldn't put that away. Try again.");
  };

  return (
    <GlassCard tone="attention" style={styles.card} accessibilityLabel={`${card.title}. A private sign-in form.`}>
      <View style={styles.kickerRow}>
        <View style={styles.lock}>
          <Lock size={13} color={Ghost.ember} strokeWidth={2} />
        </View>
        <Text style={styles.kicker}>Ghost needs a sign-in</Text>
      </View>
      <Text style={styles.title}>{card.title}</Text>
      {card.body ? <Text style={styles.body}>{card.body}</Text> : null}

      <View style={styles.site}>
        <SiteIcon host={host} />
        <View style={styles.siteText}>
          <Text style={styles.siteName} numberOfLines={1}>{service}</Text>
          <Text style={styles.siteHost} numberOfLines={1}>{host}</Text>
        </View>
      </View>

      <View style={styles.fields}>
        <View style={styles.field}>
          <Text style={styles.label}>Email address or username</Text>
          <GhostInput
            value={username}
            onChangeText={setUsername}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            accessibilityLabel="Email address or username"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordWrap}>
            <GhostInput
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry={!reveal}
              editable={!busy}
              style={styles.passwordInput}
              accessibilityLabel="Password"
            />
            <Pressable
              onPress={() => setReveal((v) => !v)}
              hitSlop={10}
              style={styles.eye}
              accessibilityRole="button"
              accessibilityLabel={reveal ? "Hide the password" : "Show the password"}
            >
              {reveal ? <EyeOff size={17} color={Ghost.text.tertiary} strokeWidth={1.8} /> : <Eye size={17} color={Ghost.text.tertiary} strokeWidth={1.8} />}
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.saveRow}>
        <ShieldCheck size={17} color={Ghost.status.success} strokeWidth={1.8} />
        <View style={styles.saveText}>
          <Text style={styles.saveTitle}>Securely save to Ghost&apos;s vault</Text>
          <Text style={styles.saveHint}>{save ? "Ghost can use it again, without asking." : "Used for this task only, then forgotten."}</Text>
        </View>
        <GhostToggle value={save} onValueChange={setSave} accessibilityLabel="Securely save to Ghost's vault" />
      </View>

      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}

      <View style={styles.actions}>
        <GhostButton title={busy === "submit" ? "Signing in" : "Sign in securely"} loading={busy === "submit"} disabled={busy !== null} onPress={() => void submit()} />
        <GhostButton title="Not now" size="sm" variant="secondary" disabled={busy !== null} loading={busy === "dismiss"} onPress={() => void dismiss()} />
      </View>

      <Pressable
        onPress={() => host && Linking.openURL(`https://${host}`).catch(() => {})}
        disabled={!host}
        accessibilityRole="link"
        accessibilityLabel={`Open ${host} in your browser`}
      >
        <Text style={styles.footnote}>
          {credentialFootnote(host)}
        </Text>
      </Pressable>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Space.sm },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  lock: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderCurve: "continuous",
    backgroundColor: alpha(Ghost.ember, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(Ghost.ember, 0.3),
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: { flex: 1, fontSize: 13, fontWeight: "500", color: Ghost.text.secondary },
  title: {
    fontFamily: Fonts.voice,
    fontSize: 27,
    lineHeight: 32,
    letterSpacing: -0.5,
    color: Ghost.text.primary,
  },
  body: { fontSize: 15.5, lineHeight: 23, fontWeight: "300", color: "rgba(255,255,255,0.78)" },
  site: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: Space.xs,
    padding: 10,
    paddingRight: 14,
    borderRadius: 18,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  siteText: { flex: 1, minWidth: 0, gap: 1 },
  siteName: { fontSize: 15, lineHeight: 20, fontWeight: "500", color: Ghost.text.primary },
  siteHost: { fontSize: 12.5, lineHeight: 17, color: Ghost.text.tertiary },
  fields: { gap: Space.md, marginTop: Space.xs },
  field: { gap: 6 },
  label: { fontSize: 11.5, fontWeight: "500", letterSpacing: 1.1, textTransform: "uppercase", color: Ghost.text.tertiary, marginLeft: 2 },
  passwordWrap: { justifyContent: "center" },
  passwordInput: { paddingRight: 46 },
  eye: { position: "absolute", right: 12, height: 44, width: 32, alignItems: "center", justifyContent: "center" },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: Space.xs,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  saveText: { flex: 1, minWidth: 0, gap: 1 },
  saveTitle: { fontSize: 13.5, lineHeight: 18, fontWeight: "500", color: Ghost.text.primary },
  saveHint: { fontSize: 12, lineHeight: 16, color: Ghost.text.tertiary },
  error: { fontSize: 13, lineHeight: 18, color: Ghost.status.error },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: Space.sm, marginTop: Space.xs },
  footnote: { fontSize: 12, lineHeight: 17, color: Ghost.text.tertiary, marginTop: 2 },
  receipt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
    marginTop: Space.xs,
  },
  receiptText: { flex: 1, fontSize: 13.5, lineHeight: 18, color: Ghost.text.tertiary },
});
