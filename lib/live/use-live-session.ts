import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { LiveSession } from "./session";
import { createGhostSessionAPI } from "./ghostSessionApi";
import { createTransport } from "./transport";
import type { GhostConfig } from "../ghostApi";
import { DEFAULT_VOICE, isLiveVoice, type LiveVoice } from "./voices";
import { loadLiveVoice, saveLiveVoice } from "./voice-prefs";

export function useLiveSession(cfg: GhostConfig | null) {
  const [voice, setVoiceState] = useState<LiveVoice>(DEFAULT_VOICE);
  const sessionRef = useRef<LiveSession | null>(null);
  const [, force] = useState(0);

  const session = useMemo(() => {
    if (!cfg) return null;
    const api = createGhostSessionAPI(cfg);
    const s = new LiveSession(createTransport, api);
    sessionRef.current = s;
    const unsub = s.subscribe(() => force((n) => n + 1));
    void loadLiveVoice().then((v) => {
      if (isLiveVoice(v)) setVoiceState(v);
    });
    return { session: s, release: unsub };
  }, [cfg]);

  useEffect(() => {
    return () => {
      try {
        session?.release();
      } catch {}
      void session?.session.stop().catch(() => {});
      sessionRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const active = state === "active";
      if (!active && Platform.OS !== "ios") {
        void sessionRef.current?.stop().catch(() => {});
        return;
      }
      sessionRef.current?.setAppActive(active);
    });
    return () => sub.remove();
  }, []);

  const setVoice = (v: LiveVoice) => {
    setVoiceState(v);
    void saveLiveVoice(v).catch(() => {});
  };

  return {
    live: session?.session ?? null,
    snapshot: session?.session.getSnapshot() ?? {
      status: "idle" as const,
      error: null,
      muted: false,
      inputLevel: 0,
      outputLevel: 0,
      elapsedSeconds: 0,
      transcript: [],
    },
    voice,
    setVoice,
  };
}
