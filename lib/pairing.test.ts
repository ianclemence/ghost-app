import { describe, expect, mock, test } from "bun:test";

mock.module("expo-linking", () => ({
  parse(url: string) {
    const u = new URL(url);
    const queryParams: Record<string, string> = {};
    u.searchParams.forEach((v, k) => {
      queryParams[k] = v;
    });
    return { hostname: u.hostname, queryParams };
  },
}));

const {
  isSecurePairingURI,
  parsePairingURI,
  validateHost,
  validatePairingToken,
} = await import("./pairing");

const TOKEN = "a".repeat(64);

describe("parsePairingURI secure pairing", () => {
  test("accepts a valid LAN pairing URI", () => {
    const p = parsePairingURI(`ghost://pair?v=1&token=${TOKEN}&host=192.168.1.10&port=8766`);
    expect(p?.type).toBe("secure");
    if (p?.type === "secure") {
      expect(p.transport).toBe("lan");
      expect(p.host).toBe("192.168.1.10");
      expect(p.port).toBe("8766");
    }
  });

  test("accepts a valid relay pairing URI", () => {
    const p = parsePairingURI(
      `ghost://pair?v=1&transport=relay&token=${TOKEN}&relay=https://relay.example.com&ghost=ghost-1`,
    );
    expect(p?.type).toBe("secure");
    if (p?.type === "secure") {
      expect(p.transport).toBe("relay");
      expect(p.relayServer).toBe("https://relay.example.com");
      expect(p.ghostId).toBe("ghost-1");
    }
  });

  test("rejects wrong scheme", () => {
    expect(parsePairingURI(`https://pair?v=1&token=${TOKEN}`)).toBeNull();
    expect(parsePairingURI("notaurl")).toBeNull();
  });

  test("rejects unknown routes", () => {
    expect(parsePairingURI(`ghost://other?v=1&token=${TOKEN}`)).toBeNull();
  });

  test("rejects malformed version", () => {
    expect(parsePairingURI(`ghost://pair?v=2&token=${TOKEN}&host=1.2.3.4`)).toBeNull();
    expect(parsePairingURI(`ghost://pair?token=${TOKEN}&host=1.2.3.4`)).toBeNull();
  });

  test("rejects malformed token", () => {
    expect(parsePairingURI("ghost://pair?v=1&token=short&host=1.2.3.4")).toBeNull();
    expect(parsePairingURI("ghost://pair?v=1&host=1.2.3.4")).toBeNull();
    expect(parsePairingURI(`ghost://pair?v=1&token=${"z".repeat(64)}&host=1.2.3.4`)).toBeNull();
  });

  test("rejects relay pairing with missing fields", () => {
    expect(parsePairingURI(`ghost://pair?v=1&transport=relay&token=${TOKEN}`)).toBeNull();
  });

  test("rejects LAN pairing with missing host", () => {
    expect(parsePairingURI(`ghost://pair?v=1&token=${TOKEN}`)).toBeNull();
  });
});

describe("parsePairingURI legacy pairing", () => {
  test("adopts legacy relay links without location behavior", () => {
    const p = parsePairingURI(
      `ghost://connect?transport=relay&relay=https://relay.example.com&ghost=ghost-1&token=${TOKEN}`,
    );
    expect(p?.type).toBe("legacy");
    if (p?.type === "legacy") {
      expect(p.config.transport).toBe("relay");
      expect(p.config.clientToken).toBe(TOKEN);
      expect(p.config.sendLocation).toBe(false);
    }
  });

  test("rejects legacy links with missing fields", () => {
    expect(parsePairingURI("ghost://connect?transport=relay")).toBeNull();
  });

  test("rejects retired shared-secret links", () => {
    expect(parsePairingURI("ghost://connect?host=1.2.3.4&secret=abc")).toBeNull();
  });
});

describe("pairing validators", () => {
  test("token and host helpers", () => {
    expect(validatePairingToken(TOKEN)).toBe(true);
    expect(validatePairingToken("short")).toBe(false);
    expect(validateHost("192.168.1.10")).toBe(true);
    expect(validateHost("not-a-host")).toBe(false);
    expect(isSecurePairingURI(`ghost://pair?v=1&token=${TOKEN}`)).toBe(true);
    expect(isSecurePairingURI("ghost://connect?transport=relay")).toBe(false);
  });
});
