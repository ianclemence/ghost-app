import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Fonts, Space } from "@/constants/theme";
import { completePairing } from "@/lib/connection";
import { useEffect, useRef, useState } from "react";

const FONT = Fonts.sans;

/**
 * Pairing progress screen.
 * Shows after QR scan, while pairing is in progress.
 * Calm, minimal — "Connecting…"
 */
export default function PairingProgressScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    token: string;
    host: string;
    port: string;
    transport: string;
    relayServer?: string;
    ghostId?: string;
    name?: string;
  }>();
  const [status, setStatus] = useState<"connecting" | "success" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  const startPairing = async () => {
    if (!params.token || (!params.host && params.transport !== "relay")) {
      setError("Missing pairing information.");
      setStatus("error");
      return;
    }

    const result = await completePairing({
      token: params.token,
      host: params.host || "",
      port: params.port || "8766",
      transport: params.transport === "relay" ? "relay" : "lan",
      relayServer: params.relayServer || undefined,
      ghostId: params.ghostId || undefined,
    });

    if (result.ok) {
      setStatus("success");
      // Brief pause to show success, then navigate
      setTimeout(() => {
        router.replace("/pairing-success");
      }, 1500);
    } else {
      setError(result.error || "Ghost couldn't connect.");
      setStatus("error");
    }
  };

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    startPairing();
  }, []);

  if (status === "success") {
    return (
      <View style={[styles.container, styles.center]}>
        <GhostMark size={48} />
        <GhostText type="largeTitle" style={styles.title}>
          Ghost connected.
        </GhostText>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={[styles.container, styles.center]}>
        <GhostMark size={48} color={Ghost.text.tertiary} />
        <GhostText type="headline" style={styles.title}>
          Couldn&apos;t connect
        </GhostText>
        <GhostText type="body" style={styles.errorText}>
          {error}
        </GhostText>
        <GhostText
          type="callout"
          style={styles.retryLink}
          onPress={() => {
            setStatus("connecting");
            setError(null);
            hasStarted.current = false;
            startPairing();
          }}
        >
          Try again
        </GhostText>
        <GhostText
          type="callout"
          style={styles.cancelLink}
          onPress={() => router.replace("/onboarding")}
        >
          Cancel
        </GhostText>
      </View>
    );
  }

  // Connecting state
  return (
    <View style={[styles.container, styles.center]}>
      <GhostMark size={48} />
      <GhostText type="largeTitle" style={styles.title}>
        Ghost
      </GhostText>
      <View style={styles.connectingRow}>
        <ActivityIndicator color={Ghost.accent.primary} size="small" />
        <GhostText type="body" style={styles.connectingText}>
          Connecting…
        </GhostText>
      </View>
      <GhostText type="caption" style={styles.hint}>
        Finding your Ghost Pod
      </GhostText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Space.xxxl,
    gap: Space.md,
  },
  title: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    textAlign: "center",
  },
  connectingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  connectingText: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  hint: {
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    marginTop: Space.sm,
  },
  errorText: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    textAlign: "center",
    lineHeight: 22,
  },
  retryLink: {
    fontFamily: FONT,
    color: Ghost.accent.primary,
    marginTop: Space.lg,
  },
  cancelLink: {
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    marginTop: Space.sm,
  },
});
