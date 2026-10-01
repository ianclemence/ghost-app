import { describe, expect, test } from "bun:test";
import {
  bytesToHex, hexToBytes, sealRequest, Session, splitFrames, sealedFetch, MSG_DATA, MSG_END, MSG_HEAD, b64urlToBytes,
} from "./sealedFetch";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { gcm } from "@noble/ciphers/aes.js";

// Produced by the Go code (pkg/relaycrypto/golden_test.go); the same hex is pinned there.
const POD_SEED = new Uint8Array(32).fill(1);
const EPH_SEED = new Uint8Array(32).fill(2);
const POD_PUBLIC = "a4e09292b651c278b9772c569f5fa9bb13d906b46ab68c9df9dc2b4409f8a209";
const ENVELOPE = "01ce8d3ad1ccb633ec7b70c17814a5c76ecd029685050d344745ba05870e587d590000000000000001b0fb8fe7adf9266b3d780e9ec9f2f1c8cceffdf65c280bf38baad1";
const REPLY = "00000000000000018613e306209f58e4f8c4fce91eac47740ef7441563";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe("compatibility with the Go implementation", () => {
  test("the Pod key and the sealed request are byte-identical to Go's", () => {
    expect(bytesToHex(x25519.getPublicKey(POD_SEED))).toBe(POD_PUBLIC);
    const { envelope } = sealRequest(hexToBytes(POD_PUBLIC), enc("hello ghost"), EPH_SEED);
    expect(bytesToHex(envelope)).toBe(ENVELOPE);
  });

  test("a reply sealed by Go opens here", () => {
    const { session } = sealRequest(hexToBytes(POD_PUBLIC), enc("hello ghost"), EPH_SEED);
    const { kind, content } = session.openMessage(hexToBytes(REPLY));
    expect(kind).toBe(MSG_DATA);
    expect(dec(content)).toBe("pong");
  });

  test("replays, reordering and tampering are refused", () => {
    const { session } = sealRequest(hexToBytes(POD_PUBLIC), enc("x"), EPH_SEED);
    session.openMessage(hexToBytes(REPLY));
    expect(() => session.openMessage(hexToBytes(REPLY))).toThrow(); // the same counter again
    const { session: s2 } = sealRequest(hexToBytes(POD_PUBLIC), enc("x"), EPH_SEED);
    const bad = hexToBytes(REPLY);
    bad[bad.length - 1] ^= 1;
    expect(() => s2.openMessage(bad)).toThrow(); // altered
  });
});

// A minimal Pod, to drive sealedFetch end to end without a network.
function fakePod(handler: (req: Record<string, unknown>) => { status: number; headers?: Record<string, string[]>; chunks: string[]; omitEnd?: boolean }) {
  return async (_url: string, init: { body: Uint8Array }) => {
    const env = init.body;
    const eph = env.subarray(1, 33);
    const shared = x25519.getSharedSecret(POD_SEED, eph);
    const okm = hkdf(sha256, shared, new Uint8Array([...eph, ...x25519.getPublicKey(POD_SEED)]), enc("ghost-relay-e2e-v1"), 64);
    const c2s = okm.slice(0, 32), s2c = okm.slice(32);
    const sealed = env.subarray(33);
    const hdr = sealed.subarray(0, 8);
    const plain = gcm(c2s, new Uint8Array([0, 0, 0, 0, ...hdr]), hdr).decrypt(sealed.subarray(8));
    const req = JSON.parse(dec(plain));
    const r = handler(req);
    const reply = new Session(s2c, c2s);
    const frames: Uint8Array[] = [];
    const push = (kind: number, content: Uint8Array) => {
      const m = reply.seal(new Uint8Array([kind, ...content]));
      const f = new Uint8Array(4 + m.length);
      new DataView(f.buffer).setUint32(0, m.length);
      f.set(m, 4);
      frames.push(f);
    };
    push(MSG_HEAD, enc(JSON.stringify({ status: r.status, headers: r.headers })));
    r.chunks.forEach((c) => push(MSG_DATA, enc(c)));
    if (!r.omitEnd) push(MSG_END, new Uint8Array());
    const all = new Uint8Array(frames.reduce((n, f) => n + f.length, 0));
    let o = 0;
    for (const f of frames) { all.set(f, o); o += f.length; }
    // Deliver in awkward pieces, as a network does.
    const pieces: Uint8Array[] = [];
    for (let i = 0; i < all.length; i += 9) pieces.push(all.subarray(i, i + 9));
    let i = 0;
    return new Response(new ReadableStream({ pull(c) { i < pieces.length ? c.enqueue(pieces[i++]) : c.close(); } }), { status: 200 });
  };
}

const TARGET = { relayServer: "https://relay.test", ghostId: "ghost-1", clientToken: "tok-123", podKey: Buffer.from(hexToBytes(POD_PUBLIC)).toString("base64url") };

describe("sealedFetch", () => {
  const realFetch = globalThis.fetch;
  const withPod = async (h: Parameters<typeof fakePod>[0], run: () => Promise<void>) => {
    globalThis.fetch = fakePod(h) as unknown as typeof fetch;
    try { await run(); } finally { globalThis.fetch = realFetch; }
  };

  test("a request goes through sealed and the answer streams back whole", () =>
    withPod((req) => {
      expect(req.method).toBe("POST");
      expect(req.path).toBe("/v1/chat");
      expect(req.query).toBe("a=1");
      expect(req.token).toBe("tok-123");
      expect(dec(b64urlToBytes(Buffer.from(req.body as string, "base64").toString("base64url")))).toBe('{"msg":"hi"}');
      const h = req.headers as Record<string, string[]>;
      expect(h["X-Ghost-Device-ID"]).toEqual(["dev"]);
      expect(Object.keys(h).some((k) => k.toLowerCase().startsWith("x-ghost-client"))).toBe(false); // relay credentials never go inside
      return { status: 201, headers: { "Content-Type": ["text/plain"] }, chunks: ["hello ", "sealed ", "world"] };
    }, async () => {
      const res = await sealedFetch(TARGET, "https://relay.test/v1/chat?a=1", {
        method: "POST", headers: { "X-Ghost-Device-ID": "dev", "X-Ghost-Client-Id": "ghost-1" }, body: '{"msg":"hi"}',
      });
      expect(res.status).toBe(201);
      expect(res.headers.get("content-type")).toBe("text/plain");
      expect(await res.text()).toBe("hello sealed world");
    }));

  test("a reply that loses its end is an error, not a short answer", () =>
    withPod(() => ({ status: 200, chunks: ["partial"], omitEnd: true }), async () => {
      const res = await sealedFetch(TARGET, "https://relay.test/v1/history");
      await expect(res.text()).rejects.toThrow(/cut short/);
    }));

  test("the relay's own refusals pass straight through", async () => {
    globalThis.fetch = (async () => new Response('{"error":"device offline"}', { status: 503 })) as unknown as typeof fetch;
    try {
      const res = await sealedFetch(TARGET, "https://relay.test/v1/history");
      expect(res.status).toBe(503);
    } finally { globalThis.fetch = realFetch; }
  });

  test("splitFrames waits for whole frames", () => {
    const a = new Uint8Array([0, 0, 0, 3, 1, 2, 3, 0, 0, 0, 2, 9]);
    const { frames, rest } = splitFrames(a);
    expect(frames.length).toBe(1);
    expect(rest.length).toBe(5);
  });
});
