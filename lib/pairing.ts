import * as Linking from "expo-linking";
import type { GhostConfig } from "./ghostApi";

/**
 * Pairing URL format (shown as a QR code by the web console):
 *   ghost://connect?host=192.168.1.42&port=8766&secret=...
 *
 * The host may also be carried in the URL hostname position
 * (ghost://192.168.1.42:8766?secret=...).
 */
export function parseConnectURL(url: string): GhostConfig | null {
  let parsed: Linking.ParsedURL;
  try {
    parsed = Linking.parse(url);
  } catch {
    return null;
  }
  const { hostname } = parsed;
  const queryParams = parsed.queryParams ?? {};
  const qp = (key: string): string | undefined => {
    const v = queryParams[key];
    return Array.isArray(v) ? v[0] : (v as string | undefined);
  };
  let host = qp("host");
  let urlPort: string | undefined;
  if (!host && hostname && hostname !== "connect") {
    // ghost://192.168.1.42:8766?secret=... — the port may ride along in
    // the hostname field depending on the parser.
    const idx = hostname.lastIndexOf(":");
    if (idx > -1 && /^\d+$/.test(hostname.slice(idx + 1))) {
      host = hostname.slice(0, idx);
      urlPort = hostname.slice(idx + 1);
    } else {
      host = hostname;
    }
  }
  const secret = qp("secret");
  if (!host || !secret) return null;
  const parsedPort = qp("port") ?? urlPort ?? "8766";
  return {
    piHost: host,
    piPort: parsedPort,
    secret,
    session: "mobile:default",
    sendLocation: true,
  };
}

export function buildConnectURL(cfg: GhostConfig): string {
  const host = encodeURIComponent(cfg.piHost);
  const port = encodeURIComponent(cfg.piPort || "8766");
  const secret = encodeURIComponent(cfg.secret);
  return `ghost://connect?host=${host}&port=${port}&secret=${secret}`;
}
