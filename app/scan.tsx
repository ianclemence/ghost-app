import { Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Radius, Space } from "@/constants/theme";
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
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
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
    outputRange: ["rgba(255,255,255,0.8)", "#C24B3C"],
  });

  // Loading
  if (!permission) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Ghost.accent.primary} />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <GhostMark size={40} color={Ghost.text.tertiary} />
        <GhostText type="headline" style={styles.deniedTitle}>
          Camera access needed
        </GhostText>
        <GhostText type="body" style={styles.deniedBody}>
          Ghost needs camera access to scan the pairing code.
        </GhostText>
        <View style={styles.deniedActions}>
          <GhostButton
            title={permission.canAskAgain ? "Grant permission" : "Open Settings"}
            variant="primary"
            onPress={() => {
              if (permission.canAskAgain) requestPermission();
              else Linking.openSettings();
            }}
            fullWidth
          />
          <GhostButton
            title="Cancel"
            variant="ghost"
            onPress={() => router.back()}
            fullWidth
          />
        </View>
      </View>
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
                  colors={[
                    "transparent",
                    "rgba(255,255,255,0.4)",
                    "rgba(255,255,255,0.6)",
                    "rgba(255,255,255,0.4)",
                    "transparent",
                  ]}
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
        <GhostMark size={24} color="rgba(255,255,255,0.7)" />
        <Text style={styles.headerTitle}>Scan your Ghost Pod</Text>
        <Text style={styles.headerHint}>
          Center the QR code in the frame
        </Text>
      </View>

      {/* Bottom feedback + cancel */}
      <View
        style={[
          styles.bottomOverlay,
          { paddingBottom: insets.bottom + Space.xl },
        ]}
      >
        {status === "invalid" && (
          <Text style={styles.invalidText}>
            Not a Ghost pairing code
          </Text>
        )}

        {status === "scanned" && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.loadingText}>Connecting…</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.cancelButton}
          activeOpacity={0.7}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
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
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  maskMiddle: {
    flexDirection: "row",
    height: SCAN_SIZE,
  },
  maskSide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  maskBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
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
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.3,
    marginTop: Space.sm,
  },
  headerHint: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "400",
  },

  bottomOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: Space.md,
    paddingHorizontal: Space.xxl,
    zIndex: 10,
  },
  invalidText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "500",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  loadingText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    fontWeight: "500",
  },
  cancelButton: {
    paddingVertical: Space.sm,
    paddingHorizontal: Space.xl,
  },
  cancelText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    fontWeight: "400",
  },

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
