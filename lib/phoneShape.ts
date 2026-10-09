/**
 * The pure half of the phone bridge (lib/phone.ts): the settings' shape and
 * what is sent to the Pod or handed to Android. Testable without a phone.
 */
import type { SharedNotification } from "@/modules/ghost-device";
import type { PhonePlace } from "./ghostApi";

export interface PhoneSettings {
  notifications: boolean;
  /** Packages whose notifications are shared. */
  apps: string[];
  health: boolean;
  places: boolean;
}

export const DEFAULT_SETTINGS: PhoneSettings = { notifications: false, apps: [], health: false, places: false };


/** Settings from storage, never trusted to be whole. */
export function normalizeSettings(v: unknown): PhoneSettings {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    notifications: o.notifications === true,
    apps: Array.isArray(o.apps) ? o.apps.filter((x): x is string => typeof x === "string").slice(0, 40) : [],
    health: o.health === true,
    places: o.places === true,
  };
}


/** The notifications as the Pod takes them. */
export function toPodNotes(list: SharedNotification[]): { app: string; title: string; text: string; at: string }[] {
  return list
    .filter((n) => n && typeof n.app === "string" && (n.title || n.text))
    .map((n) => ({ app: n.app || n.package, title: n.title ?? "", text: n.text ?? "", at: new Date(n.at || Date.now()).toISOString() }));
}

/** The regions the phone watches for the Pod's place reminders. */
export function toRegions(places: PhonePlace[]): { identifier: string; latitude: number; longitude: number; radius: number; notifyOnEnter: boolean; notifyOnExit: boolean }[] {
  return places
    .filter((p) => p.active && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .slice(0, 20) // Android watches at most 100 per app; Ghost keeps it small.
    .map((p) => ({ identifier: p.id, latitude: p.lat, longitude: p.lon, radius: Math.max(100, p.radius), notifyOnEnter: p.on === "enter", notifyOnExit: p.on === "exit" }));
}

