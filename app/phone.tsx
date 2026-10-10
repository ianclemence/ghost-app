import React, { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Bell, HeartPulse, MapPin, Plus } from "lucide-react-native";
import { Text } from "@/components/text";
import { ScreenHeader } from "@/components/screen-header";
import { ScreenBackground } from "@/components/screen-glow";
import { EdgeScrollView } from "@/components/scroll-edge";
import { GhostButton, GhostSheet, GhostToggle } from "@/components/ghost";
import { lifeStyles } from "@/components/life-ui";
import { alpha, Ghost, Space } from "@/constants/theme";
import { GhostDevice, type HealthStatus, type SeenApp } from "@/modules/ghost-device";
import { forgetPhoneNotes } from "@/lib/ghostApi";
import { loadPhoneSettings, savePhoneSettings, stopPlaces, syncPhone, DEFAULT_SETTINGS, type PhoneSettings } from "@/lib/phone";
import { showDialog } from "@/lib/dialog";
import { useGhostStore } from "@/lib/store";

/**
 * What the phone may tell Ghost, one switch each, all off until the owner
 * turns them on: notifications from apps they choose, daily health totals,
 * and the places they asked to be reminded at. Each says what it shares and
 * where it goes (their Pod, nowhere else), and each can be turned off again,
 * with what was shared forgotten.
 */
