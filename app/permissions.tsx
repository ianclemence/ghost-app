import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import * as Notifications from "expo-notifications";
import * as Location from "expo-location";
import { Camera } from "expo-camera";
import { GhostText } from "@/components/themed-text";
import { GhostToggle, SectionHeader } from "@/components/ghost";
import { Ghost, Fonts, Radius, Space } from "@/constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";

const FONT = Fonts.sans;

export default function PermissionsScreen() {
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    const notif = await Notifications.getPermissionsAsync();
    setNotifEnabled(notif.granted);

    const loc = await Location.getForegroundPermissionsAsync();
    setLocationEnabled(loc.granted);

    const cam = await Camera.getCameraPermissionsAsync();
    setCameraEnabled(cam.granted);
  };

  const toggleNotifications = async () => {
    if (notifEnabled) {
      setNotifEnabled(false);
      return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifEnabled(status === "granted");
  };

  const toggleLocation = async () => {
    if (locationEnabled) {
      setLocationEnabled(false);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    setLocationEnabled(status === "granted");
    if (status === "granted") {
      await AsyncStorage.setItem("ghost:send_location", "true");
    } else {
      await AsyncStorage.removeItem("ghost:send_location");
    }
  };

  const toggleCamera = async () => {
    if (cameraEnabled) {
      setCameraEnabled(false);
      return;
    }
    const { status } = await Camera.requestCameraPermissionsAsync();
    setCameraEnabled(status === "granted");
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
              Ghost can reach you with proactive updates
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
              Ghost uses your location for contextual awareness
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
              Take photos to share with Ghost
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
    marginTop: 2,
    opacity: 0.5,
    fontFamily: FONT,
    color: Ghost.text.secondary,
  },
});
