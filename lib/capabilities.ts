import Constants, { AppOwnership } from "expo-constants";

export type CapabilityId =
  | "notifications"
  | "location"
  | "camera"
  | "microphone"
  | "mediaLibrary"
  | "haptics";

export interface CapabilityState {
  supported: boolean;
  reason: string | null;
}

export function isExpoGo(): boolean {
  try {
    return Constants.appOwnership === AppOwnership.Expo;
  } catch {
    return false;
  }
}

export function isDevBuild(): boolean {
  return !isExpoGo();
}

const EXPO_GO_LIMITED: Record<CapabilityId, string | null> = {
  notifications: "Notifications aren't available in this test environment.",
  location: null,
  camera: null,
  microphone: null,
  mediaLibrary: null,
  haptics: null,
};

export function capability(id: CapabilityId): CapabilityState {
  if (isExpoGo() && EXPO_GO_LIMITED[id]) {
    return { supported: false, reason: EXPO_GO_LIMITED[id] };
  }
  return { supported: true, reason: null };
}

export async function ensureModule<T>(id: CapabilityId, loader: () => Promise<T>): Promise<T | null> {
  const cap = capability(id);
  if (!cap.supported) return null;
  try {
    return await loader();
  } catch {
    return null;
  }
}
