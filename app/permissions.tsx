import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import { Camera } from "expo-camera";
import { GhostText } from "@/components/themed-text";
import { GhostToggle } from "@/components/ghost";
import { Ghost, Space } from "@/constants/theme";

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
    try {
      const notif = await Notifications.getPermissionsAsync();
      setNotifEnabled(notif.granted);
    } catch {}
    try {
      const loc = await Location.getForegroundPermissionsAsync();
      setLocationEnabled(loc.granted);
    } catch {}
    try {
      const cam = await Camera.getCameraPermissionsAsync();
      setCameraEnabled(cam.granted);
    } catch {}
  };

  useEffect(() => {
    checkPermissions();
  }, []);

  const toggleNotifications = async () => {
    if (notifEnabled) {
      setNotifEnabled(false);
      return;
    }
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotifEnabled(status === "granted");
    } catch {}
  };

  const toggleLocation = async () => {
    if (locationEnabled) {
      setLocationEnabled(false);
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationEnabled(status === "granted");
    } catch {}
  };

  const toggleCamera = async () => {
    if (cameraEnabled) {
      setCameraEnabled(false);
      return;
    }
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setCameraEnabled(status === "granted");
    } catch {}
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Ghost.bg.base }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + Space.xl }]}
    >
      <GhostText type="title" style={styles.title}>
        Permissions
      </GhostText>

      <View style={styles.row}>
        <View style={styles.rowContent}>
          <GhostText type="body" style={styles.rowLabel}>
            Push notifications
          </GhostText>
          <GhostText type="caption" style={styles.hint}>
            Ghost can reach you when something needs your attention.
          </GhostText>
        </View>
        <GhostToggle value={notifEnabled} onValueChange={toggleNotifications} />
      </View>

      <View style={styles.row}>
        <View style={styles.rowContent}>
          <GhostText type="body" style={styles.rowLabel}>
            Location access
          </GhostText>
          <GhostText type="caption" style={styles.hint}>
            Used when Ghost needs your location for context-aware features.
          </GhostText>
        </View>
        <GhostToggle value={locationEnabled} onValueChange={toggleLocation} />
      </View>

      <View style={styles.row}>
        <View style={styles.rowContent}>
          <GhostText type="body" style={styles.rowLabel}>
            Camera access
          </GhostText>
          <GhostText type="caption" style={styles.hint}>
            Used to scan Ghost pairing codes.
          </GhostText>
        </View>
        <GhostToggle value={cameraEnabled} onValueChange={toggleCamera} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Space.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 24,
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
    marginRight: 16,
  },
  rowLabel: {
    color: Ghost.text.primary,
  },
  hint: {
    color: Ghost.text.tertiary,
    marginTop: 2,
  },
});
