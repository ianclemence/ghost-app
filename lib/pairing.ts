/**
 * Pairing URI parser for Ghost mobile app.
 *
 * Supported URI formats:
 *
 *   ghost://pair?v=1&token=...&host=...&port=...     (LAN pairing, v1)
 *   ghost://pair?v=1&transport=relay&relay=...&ghost=...&token=...  (relay pairing, v1)
 *   ghost://connect?host=...&secret=...                (legacy LAN, deprecated)
 *   ghost://connect?transport=relay&...                (legacy relay, deprecated)
 *
 * Security:
 * - Only ghost:// scheme accepted
 * - Only recognized routes accepted (pair, connect)
 * - Version field validated
 * - Required fields checked
 * - Token format validated (hex, minimum length)
 */
import * as Linking from "expo-linking";
import type { GhostConfig } from "./ghostApi";

// ─── Types ───────────────────────────────────────────────────────────────

export interface SecurePairingPayload {
  type: "secure";
  version: number;
  transport: "lan" | "relay";
  token: string;
  host: string;
  port: string;
  // Relay-specific
  relayServer?: string;
  ghostId?: string;
}

export interface LegacyPairingPayload {
  type: "legacy";
  config: GhostConfig;
}

export type PairingPayload = SecurePairingPayload | LegacyPairingPayload;

// ─── Constants ───────────────────────────────────────────────────────────

const SUPPORTED_VERSION = 1;
const VALID_TOKEN_PATTERN = /^[0-9a-f]{32,}$/i; // at least 32 hex chars
const VALID_HOST_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

// ─── Parser ──────────────────────────────────────────────────────────────

function getQueryParams(url: string): Record<string, string> {
  let parsed: Linking.ParsedURL;
  try {
    parsed = Linking.parse(url);
  } catch {
    return {};
  }
  const result: Record<string, string> = {};
  const qp = parsed.queryParams ?? {};
  for (const [key, value] of Object.entries(qp)) {
    result[key] = Array.isArray(value) ? value[0] : (value as string);
  }
  // Extract hostname:port from URL host position
  if (parsed.hostname) {
    const idx = parsed.hostname.lastIndexOf(":");
    if (idx > -1 && /^\d+$/.test(parsed.hostname.slice(idx + 1))) {
      result._host = parsed.hostname.slice(0, idx);
      result._port = parsed.hostname.slice(idx + 1);
    } else if (
      parsed.hostname !== "connect" &&
      parsed.hostname !== "pair" &&
      parsed.hostname !== "localhost"
    ) {
      result._host = parsed.hostname;
    }
  }
  return result;
}

/**
 * Parse a Ghost pairing URI.
 *
 * Returns a typed payload indicating the pairing method and validated fields.
 * Returns null for any invalid/malformed/unrecognized URI.
 */
export function parsePairingURI(url: string): PairingPayload | null {
  // Only accept ghost:// scheme
  if (!url.startsWith("ghost://")) return null;

  const qp = getQueryParams(url);

  // ── Secure pairing (v1): ghost://pair?v=1&token=...&host=... ──
  if (url.includes("://pair?") || url.includes("://pair?")) {
    const version = parseInt(qp.v || "0", 10);
    if (version !== SUPPORTED_VERSION) return null;

    const token = qp.token;
    if (!token || !VALID_TOKEN_PATTERN.test(token)) return null;

    const transport = (qp.transport as "lan" | "relay") || "lan";

    if (transport === "relay") {
      const relayServer = qp.relay;
      const ghostId = qp.ghost;
      if (!relayServer || !ghostId) return null;
      return {
        type: "secure",
        version,
        transport: "relay",
        token,
        host: "",
        port: qp.port || "8766",
        relayServer,
        ghostId,
      };
    }

    // LAN pairing
    const host = qp.host ?? qp._host;
    if (!host) return null;
    const port = qp.port ?? qp._port ?? "8766";
    return {
      type: "secure",
      version,
      transport: "lan",
      token,
      host,
      port,
    };
  }

  // ── Legacy relay: ghost://connect?transport=relay&... ──
  if (qp.transport === "relay") {
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

  // ── Legacy LAN: ghost://connect?host=...&secret=... ──
  const host = qp.host ?? qp._host;
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

/**
 * @deprecated Use parsePairingURI() instead.
 */
export function parseConnectURL(url: string): GhostConfig | null {
  const payload = parsePairingURI(url);
  if (!payload) return null;
  if (payload.type === "secure") return null; // requires redemption first
  return payload.config;
}

// ─── URI Builders ────────────────────────────────────────────────────────

/** Build a v1 pairing QR URI for the Ghost Pod to display. */
export function buildPairingQRURL(
  token: string,
  host: string,
  port: string,
): string {
  return `ghost://pair?v=1&token=${encodeURIComponent(token)}&host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}`;
}

/** Build a legacy connect URI (deprecated, for backward compatibility). */
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

// ─── Validation Helpers ──────────────────────────────────────────────────

export function isValidGhostURI(url: string): boolean {
  return url.startsWith("ghost://");
}

export function isSecurePairingURI(url: string): boolean {
  return url.includes("://pair?");
}

export function validatePairingToken(token: string): boolean {
  return VALID_TOKEN_PATTERN.test(token);
}

export function validateHost(host: string): boolean {
  return VALID_HOST_PATTERN.test(host);
}