/** An app's name: as Android reported it, else made from its package (com.whatsapp → Whatsapp). */
function appName(pkg: string, seen: SeenApp[]): string {
  const known = seen.find((a) => a.package === pkg)?.app;
  if (known) return known;
  const last = pkg.split(".").filter((p) => p !== "android" && p !== "app").pop() ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export default function PhoneScreen() {
  const config = useGhostStore((s) => s.config);
  const [s, setS] = useState<PhoneSettings>(DEFAULT_SETTINGS);
  const [access, setAccess] = useState(false);
  const [apps, setApps] = useState<SeenApp[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [locationOk, setLocationOk] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const native = !!GhostDevice;

  const refresh = useCallback(async () => {
    setS(await loadPhoneSettings());
    if (!GhostDevice) return;
    setAccess(GhostDevice.notificationAccessGranted());
    setApps(GhostDevice.recentApps());
    try {
      setHealth(await GhostDevice.healthStatus());
    } catch {
      setHealth("unavailable");
    }
    try {
      const Location = await import("expo-location");
      const bg = await Location.getBackgroundPermissionsAsync();
      setLocationOk(bg.granted);
    } catch {
      setLocationOk(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    // Coming back from Android settings: read what was granted.
    const sub = AppState.addEventListener("change", (st) => st === "active" && void refresh());
    return () => sub.remove();
  }, [refresh]);

  const update = async (next: PhoneSettings) => {
    setS(next);
    await savePhoneSettings(next);
    Haptics.selectionAsync().catch(() => {});
    if (config) {
      const r = await syncPhone(config);
      if (r.error) setNote(r.error);
    }
  };

  const toggleNotifications = async (on: boolean) => {
    if (on && GhostDevice && !GhostDevice.notificationAccessGranted()) {
      showDialog("Let Ghost read notifications", "Android asks you to allow it in its own settings: find Ghost in the list and turn it on. Ghost only keeps those of the apps you choose here.", [
        { text: "Not now", style: "cancel" },
        { text: "Open settings", onPress: () => GhostDevice?.openNotificationAccessSettings() },
      ]);
    }
    await update({ ...s, notifications: on });
    if (!on && config) {
      await forgetPhoneNotes(config);
      setNote("Turned off. The notifications Ghost had are forgotten.");
    }
  };

  const toggleApp = (pkg: string) => {
    const has = s.apps.includes(pkg);
    void update({ ...s, apps: has ? s.apps.filter((x) => x !== pkg) : [...s.apps, pkg] });
  };

  const toggleHealth = async (on: boolean) => {
    if (on && GhostDevice) {
      try {
        const st = await GhostDevice.healthStatus();
        if (st === "unavailable") {
          setNote("Health Connect isn't on this phone. Install it from the Play Store, then try again.");
          return;
        }
        if (st === "needs_update") {
          setNote("Health Connect needs an update first.");
          Linking.openURL("market://details?id=com.google.android.apps.healthdata").catch(() => {});
          return;
        }
        if (st !== "granted") setHealth(await GhostDevice.requestHealth());
      } catch {
        setNote("Couldn't ask Health Connect. Try again.");
        return;
      }
    }
    await update({ ...s, health: on });
  };

  const togglePlaces = async (on: boolean) => {
    if (on) {
      try {
        const Location = await import("expo-location");
        const fg = await Location.requestForegroundPermissionsAsync();
        if (!fg.granted) {
          setNote("Place reminders need your location.");
          return;
        }
        const bg = await Location.requestBackgroundPermissionsAsync();
        setLocationOk(bg.granted);
        if (!bg.granted) {
          setNote("Choose “Allow all the time” for Ghost's location, so it can remind you when you arrive.");
          Linking.openSettings().catch(() => {});
          return;
        }
      } catch {
        setNote("Couldn't ask for your location.");
        return;
      }
    } else {
      await stopPlaces();
    }
    await update({ ...s, places: on });
  };

  if (Platform.OS !== "android" || !native) {
    return (
      <View style={styles.container}>
        <ScreenBackground variant="calm" />
        <ScreenHeader title="Phone" subtitle="What your phone shares with Ghost" />
        <Text style={styles.unavailable}>
          {Platform.OS !== "android" ? "Sharing notifications, health and places with Ghost works on Android phones." : "This version of Ghost can't share from the phone yet. Install the latest version to turn it on."}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenBackground variant="calm" />
      <ScreenHeader title="Phone" subtitle="What your phone shares with Ghost" />
      <EdgeScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>Each goes only to your Pod, and only once you turn it on.</Text>

        <Section
          Icon={Bell}
          tint={Ghost.accent.primary}
          title="Notifications"
          text="Ghost can read the notifications of the apps you choose, so you can ask “did the bank text me?” or “what did Mum say?”. A week is kept."
          on={s.notifications}
          onChange={(v) => void toggleNotifications(v)}
          status={s.notifications ? (access ? `${s.apps.length} ${s.apps.length === 1 ? "app" : "apps"} shared` : "Waiting for access in Android settings") : null}
          warn={s.notifications && !access}
        >
          {s.notifications && !access ? (
            <GhostButton title="Open Android settings" size="sm" variant="secondary" onPress={() => GhostDevice?.openNotificationAccessSettings()} />
          ) : null}
          {s.notifications && access ? (
            <>
              {s.apps.length > 0 ? (
                <View style={lifeStyles.sheetGroup}>
                  {s.apps.map((pkg, i) => (
                    <View key={pkg} style={[styles.app, i > 0 && styles.line]}>
                      <Text style={styles.appName} numberOfLines={1}>{appName(pkg, apps)}</Text>
                      <Pressable onPress={() => toggleApp(pkg)} hitSlop={12} style={({ pressed }) => [styles.remove, pressed && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel={`Stop sharing ${appName(pkg, apps)}`}>
                        <Text style={styles.removeText}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.small}>No apps shared yet. Add the ones Ghost may read.</Text>
              )}
              <GhostButton title="Add an app" size="sm" variant="secondary" style={{ alignSelf: "flex-start" }} onPress={() => setPicking(true)} />
            </>
          ) : null}
        </Section>

        <Section
          Icon={HeartPulse}
          tint={Ghost.status.success}
          title="Health"
          text="Daily totals from Health Connect (steps, sleep, resting heart rate), so Ghost can tell you how your week went. Nothing finer than a day leaves the phone."
          on={s.health}
          onChange={(v) => void toggleHealth(v)}
          status={s.health ? (health === "granted" ? "Shared each day" : health === "partial" ? "Some of it shared" : "Waiting for Health Connect") : null}
          warn={s.health && health !== "granted" && health !== "partial"}
        >
          {s.health && health !== "granted" ? <GhostButton title="Allow in Health Connect" size="sm" variant="secondary" onPress={() => void toggleHealth(true)} /> : null}
        </Section>

        <Section
          Icon={MapPin}
          tint={Ghost.status.warning}
          title="Places"
          text="When you ask “remind me when I get to the shop”, your phone watches that place and reminds you the moment you arrive. Your location stays on the phone; only the arrival is sent."
          on={s.places}
          onChange={(v) => void togglePlaces(v)}
          status={s.places ? (locationOk ? "Watching your place reminders" : "Needs location “all the time”") : null}
          warn={s.places && !locationOk}
        />

        {note ? <Text style={styles.note} accessibilityLiveRegion="polite">{note}</Text> : null}
      </EdgeScrollView>
      <GhostSheet visible={picking} onClose={() => setPicking(false)} title="Add an app" message="Apps that showed a notification recently. Ghost keeps a week of the ones you add.">
        {apps.filter((a) => !s.apps.includes(a.package)).length === 0 ? (
          <Text style={styles.small}>{apps.length === 0 ? "Apps appear here once they show a notification." : "Every app seen so far is already shared."}</Text>
        ) : (
          <View style={lifeStyles.sheetGroup}>
            {apps.filter((a) => !s.apps.includes(a.package)).map((a, i) => (
              <Pressable key={a.package} onPress={() => { toggleApp(a.package); setPicking(false); }} style={({ pressed }) => [styles.app, i > 0 && styles.line, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={`Add ${a.app}`}>
                <Text style={styles.appName} numberOfLines={1}>{a.app}</Text>
                <Plus size={17} color={Ghost.text.secondary} strokeWidth={2} />
              </Pressable>
            ))}
          </View>
        )}
      </GhostSheet>
    </View>
  );
}

function Section({
  Icon,
  tint,
  title,
  text,
  on,
  onChange,
  status,
  warn,
  children,
}: {
  Icon: typeof Bell;
  tint: string;
  title: string;
  text: string;
  on: boolean;
  onChange: (v: boolean) => void;
  status: string | null;
  warn?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={[lifeStyles.group, styles.section]}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: alpha(tint, 0.13), borderColor: alpha(tint, 0.3) }]}>
          <Icon size={17} color={tint} strokeWidth={1.9} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <GhostToggle value={on} onValueChange={onChange} accessibilityLabel={title} />
      </View>
      <Text style={styles.text}>{text}</Text>
      {status ? <Text style={[styles.status, warn && { color: Ghost.status.warning }]}>{status}</Text> : null}
      {children ? <View style={{ gap: Space.sm, marginTop: Space.xs }}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Ghost.bg.base },
  content: { paddingBottom: 96, paddingHorizontal: Space.lg, gap: Space.md },
  lead: { fontSize: 15, lineHeight: 22, fontWeight: "300", color: Ghost.text.secondary, textAlign: "center", marginBottom: Space.xs },
  section: { padding: Space.lg, gap: Space.sm },
  head: { flexDirection: "row", alignItems: "center", gap: Space.md },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 16.5, fontWeight: "500", color: Ghost.text.primary },
  text: { fontSize: 14, lineHeight: 20, fontWeight: "300", color: Ghost.text.secondary },
  status: { fontSize: 13, fontWeight: "500", color: Ghost.status.success },
  small: { fontSize: 13, color: Ghost.text.tertiary },
  app: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 14 },
  remove: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12 },
  removeText: { fontSize: 14, fontWeight: "500", color: Ghost.status.error },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Ghost.border.subtle },
  appName: { flex: 1, fontSize: 15, color: Ghost.text.primary },
  note: { fontSize: 13.5, lineHeight: 19, color: Ghost.text.secondary, textAlign: "center" },
  unavailable: { fontSize: 15, lineHeight: 22, color: Ghost.text.secondary, textAlign: "center", paddingHorizontal: Space.xl, marginTop: Space.xxl },
});
