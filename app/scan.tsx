import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Linking, StyleSheet, View } from "react-native";
import { Text } from "@/components/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Fonts, Ghost, Midnight, Space } from "@/constants/theme";
import { StatusScreen } from "@/components/status-screen";
import { parsePairingURI } from "@/lib/pairing";
import { startPairing } from "@/lib/connection";

const SCAN_SIZE = 250;
const CORNER_SIZE = 20;
const CORNER_THICKNESS = 2;

/**
 * QR Scanner screen.
 *
 * Full-screen camera with a clear "window" cutout for the QR code.
 * Dark mask surrounds the scan area. Subtle animated scanning line
 * provides visual feedback. Clean, minimal, premium.
 */
export default function QrScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<"idle" | "scanned" | "invalid">("idle");

  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const invalidFlash = useRef(new Animated.Value(0)).current;

  // Scanning line animation
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [scanLineAnim]);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (status === "scanned") return;

      const payload = parsePairingURI(data);
      // A setup QR carries only the Pod address; the setup code is typed next.
      if (payload?.type === "setup") {
        setStatus("scanned");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace({
          pathname: "/setup-pod" as never,
          params: { host: payload.host, port: payload.port, pod: payload.podId ?? "" },
        });
        return;
      }
      if (!payload || payload.type !== "secure") {
        setStatus("invalid");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        // Flash the corners red briefly
        Animated.sequence([
          Animated.timing(invalidFlash, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(invalidFlash, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start();

        setTimeout(() => setStatus("idle"), 2000);
        return;
      }

      setStatus("scanned");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      startPairing();

      router.replace({
        pathname: "/confirm",
        params: {
          token: payload.token,
          host: payload.host,
          port: payload.port,
          transport: payload.transport,
          relayServer: payload.relayServer ?? "",
          ghostId: payload.ghostId ?? "",
        },
      });
    },
    [status, router, invalidFlash],
  );

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCAN_SIZE - 2],
  });

  const cornerColor = invalidFlash.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255,255,255,0.92)", Ghost.status.error],
  });

  // Loading
  if (!permission) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Ghost.text.primary} />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <StatusScreen
        tone="off"
        hero={false}
        title="Camera access needed"
        body="Ghost needs the camera to read the pairing code on your Pod."
        actions={
          <>
            <GhostButton
              title={permission.canAskAgain ? "Allow camera" : "Open Settings"}
              onPress={() => {
                if (permission.canAskAgain) requestPermission();
                else Linking.openSettings();
              }}
              fullWidth
            />
            <GhostButton title="Enter manually" variant="secondary" onPress={() => router.replace("/manual")} fullWidth />
            <GhostButton title="Cancel" variant="ghost" onPress={() => router.back()} fullWidth />
          </>
        }
      />
    );
  }

  // Camera ready
  return (
    <View style={styles.container}>
      {/* Camera feed */}
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={status === "scanned" ? undefined : handleScan}
      />

      {/* Dark mask with clear window */}
      <View style={styles.maskLayer} pointerEvents="none">
        {/* Top mask */}
        <View style={styles.maskTop} />

        {/* Middle row: left mask + scan window + right mask */}
        <View style={styles.maskMiddle}>
          <View style={styles.maskSide} />
          <View style={styles.scanWindow}>
            {/* Scanning line */}
            {status === "idle" && (
              <Animated.View
                style={[
                  styles.scanLine,
                  { transform: [{ translateY: scanLineTranslateY }] },
                ]}
              >
                <LinearGradient
                  colors={["transparent", "rgba(255,154,26,0.7)", "rgba(194,61,235,0.85)", "rgba(58,46,240,0.7)", "transparent"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            )}

            {/* Corner accents */}
            <Animated.View
              style={[styles.corner, styles.cornerTL, { borderColor: cornerColor }]}
            />
            <Animated.View
              style={[styles.corner, styles.cornerTR, { borderColor: cornerColor }]}
            />
            <Animated.View
              style={[styles.corner, styles.cornerBL, { borderColor: cornerColor }]}
            />
            <Animated.View
              style={[styles.corner, styles.cornerBR, { borderColor: cornerColor }]}
            />
          </View>
          <View style={styles.maskSide} />
        </View>

        {/* Bottom mask */}
        <View style={styles.maskBottom} />
      </View>

      {/* Header text */}
      <View
        style={[styles.headerOverlay, { paddingTop: insets.top + Space.lg }]}
      >
        <GhostMark size={28} />
        <Text style={styles.headerTitle}>Scan your Pod</Text>
        <Text style={styles.headerHint}>
          Center the QR code in the frame
        </Text>
      </View>

      {/* Bottom feedback + ways out */}
      <View
        style={[
          styles.bottomOverlay,
          { paddingBottom: insets.bottom + Space.xl },
        ]}
      >
        {status === "invalid" && (
          <View style={styles.notice}>
            <Text style={styles.invalidText}>Not a Ghost pairing code</Text>
          </View>
        )}

        {status === "scanned" && (
          <View style={styles.notice}>
            <ActivityIndicator color={Ghost.text.primary} size="small" />
            <Text style={styles.loadingText}>Connecting…</Text>
          </View>
        )}

        <View style={styles.ways}>
          <GhostButton title="Enter manually" variant="secondary" onPress={() => router.replace("/manual")} />
          <GhostButton title="Cancel" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Midnight.bg,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Space.xxxl,
    gap: Space.md,
    backgroundColor: Ghost.bg.base,
  },

  // ─── Mask Layer ──────────────────────────────────────────────────────────
  maskLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
  },
  maskTop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.74)",
  },
  maskMiddle: {
    flexDirection: "row",
    height: SCAN_SIZE,
  },
  maskSide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.74)",
  },
  maskBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.74)",
  },

  // ─── Scan Window ─────────────────────────────────────────────────────────
  scanWindow: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    position: "relative",
  },

  // Scanning line
  scanLine: {
    position: "absolute",
    left: 8,
    right: 8,
    height: 2,
    zIndex: 2,
  },

  // Corner accents — thin, elegant
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderWidth: 0,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: 3,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: 3,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: 3,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: 3,
  },

  // ─── Text Overlays ───────────────────────────────────────────────────────
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: Space.xs,
    zIndex: 10,
  },
  headerTitle: {
    fontFamily: Fonts.voice,
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -0.6,
    color: Ghost.text.primary,
    marginTop: Space.sm,
  },
  headerHint: {
    fontSize: 15,
    fontWeight: "300",
    color: "rgba(255,255,255,0.7)",
  },

  bottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: Space.lg,
    paddingHorizontal: Space.xxl,
    zIndex: 10,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Ghost.glass.border,
  },
  invalidText: { fontSize: 14, fontWeight: "500", color: Ghost.status.error },
  loadingText: { fontSize: 14, fontWeight: "500", color: Ghost.text.primary },
  ways: { flexDirection: "row", gap: Space.sm },

  // ─── Permission Denied ───────────────────────────────────────────────────
  deniedTitle: {
    color: Ghost.text.primary,
    textAlign: "center",
  },
  deniedBody: {
    color: Ghost.text.secondary,
    textAlign: "center",
    lineHeight: 22,
  },
  deniedActions: {
    width: "100%",
    gap: Space.sm,
    marginTop: Space.lg,
  },
});
