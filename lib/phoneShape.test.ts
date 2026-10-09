import { describe, expect, test } from "bun:test";
import { normalizeSettings, toPodNotes, toRegions } from "./phoneShape";
import { alarmIntent } from "./drafts";

describe("the phone bridge", () => {
  test("settings from storage are never trusted to be whole", () => {
    expect(normalizeSettings(null)).toEqual({ notifications: false, apps: [], health: false, places: false });
    expect(normalizeSettings({ notifications: true, apps: ["com.whatsapp", 4], health: "yes" })).toEqual({ notifications: true, apps: ["com.whatsapp"], health: false, places: false });
  });
  test("notifications go to the Pod with their app and time", () => {
    const out = toPodNotes([
      { package: "com.whatsapp", app: "WhatsApp", title: "Mum", text: "Call me", at: Date.UTC(2026, 9, 9, 8) },
      { package: "x", app: "X", title: "", text: "", at: 0 },
    ]);
    expect(out).toEqual([{ app: "WhatsApp", title: "Mum", text: "Call me", at: "2026-10-09T08:00:00.000Z" }]);
  });
  test("only active places with real coordinates are watched", () => {
    const r = toRegions([
      { id: "a", name: "Shop", lat: -1.26, lon: 36.8, radius: 80, message: "Milk", on: "enter", once: true, active: true },
      { id: "b", name: "Gone", lat: 1, lon: 1, radius: 150, message: "x", on: "exit", once: true, active: false },
    ]);
    expect(r).toEqual([{ identifier: "a", latitude: -1.26, longitude: 36.8, radius: 100, notifyOnEnter: true, notifyOnExit: false }]);
  });
  test("an alarm is the clock's own request", () => {
    expect(alarmIntent("06:30", "Flight")?.extras).toEqual([
      { key: "android.intent.extra.alarm.HOUR", value: 6 },
      { key: "android.intent.extra.alarm.MINUTES", value: 30 },
      { key: "android.intent.extra.alarm.MESSAGE", value: "Flight" },
      { key: "android.intent.extra.alarm.SKIP_UI", value: true },
    ]);
    expect(alarmIntent("25:00", "")).toBeNull();
    expect(alarmIntent("half six", "")).toBeNull();
  });
});
