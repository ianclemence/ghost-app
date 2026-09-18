/**
 * First-run state.
 *
 * Records that the user chose to explore Ghost without installing a local
 * model or pairing a Pod. This is a UX preference, not a credential: it
 * lives in AsyncStorage (non-sensitive) and is deliberately NOT cleared
 * with device credentials, so an auth failure never throws the user back
 * to the front door.
 *
 * Why it exists: the phone is a first-class Ghost and a Pod is optional.
 * A user who declines both must still be able to reach the app instead of
 * being bounced to /onboarding on every cold start.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ghost:first_run_dismissed";

export async function dismissFirstRun(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "1");
  } catch {
    // Best-effort: a storage failure must not block reaching the app.
  }
}

export async function isFirstRunDismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === "1";
  } catch {
    return false;
  }
}
