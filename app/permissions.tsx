import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import { Camera } from "expo-camera";
import { GhostText } from "@/components/themed-text";
import { GhostToggle, SectionHeader } from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";

const FONT = Fonts.sans;

/**
 * Permissions screen.
 * Only permissions Ghost actually uses.
 * Each permission explains why Ghost needs it.
 */
export default function PermissionsScreen() {
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  useEffect(() => {
    checkPermissions();
  }, []);

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
      contentContainerStyle={styles.container}
    >
      <GhostText type="title" style={styles.title}>
        Permissions
      </GhostText>

      <SectionHeader title="Notifications" />
      <View style={styles.card}>
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
      </View>

      <SectionHeader title="Location" />
      <View style={styles.card}>
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
      </View>

      <SectionHeader title="Camera" />
      <View style={styles.card}>
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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Space.xl,
    paddingTop: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 24,
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  card: {
    padding: 16,
    backgroundColor: Ghost.bg.raised,
    borderRadius: Radius.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowContent: {
    flex: 1,
    marginRight: 16,
  },
  rowLabel: {
    fontFamily: FONT,
    color: Ghost.text.primary,
  },
  hint: {
    fontFamily: FONT,
    color: Ghost.text.secondary,
    marginTop: 2,
    opacity: 0.7,
  },
});
