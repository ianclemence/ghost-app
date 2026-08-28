import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { GhostMark } from "@/components/ghost-mark";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import { parsePairingURI } from "@/lib/pairing";
import { startPairing } from "@/lib/connection";

const FONT = Fonts.sans;

/**
 * QR Scanner screen.
 *
 * Calm, full-screen camera view with Ghost's editorial restraint.
 * No decorative scanning animations. No glowing reticle.
 * Just the camera, the Ghost mark, and a clear instruction.
 */
export default function QrScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<"idle" | "scanned" | "invalid">("idle");

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (status === "scanned") return;

      const payload = parsePairingURI(data);
      if (!payload || payload.type !== "secure") {
        setStatus("invalid");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
    [status, router],
  );

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
            title="Open Settings"
            variant="primary"
            onPress={() => requestPermission()}
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
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={status === "scanned" ? undefined : handleScan}
      />

      {/* Top scrim with instruction */}
      <View style={[styles.scrim, styles.scrimTop, { paddingTop: insets.top + Space.lg }]}>
        <GhostMark size={28} color="rgba(255,255,255,0.85)" />
        <GhostText type="headline" style={styles.instruction}>
          Scan your Ghost
        </GhostText>
        <GhostText type="subhead" style={styles.hint}>
          Point at the QR code on your Ghost Pod
        </GhostText>
      </View>

      {/* Reticle — four corner marks, not a full border */}
      <View style={styles.reticleContainer} pointerEvents="none">
        <View style={[styles.corner, styles.cornerTL]} />
        <View style={[styles.corner, styles.cornerTR]} />
        <View style={[styles.corner, styles.cornerBL]} />
        <View style={[styles.corner, styles.cornerBR]} />
      </View>

      {/* Bottom scrim with feedback and cancel */}
      <View style={[styles.scrim, styles.scrimBottom, { paddingBottom: insets.bottom + Space.xl }]}>
        {status === "invalid" && (
          <GhostText type="callout" style={styles.invalidText}>
            That&apos;s not a Ghost pairing code.
          </GhostText>
        )}

        {status === "scanned" && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Ghost.accent.primary} size="small" />
            <GhostText type="callout" style={styles.loadingText}>
              Connecting…
            </GhostText>
          </View>
        )}

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

const CORNER_SIZE = 28;
const CORNER_THICKNESS = 2;
const CORNER_RADIUS = 4;
const RETICLE_MARGIN = 56;

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

  // Scrims — gradient-free, just translucent solids
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: Space.xxl,
    zIndex: 10,
  },
  scrimTop: {
    top: 0,
    paddingBottom: Space.xxxl,
    gap: Space.xs,
    // Subtle gradient via two layers
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  scrimBottom: {
    bottom: 0,
    paddingTop: Space.xxl,
    gap: Space.md,
    backgroundColor: "rgba(0,0,0,0.65)",
  },

  instruction: {
    fontFamily: FONT,
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginTop: Space.sm,
  },
  hint: {
    fontFamily: FONT,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },

  // Reticle — four corner marks
  reticleContainer: {
    ...StyleSheet.absoluteFill,
    margin: RETICLE_MARGIN,
    zIndex: 5,
  },
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: "rgba(255,255,255,0.7)",
    borderWidth: 0, // We use border sides instead
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: CORNER_RADIUS,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: CORNER_RADIUS,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: CORNER_RADIUS,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: CORNER_RADIUS,
  },

  // Permission denied
  deniedTitle: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    textAlign: "center",
  },
  deniedBody: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    textAlign: "center",
    lineHeight: 22,
  },
  deniedActions: {
    width: "100%",
    gap: Space.sm,
    marginTop: Space.lg,
  },

  // Feedback
  invalidText: {
    fontFamily: FONT,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    justifyContent: "center",
  },
  loadingText: {
    fontFamily: FONT,
    color: "rgba(255,255,255,0.8)",
  },
});
