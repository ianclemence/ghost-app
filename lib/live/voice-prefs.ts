import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_VOICE, isLiveVoice, type LiveVoice } from "./voices";

const KEY = "ghost.live.voice";

export async function loadLiveVoice(): Promise<LiveVoice> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (isLiveVoice(raw)) return raw;
  } catch {}
  return DEFAULT_VOICE;
}

export async function saveLiveVoice(voice: LiveVoice): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, voice);
  } catch {}
}
