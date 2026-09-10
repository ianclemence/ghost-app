import { afterEach, describe, expect, mock, test } from "bun:test";

const secureBacking = new Map<string, string>();
const asyncBacking = new Map<string, string>();

mock.module("expo-secure-store", () => ({
  setItemAsync: async (k: string, v: string) => {
    secureBacking.set(k, v);
  },
  getItemAsync: async (k: string) => secureBacking.get(k) ?? null,
  deleteItemAsync: async (k: string) => {
    secureBacking.delete(k);
  },
}));

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => asyncBacking.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      asyncBacking.set(k, v);
    },
    removeItem: async (k: string) => {
      asyncBacking.delete(k);
    },
  },
}));

const {
  clearAllCredentials,
  clearDeviceCredential,
  getClientToken,
  getConnectionMeta,
  getDeviceCredential,
  hasDeviceCredential,
  redact,
  saveClientToken,
  saveConnectionMeta,
  saveDeviceCredential,
} = await import("./credentials");

afterEach(() => {
  secureBacking.clear();
  asyncBacking.clear();
});

describe("device credentials", () => {
  test("round-trip through the secure store", async () => {
    await saveDeviceCredential({ deviceID: "dev-1", credential: "cred-secret" });
    expect(await getDeviceCredential()).toEqual({ deviceID: "dev-1", credential: "cred-secret" });
    expect(await hasDeviceCredential()).toBe(true);
  });

  test("missing credential reads as null", async () => {
    expect(await getDeviceCredential()).toBeNull();
    expect(await hasDeviceCredential()).toBe(false);
  });

  test("revocation clears every secure entry", async () => {
    await saveDeviceCredential({ deviceID: "dev-1", credential: "cred-secret" });
    await saveClientToken("client-token");
    await clearDeviceCredential();
    expect(await getDeviceCredential()).toBeNull();
    expect(await getClientToken()).toBeNull();
    expect(secureBacking.size).toBe(0);
  });
});

describe("credential boundary", () => {
  test("connection metadata never contains credential material", async () => {
    const secret = "super-secret-credential-value";
    await saveDeviceCredential({ deviceID: "dev-1", credential: secret });
    await saveConnectionMeta({ host: "ghost.local", port: "8766", transport: "lan", ghostName: "Ghost" });
    const meta = await getConnectionMeta();
    expect(meta?.host).toBe("ghost.local");
    const asyncDump = [...asyncBacking.values()].join("|");
    expect(asyncDump.includes(secret)).toBe(false);
    expect(asyncDump.includes("dev-1")).toBe(false);
  });

  test("logout clears metadata too", async () => {
    await saveDeviceCredential({ deviceID: "dev-1", credential: "x" });
    await saveConnectionMeta({ host: "ghost.local", port: "8766" });
    await clearAllCredentials();
    expect(await getConnectionMeta()).toBeNull();
    expect(asyncBacking.size).toBe(0);
    expect(secureBacking.size).toBe(0);
  });

  test("redact hides all but the tail", () => {
    expect(redact("abcdefghij")).toBe("******ghij");
    expect(redact("abc")).toBe("[REDACTED]");
  });
});
