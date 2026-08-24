import { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { GhostText } from "@/components/themed-text";
import { GhostButton, SectionHeader } from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import { completePairing } from "@/lib/connection";

const FONT = Fonts.sans;

export default function OnboardingScreen() {
  const router = useRouter();
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8766");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePair = async () => {
    if (!host.trim() || !token.trim()) {
      Alert.alert("Missing fields", "Enter your Ghost Pod IP address and pairing token.");
      return;
    }
    setLoading(true);
    const result = await completePairing(host.trim(), port.trim() || "8766", token.trim());
    setLoading(false);
    if (result.ok) {
      router.replace("/(tabs)");
    } else {
      Alert.alert("Pairing failed", result.error ?? "Check your token and try again.");
    }
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
        <GhostText type="title" style={styles.title}>
          Set up Ghost
        </GhostText>
        <GhostText type="body" style={styles.subtitle}>
          Enter the pairing details from your Ghost Pod.
        </GhostText>

        <SectionHeader title="Connection" />
        <View style={styles.card}>
          <GhostText type="caption" style={styles.label}>
            Ghost Pod IP address
          </GhostText>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="192.168.1.42"
            placeholderTextColor={Ghost.border.default}
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
            placeholderTextColor={Ghost.border.default}
            keyboardType="number-pad"
          />

          <GhostText type="caption" style={styles.label}>
            Pairing token
          </GhostText>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="Paste token from QR code"
            placeholderTextColor={Ghost.border.default}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.buttonRow}>
          <GhostButton
            title={loading ? "Pairing…" : "Pair"}
            variant="primary"
            onPress={handlePair}
            disabled={loading || !host.trim() || !token.trim()}
            loading={loading}
            fullWidth
          />
        </View>

        <GhostText type="caption" style={styles.hint}>
          The pairing token expires in 5 minutes.
        </GhostText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Space.xl,
    paddingTop: 80,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 8,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.6,
    marginBottom: 32,
    textAlign: "center",
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
  card: {
    width: "100%",
    padding: 20,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
  },
  label: {
    fontSize: 13,
    opacity: 0.5,
    marginBottom: 6,
    marginTop: 12,
    fontFamily: FONT,
    color: Ghost.text.tertiary,
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
    marginTop: 24,
    width: "100%",
  },
  hint: {
    marginTop: 16,
    opacity: 0.4,
    textAlign: "center",
    fontFamily: FONT,
    color: Ghost.text.tertiary,
  },
});
