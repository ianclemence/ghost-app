import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

/**
 * The phone as Ghost's senses (Android only): notifications from the apps the
 * owner chose, and daily totals from Health Connect. Null where the native
 * side is missing (iOS, the web, a build from before it existed), so callers
 * say "not on this phone" instead of crashing.
 */
export interface SharedNotification {
  package: string;
  app: string;
  title: string;
  text: string;
  /** ms since epoch */
  at: number;
}

export interface SeenApp {
  package: string;
  app: string;
  at: number;
}

export interface HealthDayTotals {
  date: string;
  steps?: number;
  sleep_minutes?: number;
  resting_hr?: number;
}

export type HealthStatus = "unavailable" | "needs_update" | "not_granted" | "partial" | "granted";

interface GhostDeviceNative {
  notificationAccessGranted(): boolean;
  openNotificationAccessSettings(): void;
  setAllowedApps(packages: string[]): void;
  allowedApps(): string[];
  recentApps(): SeenApp[];
  takeNotifications(): SharedNotification[];
  putBackNotifications(items: SharedNotification[]): void;
  healthStatus(): Promise<HealthStatus>;
  requestHealth(): Promise<HealthStatus>;
  readHealth(days: number): Promise<HealthDayTotals[]>;
}

export const GhostDevice: GhostDeviceNative | null =
  Platform.OS === "android" ? requireOptionalNativeModule<GhostDeviceNative>("GhostDevice") : null;
