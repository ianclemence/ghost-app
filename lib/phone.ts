/**
 * The phone as Ghost's senses and hands, as far as the owner allows (Settings
 * → Phone). Three switches, all off until turned on:
 *
 *   notifications  the apps they choose; the rest are never read past a name
 *   health         daily totals from Health Connect
 *   places         reminders at places: the phone watches them and shows the
 *                  reminder itself the moment it arrives, then tells the Pod
 *
 * Everything is sent to the owner's own Pod and nowhere else.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { GhostDevice, type SharedNotification } from "@/modules/ghost-device";
import { phoneCall, type PhonePlace } from "./ghostApi";
import type { GhostConfig } from "./ghostApi";

export const GEOFENCE_TASK = "ghost-places";
const KEY = "ghost.phone.v1";
const PLACES_KEY = "ghost.phone.places.v1";

export type { PhoneSettings } from "./phoneShape";
export { DEFAULT_SETTINGS, normalizeSettings, toPodNotes, toRegions } from "./phoneShape";
import { DEFAULT_SETTINGS, normalizeSettings, toPodNotes, toRegions, type PhoneSettings } from "./phoneShape";

export async function loadPhoneSettings(): Promise<PhoneSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function savePhoneSettings(s: PhoneSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
  GhostDevice?.setAllowedApps(s.notifications ? s.apps : []);
}

let syncing = false;
// What the Pod was last told the phone shares, so it is said again only when it changes.
let toldSharing = "";

/** Names for the shared apps, as Android labels them (com.google.android.gm → Gmail). */
function sharedAppNames(packages: string[]): string[] {
  const seen = GhostDevice?.recentApps() ?? [];
  return packages.map((p) => seen.find((a) => a.package === p)?.app ?? p.split(".").filter((x) => x !== "android" && x !== "app").pop() ?? p);
}

/**
 * Send what the owner allowed and refresh the places the phone watches. Safe
 * to call often (on open, on return to the app); a send that fails puts the
 * notifications back for next time. Returns what happened, for the Settings
 * screen to say.
 */
export async function syncPhone(cfg: GhostConfig, opts?: { quick?: boolean }): Promise<{ notes: number; healthDays: number; places: number; error?: string }> {
  const out = { notes: 0, healthDays: 0, places: 0 } as { notes: number; healthDays: number; places: number; error?: string };
  if (syncing || Platform.OS !== "android") return out;
  syncing = true;
  try {
    const s = await loadPhoneSettings();
    let notes: SharedNotification[] = [];
    if (s.notifications && GhostDevice?.notificationAccessGranted()) notes = GhostDevice.takeNotifications();
    let health: { date: string; steps?: number; sleep_minutes?: number; resting_hr?: number }[] = [];
    if (s.health && GhostDevice && !opts?.quick) {
      try {
        if ((await GhostDevice.healthStatus()) !== "not_granted") health = await GhostDevice.readHealth(14);
      } catch {
        // Health Connect unavailable right now: nothing to send this time.
      }
    }
    // The Pod is told what is shared (so Ghost can say "Gmail isn't shared"
    // rather than guess) whenever that changes, with whatever is new.
    const sharing = { notifications: s.notifications, apps: s.notifications ? sharedAppNames(s.apps) : [] };
    const sharingKey = JSON.stringify(sharing);
    if (notes.length || health.length || sharingKey !== toldSharing) {
      const r = await phoneCall<{ notes: number; health_days: number }>(cfg, "/v1/phone/signals", { method: "POST", body: JSON.stringify({ notes: toPodNotes(notes), health, sharing }) });
      if (r.ok) {
        toldSharing = sharingKey;
        out.notes = r.data.notes;
        out.healthDays = r.data.health_days;
      } else {
        if (notes.length) GhostDevice?.putBackNotifications(notes);
        out.error = r.error;
      }
    }
    if (opts?.quick) return out;
    if (s.places) out.places = await watchPlaces(cfg);
    else await stopPlaces();
  } finally {
    syncing = false;
  }
  return out;
}

/** Start watching the Pod's place reminders; returns how many. */
export async function watchPlaces(cfg: GhostConfig): Promise<number> {
  const r = await phoneCall<{ places: PhonePlace[] }>(cfg, "/v1/phone/places");
  if (!r.ok) return 0;
  const Location = await import("expo-location");
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  if (!fg.granted || !bg.granted) return 0;
  const regions = toRegions(r.data.places);
  await AsyncStorage.setItem(PLACES_KEY, JSON.stringify(r.data.places.map((p) => ({ id: p.id, name: p.name, message: p.message }))));
  if (regions.length === 0) {
    await stopPlaces();
    return 0;
  }
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  return regions.length;
}

export async function stopPlaces(): Promise<void> {
  try {
    const Location = await import("expo-location");
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) await Location.stopGeofencingAsync(GEOFENCE_TASK);
  } catch {
    // never started
  }
}

/** The reminder text for a place the phone just crossed (kept with the regions). */
export async function placeMessage(id: string): Promise<{ name: string; message: string } | null> {
  try {
    const list = JSON.parse((await AsyncStorage.getItem(PLACES_KEY)) ?? "[]") as { id: string; name: string; message: string }[];
    return list.find((p) => p.id === id) ?? null;
  } catch {
    return null;
  }
}
