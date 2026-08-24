import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { X } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Colors, Fonts, Ghost, UI } from "@/constants/theme";
import { parseConnectURL } from "@/lib/pairing";
import type { GhostConfig } from "@/lib/ghostApi";

const FONT_MONO = Fonts.mono;

/**
 * Scans a pairing QR emitted by the Ghost web console:
 *   ghost://connect?host=…&port=…&secret=…
 *
 * Falls back to manual entry if the camera is unavailable.
 */
export default function QrPairingScanner({
  visible,
  onClose,
  onPaired,
}: {
  visible: boolean;
  onClose: () => void;
  onPaired: (cfg: GhostConfig) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<"idle" | "scanned">("idle");
  const requestedThisOpen = useRef(false);

  useEffect(() => {
    if (!visible) {
      requestedThisOpen.current = false;
      return;
    }
    setStatus("idle");
    if (!requestedThisOpen.current && permission && !permission.granted) {
      requestedThisOpen.current = true;
      requestPermission().catch(() => {});
    }
  }, [visible, permission, requestPermission]);

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (status === "scanned") return;
      const cfg = parseConnectURL(data);
      if (!cfg) return; // not a Ghost pairing code — keep scanning
      setStatus("scanned");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPaired(cfg);
    },
    [status, onPaired],
  );

  const cameraReady = permission?.granted;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>SCAN PAIRING QR</Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <X size={20} color={Ghost.text.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.body}>
          {!cameraReady ? (
            <Text style={styles.hint}>
              Camera permission is required to scan pairing codes. Grant it in
              system settings, or enter the host and secret manually in
              Settings.
            </Text>
          ) : (
            <>
              <View style={styles.cameraWrap}>
                <CameraView
                  style={styles.camera}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={
                    status === "scanned" ? undefined : handleScan
                  }
                />
                <View style={styles.reticle} pointerEvents="none" />
              </View>
              <Text style={styles.hint}>
                Point this at the pairing QR shown by the Ghost web console.
              </Text>
              {status === "scanned" && (
                <ActivityIndicator color={Ghost.accent.primary} size="small" />
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  sheet: {
    position: "absolute",
    top: 90,
    left: UI.modal.side,
    right: UI.modal.side,
    backgroundColor: Ghost.bg.base,
    borderWidth: 1,
    borderColor: Ghost.accent.primary,
    borderRadius: UI.radius.panel,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: UI.modal.headerPadding,
    borderBottomWidth: 1,
    borderBottomColor: Ghost.border.default,
    backgroundColor: Ghost.bg.raised,
  },
  title: {
    color: Ghost.accent.primary,
    fontFamily: FONT_MONO,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
  },
  body: {
    padding: UI.modal.bodyPadding,
    backgroundColor: Ghost.bg.raised,
    gap: 12,
  },
  cameraWrap: {
    height: 260,
    borderRadius: UI.radius.bubble,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  camera: { flex: 1 },
  reticle: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderColor: "rgba(74,222,128,0.7)",
    borderRadius: UI.radius.bubble,
    margin: 48,
  },
  hint: {
    color: Ghost.text.secondary,
    fontFamily: FONT_MONO,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
});
