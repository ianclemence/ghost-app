import { View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import { completePairing } from "@/lib/connection";
import { useState } from "react";

const FONT = Fonts.sans;

/**
 * Pairing confirmation screen.
 * Shows after QR scan, before pairing is executed.
 * Displays Ghost identity (if available) and asks user to confirm.
 */
export default function PairingConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    token: string;
    host: string;
    port: string;
    transport: string;
    name?: string;
  }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ghostName = params.name || "Ghost Pod";

  const handleConnect = async () => {
    if (!params.token || !params.host) {
      setError("Missing pairing information.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await completePairing(
      params.host,
      params.port || "8766",
      params.token,
    );

    setLoading(false);

    if (result.ok) {
      router.replace("/pairing-success");
    } else {
      setError(result.error || "Ghost couldn't connect.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <GhostMark size={48} />
        <GhostText type="headline" style={styles.title}>
          Connect to Ghost?
        </GhostText>
        <View style={styles.deviceInfo}>
          <GhostText type="body" style={styles.deviceName}>
            {ghostName}
          </GhostText>
          <GhostText type="caption" style={styles.deviceSubtitle}>
            Ghost Pod
          </GhostText>
        </View>

        {error && (
          <GhostText type="callout" style={styles.errorText}>
            {error}
          </GhostText>
        )}
      </View>

      <View style={styles.bottom}>
        <GhostButton
          title={loading ? "Connecting…" : "Connect"}
          variant="primary"
          onPress={handleConnect}
          disabled={loading}
          loading={loading}
          fullWidth
        />
        <GhostButton
          title="Cancel"
          variant="ghost"
          onPress={() => router.back()}
          disabled={loading}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Ghost.bg.base,
    paddingHorizontal: Space.xl,
    paddingTop: 100,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Space.md,
  },
  title: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    textAlign: "center",
  },
  deviceInfo: {
    alignItems: "center",
    gap: Space.xxs,
  },
  deviceName: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    fontWeight: "500",
  },
  deviceSubtitle: {
    fontFamily: FONT,
    color: Ghost.text.tertiary,
  },
  errorText: {
    fontFamily: FONT,
    color: Ghost.status.error,
    textAlign: "center",
    marginTop: Space.sm,
  },
  bottom: {
    paddingBottom: 80,
    gap: Space.sm,
  },
});
