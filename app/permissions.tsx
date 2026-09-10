import { useState, useCallback } from "react";
import { TouchableOpacity, View, StyleSheet, ScrollView, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { Camera } from "expo-camera";
import { GhostText } from "@/components/themed-text";
import { ScreenGlow } from "@/components/screen-glow";
import { GhostToggle } from "@/components/ghost";
import { Ghost, Space, Type } from "@/constants/theme";
import { capability } from "@/lib/capabilities";

/**
 * Permissions screen.
 * Only permissions Ghost actually uses.
 * Each permission explains why Ghost needs it.
 */
export default function PermissionsScreen() {
  const insets = useSafeAreaInsets();
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const checkPermissions = async () => {
    // expo-notifications throws at import time inside Expo Go on newer
    // SDKs, so only touch it when the capability is available.
    if (!capability("notifications").supported) {
      setNotifEnabled(false);
    } else {
      try {
        const Notifications = await import("expo-notifications");
        const notif = await Notifications.getPermissionsAsync();
        setNotifEnabled(notif.granted);
      } catch {}
    }
    try {
      const loc = await Location.getForegroundPermissionsAsync();
      setLocationEnabled(loc.granted);
    } catch {}
    try {
      const cam = await Camera.getCameraPermissionsAsync();
      setCameraEnabled(cam.granted);
    } catch {}
  };

  // Re-read OS state every time the screen gains focus: the toggles mirror
  // the system grant, which the user can change in Settings at any time.
  // Turning a toggle off opens OS Settings because apps cannot revoke
  // their own grants.
  useFocusEffect(
    useCallback(() => {
      checkPermissions();
    }, []),
  );

  const toggleNotifications = async () => {
    if (!capability("notifications").supported) return;
    if (notifEnabled) {
      await Linking.openSettings();
      return;
    }
    try {
      const Notifications = await import("expo-notifications");
      const { status } = await Notifications.requestPermissionsAsync();
      setNotifEnabled(status === "granted");
    } catch {}
  };

  const toggleLocation = async () => {
    if (locationEnabled) {
      await Linking.openSettings();
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationEnabled(status === "granted");
    } catch {}
  };

  const toggleCamera = async () => {
    if (cameraEnabled) {
      await Linking.openSettings();
      return;
    }
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setCameraEnabled(status === "granted");
    } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: Ghost.bg.base }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + Space.xl, paddingBottom: insets.bottom + Space.xxxl }]}
    >
      <GhostText type="title" style={styles.title}>
        Permissions
      </GhostText>

      <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={toggleNotifications} accessibilityLabel="Push notifications">
        <View style={styles.rowContent}>
          <GhostText type="body" style={styles.rowLabel}>
            Push notifications
          </GhostText>
          <GhostText type="caption" style={styles.hint}>
            {capability("notifications").supported
              ? "Ghost can reach you when something needs your attention."
              : "Notifications aren't available in this test environment."}
          </GhostText>
        </View>
        <GhostToggle value={notifEnabled} onValueChange={toggleNotifications} accessibilityLabel="Push notifications" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={toggleLocation} accessibilityLabel="Location access">
        <View style={styles.rowContent}>
          <GhostText type="body" style={styles.rowLabel}>
            Location access
          </GhostText>
          <GhostText type="caption" style={styles.hint}>
            Used for weather context and schedules in your timezone. Coordinates stay on your Ghost.
          </GhostText>
        </View>
        <GhostToggle value={locationEnabled} onValueChange={toggleLocation} accessibilityLabel="Location access" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={toggleCamera} accessibilityLabel="Camera access">
        <View style={styles.rowContent}>
          <GhostText type="body" style={styles.rowLabel}>
            Camera access
          </GhostText>
          <GhostText type="caption" style={styles.hint}>
            Used to scan Ghost pairing codes.
          </GhostText>
        </View>
        <GhostToggle value={cameraEnabled} onValueChange={toggleCamera} accessibilityLabel="Camera access" />
      </TouchableOpacity>
    </ScrollView>
    <ScreenGlow />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Space.xl,
  },
  title: {
    ...Type.largeTitle,
    marginBottom: Space.xl,
    color: Ghost.text.primary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Space.md,
  },
  rowContent: {
    flex: 1,
    marginRight: Space.lg,
  },
  rowLabel: {
    color: Ghost.text.primary,
  },
  hint: {
    color: Ghost.text.tertiary,
    marginTop: Space.xxs,
  },
});
