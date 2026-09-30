import { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GhostText } from "@/components/themed-text";
import { GhostButton, GhostInput } from "@/components/ghost";
import { Ghost, Space, UI } from "@/constants/theme";
import { setupPod } from "@/lib/setupPod";
import { BRAINS, brainByKey, brainProblem } from "@/lib/brains";
import { completePairing } from "@/lib/connection";

/**
 * Set up a brand-new Ghost Pod from the phone.
 *
 * Phone-first front door: enter the Pod address and the one-time setup code
 * shown in the device's console output, choose identity and password, and the
 * phone claims the Pod and pairs in one pass. If the gateway is slow to start,
 * setup still succeeds and we fall back to the console QR for pairing.
 */
export default function SetupPodScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ host?: string; port?: string; pod?: string }>();
  const [host, setHost] = useState(typeof params.host === "string" ? params.host : "");
  const [port, setPort] = useState(typeof params.port === "string" ? params.port : "80");
  const [code, setCode] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ghostName, setGhostName] = useState("Ghost");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [brain, setBrain] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleClaim = async () => {
    if (busy) return;
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    const brainIssue = brainProblem(brain, apiKey);
    if (brainIssue) {
      setError(brainIssue);
      return;
    }
    setBusy(true);
    const result = await setupPod({
      provider: brain,
      apiKey,
      host,
      port,
      setupCode: code,
      adminPassword: password,
      ownerName,
      ghostName,
    });
    if (!result.ok) {
      setError(result.error ?? "Setup failed.");
      setBusy(false);
      return;
    }
    if (result.pairing) {
      const p = result.pairing;
      const paired = await completePairing({
        token: p.token,
        host: p.host ?? host.trim(),
        port: p.port ?? "8766",
        transport: p.transport === "relay" ? "relay" : "lan",
      });
      setBusy(false);
      if (paired.ok) {
        router.replace("/pairing-success" as never);
        return;
      }
      setError(paired.error ?? "Pod set up, but pairing failed. Pair from the console.");
      return;
    }
    setBusy(false);
    setPending(true);
  };

  if (pending) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + UI.modal.top }]}>
        <View style={styles.centered}>
          <GhostText type="largeTitle" style={styles.title}>
            Ghost Pod is set up.
          </GhostText>
          <GhostText type="body" style={styles.description}>
            Pair this phone from the Ghost console (Devices → Pair a phone) to finish.
          </GhostText>
        </View>
        <View style={[styles.bottom, { paddingBottom: insets.bottom + UI.modal.bottom }]}>
          <GhostButton title="Enter a pairing code" variant="primary" onPress={() => router.replace("/manual" as never)} fullWidth />
          <GhostButton title="Done" variant="secondary" onPress={() => router.replace("/(tabs)" as never)} fullWidth />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: Ghost.bg.base }}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + UI.modal.bottom, paddingBottom: insets.bottom + UI.modal.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <GhostText type="largeTitle" style={styles.title}>
          Set up a new Ghost Pod
        </GhostText>
        <GhostText type="body" style={styles.description}>
          Bring a brand-new Pod online from this phone. The setup code is printed
          in the Pod&apos;s console output on the device.
        </GhostText>

        <View style={styles.scanRow}>
          <GhostButton
            title="Scan setup QR"
            variant="secondary"
            onPress={() => router.push("/scan" as never)}
            fullWidth
          />
        </View>

        <GhostText type="caption" style={styles.label}>Ghost Pod address</GhostText>
        <GhostInput
          value={host}
          onChangeText={setHost}
          accessibilityLabel="Ghost Pod address"
          placeholder="192.168.1.42"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <GhostText type="caption" style={styles.label}>Console port</GhostText>
        <GhostInput
          value={port}
          onChangeText={setPort}
          accessibilityLabel="Console port"
          placeholder="80"
          keyboardType="number-pad"
        />

        <GhostText type="caption" style={styles.label}>Setup code</GhostText>
        <GhostInput
          value={code}
          onChangeText={setCode}
          accessibilityLabel="Setup code"
          placeholder="123456"
          keyboardType="number-pad"
        />

        <GhostText type="caption" style={styles.label}>Your name</GhostText>
        <GhostInput
          value={ownerName}
          onChangeText={setOwnerName}
          accessibilityLabel="Your name"
          placeholder="Ada"
          autoCapitalize="words"
        />

        <GhostText type="caption" style={styles.label}>Ghost name</GhostText>
        <GhostInput
          value={ghostName}
          onChangeText={setGhostName}
          accessibilityLabel="Ghost name"
          placeholder="Ghost"
          autoCapitalize="words"
        />

        <GhostText type="caption" style={styles.label}>What should Ghost think with?</GhostText>
        <View style={styles.brains} accessibilityRole="radiogroup">
          {BRAINS.map((b) => {
            const on = b.key === brain;
            return (
              <Pressable
                key={b.key}
                onPress={() => setBrain(b.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[styles.brain, on && styles.brainOn]}
              >
                <GhostText type="body" style={styles.brainName}>{b.label}</GhostText>
                {b.note ? <GhostText type="footnote" style={styles.brainNote}>{b.note}</GhostText> : null}
              </Pressable>
            );
          })}
        </View>
        {brainByKey(brain).cloud ? (
          <GhostInput
            value={apiKey}
            onChangeText={setApiKey}
            accessibilityLabel={`${brainByKey(brain).label} API key`}
            placeholder={`Paste your ${brainByKey(brain).label} API key`}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={{ marginTop: Space.sm }}
          />
        ) : null}

        <GhostText type="caption" style={styles.label}>Owner password</GhostText>
        <GhostInput
          value={password}
          onChangeText={setPassword}
          accessibilityLabel="Owner password"
          placeholder="At least 8 characters"
          secureTextEntry
        />

        <GhostText type="caption" style={styles.label}>Confirm password</GhostText>
        <GhostInput
          value={confirm}
          onChangeText={setConfirm}
          accessibilityLabel="Confirm password"
          placeholder="Repeat password"
          secureTextEntry
        />

        {error ? <GhostText type="footnote" style={styles.error}>{error}</GhostText> : null}

        <View style={styles.actions}>
          <GhostButton
            title="Set up Ghost Pod"
            variant="primary"
            onPress={handleClaim}
            loading={busy}
            disabled={busy}
            fullWidth
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.xl,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: Ghost.text.primary,
    marginBottom: Space.md,
  },
  description: {
    color: Ghost.text.secondary,
    lineHeight: 24,
  },
  brains: {
    gap: Space.sm,
  },
  brain: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.border.default,
    backgroundColor: Ghost.bg.raised,
    gap: 2,
  },
  brainOn: {
    borderColor: Ghost.accent.primary,
    borderWidth: 1.5,
  },
  brainName: {
    color: Ghost.text.primary,
    fontWeight: "600",
  },
  brainNote: {
    color: Ghost.text.secondary,
  },
  scanRow: {
    marginTop: Space.lg,
  },
  label: {
    color: Ghost.text.tertiary,
    marginTop: Space.lg,
    marginBottom: Space.xs,
  },
  error: {
    color: Ghost.status.error,
    marginTop: Space.lg,
  },
  actions: {
    marginTop: Space.xl,
  },
  bottom: {
    gap: Space.md,
    paddingHorizontal: Space.xl,
  },
});
