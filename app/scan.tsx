import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { GhostText } from "@/components/themed-text";
import { GhostButton } from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import { parsePairingURI } from "@/lib/pairing";
import { startPairing } from "@/lib/connection";

const FONT = Fonts.sans;

/**
 * QR Scanner screen.
 * Requests camera permission only when user enters this screen.
 * Validates URI before proceeding.
 */
export default function QrScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<"idle" | "scanned" | "invalid">("idle");
  const requestedThisOpen = useRef(false);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (status === "scanned") return;

      // Validate URI
      const payload = parsePairingURI(data);
      if (!payload || payload.type !== "secure") {
        setStatus("invalid");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // Reset after brief pause so user can try again
        setTimeout(() => setStatus("idle"), 1500);
        return;
      }

      setStatus("scanned");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      startPairing();

      // Navigate to confirmation with parsed data
      router.replace({
        pathname: "/confirm",
        params: {
          token: payload.token,
          host: payload.host,
          port: payload.port,
          transport: payload.transport,
        },
      });
    },
    [status, router],
  );

  const handleRequestPermission = async () => {
    const result = await requestPermission();
    if (!result.granted) {
      // Permission denied — show message
    }
  };

  // Permission not yet requested
  if (!permission) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={Ghost.accent.primary} />
        </View>
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <GhostText type="title" style={styles.title}>
            Camera access needed
          </GhostText>
          <GhostText type="body" style={styles.description}>
            Ghost needs camera access to scan the pairing code.
          </GhostText>
          <View style={styles.buttonGroup}>
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
      </View>
    );
  }

  // Camera ready
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <GhostText type="headline" style={styles.headerTitle}>
          Scan your Ghost
        </GhostText>
        <GhostText type="body" style={styles.headerDescription}>
          Point your camera at the QR code{"\n"}shown on your Ghost Pod.
        </GhostText>
      </View>

      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={status === "scanned" ? undefined : handleScan}
        />
        <View style={styles.reticle} pointerEvents="none" />
      </View>

      {status === "invalid" && (
        <GhostText type="callout" style={styles.errorText}>
          That's not a Ghost pairing code.
        </GhostText>
      )}

      {status === "scanned" && (
        <ActivityIndicator
          color={Ghost.accent.primary}
          size="small"
          style={styles.loader}
        />
      )}

      <View style={styles.bottom}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Space.xl,
    backgroundColor: Ghost.bg.base,
    gap: Space.md,
  },
  header: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
    gap: Space.xs,
  },
  headerTitle: {
    fontFamily: FONT,
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
  },
  headerDescription: {
    fontFamily: FONT,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 22,
  },
  cameraWrap: {
    flex: 1,
    margin: Space.xl,
    borderRadius: Radius.lg,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  reticle: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderColor: "rgba(61,122,95,0.6)",
    borderRadius: Radius.lg,
    margin: 48,
  },
  title: {
    fontFamily: FONT,
    color: Ghost.text.primary,
    textAlign: "center",
  },
  description: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    textAlign: "center",
  },
  buttonGroup: {
    width: "100%",
    gap: Space.sm,
    marginTop: Space.lg,
  },
  errorText: {
    fontFamily: FONT,
    color: Ghost.status.error,
    textAlign: "center",
    paddingVertical: Space.sm,
  },
  loader: {
    paddingVertical: Space.md,
  },
  bottom: {
    position: "absolute",
    bottom: 40,
    left: Space.xl,
    right: Space.xl,
  },
});
