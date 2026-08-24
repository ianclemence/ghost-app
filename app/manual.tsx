import { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostButton, SectionHeader } from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import { startPairing } from "@/lib/connection";

const FONT = Fonts.sans;

/**
 * Manual connection screen.
 * Behind Advanced — for users who can't scan QR.
 * Still uses the secure pairing model.
 */
export default function ManualScreen() {
  const router = useRouter();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8766");
  const [token, setToken] = useState("");

  const canConnect = host.trim().length > 0 && token.trim().length > 0;

  const handleConnect = () => {
    if (!canConnect) return;
    startPairing();
    router.replace({
      pathname: "/confirm",
      params: {
        token: token.trim(),
        host: host.trim(),
        port: port.trim() || "8766",
        transport: "lan",
      },
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: Ghost.bg.base }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <GhostText type="largeTitle" style={styles.title}>
          Enter manually
        </GhostText>
        <GhostText type="body" style={styles.description}>
          Enter the connection details shown on your Ghost Pod.
        </GhostText>

        <SectionHeader title="Connection" />
        <View style={styles.card}>
          <GhostText type="caption" style={styles.label}>
            Ghost Pod address
          </GhostText>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.42"
            placeholderTextColor={Ghost.text.tertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="decimal-pad"
          />

          <GhostText type="caption" style={styles.label}>
            Port
          </GhostText>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder="8766"
            placeholderTextColor={Ghost.text.tertiary}
            keyboardType="number-pad"
          />

          <GhostText type="caption" style={styles.label}>
            Pairing token
          </GhostText>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="Paste token from Ghost Pod"
            placeholderTextColor={Ghost.text.tertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.buttonRow}>
          <GhostButton
            title="Connect"
            variant="primary"
            onPress={handleConnect}
            disabled={!canConnect}
            fullWidth
          />
          <GhostButton
            title="Back"
            variant="ghost"
            onPress={() => router.back()}
            fullWidth
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Space.xl,
    paddingTop: 80,
  },
  title: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    marginBottom: Space.sm,
  },
  description: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    marginBottom: Space.lg,
  },
  card: {
    padding: 20,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
  },
  label: {
    fontFamily: FONT,
    color: Ghost.text.tertiary,
    marginBottom: Space.xs,
    marginTop: Space.md,
  },
  input: {
    borderWidth: 1,
    borderColor: Ghost.border.default,
    borderRadius: Radius.md,
    padding: 12,
    fontSize: 16,
    fontFamily: FONT,
    color: Ghost.text.primary,
    backgroundColor: Ghost.bg.base,
  },
  buttonRow: {
    marginTop: Space.xxl,
    gap: Space.sm,
  },
});
