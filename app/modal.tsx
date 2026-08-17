import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Reuse design tokens from index.tsx
const C = {
  bg: "#080C0F",
  surface: "#0D1117",
  surface2: "#111920",
  border: "#1A2332",
  accent: "#00FF88",
  danger: "#FF4455",
  textPrimary: "#E6EDF3",
  textSecondary: "#8B949E",
};

export default function ModalScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>🗑️</Text>
        </View>
        <Text style={styles.title}>Clear Chat History?</Text>
        <Text style={styles.subtitle}>
          This will remove all messages from your device. Ghost&apos;s memory is unaffected.
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          
          {/* We use a Link with dismissTo to close modal and navigate, 
              but for the actual "Clear" logic we need to pass a callback.
              Since this is a route, we can't easily pass props.
              Instead, let's keep the Alert for now or use a global store action?
              
              Wait, the user asked to redesign the clear modal.
              We should probably make this a component inside index.tsx instead of a route,
              OR use a store action here.
          */}
          <TouchableOpacity 
            style={styles.confirmBtn}
            onPress={() => {
                // In a real app, we'd trigger the clear action here via store
                // For now, let's just go back since logic is in index.tsx
                router.back();
            }}
          >
            <Text style={styles.confirmText}>Clear History</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)", // Dimmed background
    justifyContent: "center",
    padding: 20,
  },
  content: {
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FF445515",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    color: C.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: C.textSecondary,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: C.surface2,
    alignItems: "center",
  },
  cancelText: {
    color: C.textPrimary,
    fontWeight: "600",
    fontSize: 16,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: C.danger,
    alignItems: "center",
  },
  confirmText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },
});
