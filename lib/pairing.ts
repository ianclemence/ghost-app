import * as Linking from "expo-linking";
import type { GhostConfig } from "./ghostApi";

/**
 * Pairing URL formats:
 *
 * Secure pairing (new — short-lived token):
 *   ghost://pair?token=<pairing_token>&host=<ip>&port=<port>
 *
 * LAN (legacy):
 *   ghost://connect?host=192.168.1.42&port=8766&secret=...
 *
 * Relay (legacy):
 *   ghost://connect?transport=relay&relay=<server_url>&ghost=<device_id>&token=<client_token>
 */

export interface SecurePairingPayload {
  type: "secure";
  token: string;
  host: string;
  port: string;
}

export interface LegacyPairingPayload {
  type: "legacy";
  config: GhostConfig;
}

export type PairingPayload = SecurePairingPayload | LegacyPairingPayload;

function getQueryParams(url: string): Record<string, string> {
  let parsed: Linking.ParsedURL;
  try {
    parsed = Linking.parse(url);
  } catch {
    return {};
  }
  const queryParams = parsed.queryParams ?? {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(queryParams)) {
    result[key] = Array.isArray(value) ? value[0] : (value as string);
  }
  // Also extract from hostname (e.g., ghost://192.168.1.42:8766?...)
  if (parsed.hostname) {
    const idx = parsed.hostname.lastIndexOf(":");
    if (idx > -1 && /^\d+$/.test(parsed.hostname.slice(idx + 1))) {
      result._host = parsed.hostname.slice(0, idx);
      result._port = parsed.hostname.slice(idx + 1);
    } else if (parsed.hostname !== "connect" && parsed.hostname !== "pair") {
      result._host = parsed.hostname;
    }
  }
  return result;
}

/**
 * Parse a pairing URI. Returns a typed payload indicating the pairing method.
 * Use `resolvePairing()` to convert to a GhostConfig after redeeming the token.
 */
export function parsePairingURI(url: string): PairingPayload | null {
  const qp = getQueryParams(url);

  // Secure pairing: ghost://pair?token=...&host=...&port=...
  if (url.includes("://pair?") || url.includes("://pair?")) {
    const token = qp.token;
    const host = qp.host ?? qp._host;
    const port = qp.port ?? qp._port ?? "8766";
    if (!token || !host) return null;
    return { type: "secure", token, host, port };
  }

  // Relay pairing: ghost://connect?transport=relay&...
  const transport = qp.transport;
  if (transport === "relay") {
    const relayServer = qp.relay;
    const ghostId = qp.ghost;
    const token = qp.token ?? qp.clientToken;
    if (!relayServer || !ghostId || !token) return null;
    return {
      type: "legacy",
      config: {
        piHost: "",
        piPort: "8766",
        secret: "",
        session: "mobile:default",
        sendLocation: true,
        transport: "relay",
        relayServer,
        ghostId,
        clientToken: token,
      },
    };
  }

  // LAN pairing (legacy): ghost://connect?host=...&secret=...
  let host = qp.host ?? qp._host;
  const secret = qp.secret;
  if (host && secret) {
    const port = qp.port ?? qp._port ?? "8766";
    return {
      type: "legacy",
      config: {
        piHost: host,
        piPort: port,
        secret,
        session: "mobile:default",
        sendLocation: true,
      },
    };
  }

  return null;
}

/** @deprecated Use parsePairingURI() instead. */
export function parseConnectURL(url: string): GhostConfig | null {
  const payload = parsePairingURI(url);
  if (!payload) return null;
  if (payload.type === "secure") return null; // requires redemption first
  return payload.config;
}

export function buildConnectURL(cfg: GhostConfig): string {
  if (cfg.transport === "relay" && cfg.relayServer && cfg.ghostId && cfg.clientToken) {
    const relay = encodeURIComponent(cfg.relayServer);
    const ghost = encodeURIComponent(cfg.ghostId);
    const token = encodeURIComponent(cfg.clientToken);
    return `ghost://connect?transport=relay&relay=${relay}&ghost=${ghost}&token=${token}`;
  }
  const host = encodeURIComponent(cfg.piHost);
  const port = encodeURIComponent(cfg.piPort || "8766");
  const secret = encodeURIComponent(cfg.secret);
  return `ghost://connect?host=${host}&port=${port}&secret=${secret}`;
}

/** Build a secure pairing QR URI for the Ghost Pod web UI. */
export function buildPairingQRURL(
  token: string,
  host: string,
  port: string
): string {
  return `ghost://pair?token=${encodeURIComponent(token)}&host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}`;
}
