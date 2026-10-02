import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Space, Type } from "@/constants/theme";

/**
 * First launch.
 *
 * Ghost lives on a Pod the owner controls: memory, permissions and tools stay
 * there. The phone is how you reach it, so the only first step is connecting to the Pod,
 * by scanning its code or entering its address. There is nothing to look around at yet, so there is no
 * way to skip it.
 */
const LINES = ["Your AI.", "Your Memory.", "Your Machine."];
const FADE = [1, 0.5, 0.26];

export default function FirstLaunchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const enter = (delay: number) => (reduce ? undefined : FadeInDown.delay(delay).duration(520).springify().damping(20));

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + Space.xl }]}>
      <View style={styles.hero}>
        <Animated.View entering={reduce ? undefined : FadeIn.duration(600)}>
          <GhostMark size={44} />
        </Animated.View>
        <View style={styles.lines}>
          {LINES.map((t, i) => (
            <Animated.Text key={t} entering={enter(180 + i * 130)} style={[styles.line, { opacity: FADE[i] }]}>
              {t}
            </Animated.Text>
          ))}
        </View>
        <Animated.Text entering={enter(720)} style={styles.explain}>
          Ghost runs on a small computer you own. This phone is how you reach it, from anywhere.
        </Animated.Text>
      </View>

      <Animated.View entering={enter(900)} style={styles.bottom}>
        <GhostButton title="Scan QR code" onPress={() => router.push("/connect")} fullWidth />
        <Pressable
          onPress={() => router.push("/manual")}
          style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.5 }]}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Enter manually</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base, paddingHorizontal: 28 },
  hero: { flex: 1, justifyContent: "center", gap: Space.xxl },
  lines: { gap: 2 },
  line: { fontSize: 38, lineHeight: 44, fontWeight: "600", letterSpacing: -1.1, color: Ghost.text.primary },
  explain: { ...Type.body, color: Ghost.text.secondary, maxWidth: 300 },
  bottom: { gap: Space.xs },
  secondary: { alignItems: "center", justifyContent: "center", minHeight: 48 },
  secondaryText: { ...Type.callout, fontWeight: "500", color: Ghost.text.secondary },
});
