/**
 * End-to-end encrypted requests through a relay.
 *
 * The phone seals each request with a key only the Pod holds (its public half
 * was pinned from the pairing link), posts the sealed bytes to the relay, and
 * opens the sealed reply. The relay carries bytes it cannot read, change or
 * replay, and cannot tell which part of the Pod's API is being used.
 *
 * This is the TypeScript side of pkg/relaycrypto and pkg/relayclient in the
 * Ghost repository. sealedFetch.test.ts pins byte-for-byte vectors produced by
 * the Go code, so the two cannot drift apart.
 *
 *   request  = [1 version][32 ephemeral public key][sealed message]
 *   response = frames of [4 length][sealed message], each opening to a kind byte
 *              then content: 0 head, 1 data, 2 end, 3 error.
 *   sealed   = [8 counter][AES-256-GCM ciphertext+tag]; the counter is the
 *              nonce and the associated data, strictly increasing.
 */
import { gcm } from "@noble/ciphers/aes.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const ENVELOPE_VERSION = 1;
export const KEY_SIZE = 32;
const INFO = new TextEncoder().encode("ghost-relay-e2e-v1");

export const MSG_HEAD = 0;
export const MSG_DATA = 1;
export const MSG_END = 2;
export const MSG_ERR = 3;

// ─── bytes ────────────────────────────────────────────────────────────────

export function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function counterBytes(n: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n));
  return b;
}

function nonceFor(n: number): Uint8Array {
  const b = new Uint8Array(12);
  new DataView(b.buffer).setBigUint64(4, BigInt(n));
  return b;
}

/** Random bytes from the platform; tests may replace it. */
export function randomBytes(n: number): Uint8Array {
  const g = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (!g?.getRandomValues) throw new Error("no secure random source on this device");
  return g.getRandomValues(new Uint8Array(n));
}

// ─── the sealed session ───────────────────────────────────────────────────

export class Session {
  private sendN = 0;
  private recvN = 0;
  constructor(
    private readonly sendKey: Uint8Array,
    private readonly recvKey: Uint8Array,
  ) {}

  seal(plain: Uint8Array): Uint8Array {
    this.sendN += 1;
    const hdr = counterBytes(this.sendN);
    return concat(hdr, gcm(this.sendKey, nonceFor(this.sendN), hdr).encrypt(plain));
  }

  open(sealed: Uint8Array): Uint8Array {
    if (sealed.length < 8 + 16) throw new Error("sealed message too short");
    const hdr = sealed.subarray(0, 8);
    const n = Number(new DataView(hdr.buffer, hdr.byteOffset, 8).getBigUint64(0));
    if (n === 0 || n <= this.recvN) throw new Error("sealed message repeated or out of order");
    // Throws if the message was altered.
    const plain = gcm(this.recvKey, nonceFor(n), hdr).decrypt(sealed.subarray(8));
    this.recvN = n;
    return plain;
  }

  openMessage(sealed: Uint8Array): { kind: number; content: Uint8Array } {
    const m = this.open(sealed);
    if (m.length === 0) throw new Error("empty sealed message");
    return { kind: m[0], content: m.subarray(1) };
  }
}

/** Starts a session against the Pod's pinned key and seals the request. `eph` is for tests. */
export function sealRequest(podPublic: Uint8Array, plain: Uint8Array, eph?: Uint8Array): { session: Session; envelope: Uint8Array } {
  if (podPublic.length !== KEY_SIZE) throw new Error("not a valid Pod key");
  const secret = eph ?? randomBytes(KEY_SIZE);
  const ephPub = x25519.getPublicKey(secret);
  const shared = x25519.getSharedSecret(secret, podPublic);
  const okm = hkdf(sha256, shared, concat(ephPub, podPublic), INFO, 64);
  const session = new Session(okm.slice(0, 32), okm.slice(32));
  const envelope = concat(Uint8Array.of(ENVELOPE_VERSION), ephPub, session.seal(plain));
  return { session, envelope };
}

/** Pulls whole length-prefixed frames off the front of buf. */
export function splitFrames(buf: Uint8Array): { frames: Uint8Array[]; rest: Uint8Array } {
  const frames: Uint8Array[] = [];
  let off = 0;
  while (buf.length - off >= 4) {
    const n = new DataView(buf.buffer, buf.byteOffset + off, 4).getUint32(0);
    if (buf.length - off < 4 + n) break;
    frames.push(buf.subarray(off + 4, off + 4 + n));
    off += 4 + n;
  }
  return { frames, rest: buf.subarray(off) };
}

// ─── fetch ────────────────────────────────────────────────────────────────

export interface SealedTarget {
  relayServer: string; // e.g. https://relay.example.com
  ghostId: string;
  clientToken: string;
  podKey: string; // the Pod's public key, base64url, pinned at pairing
}

type HeaderInit = Record<string, string> | [string, string][] | Headers | undefined;

function headerRecord(h: HeaderInit): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const add = (k: string, v: string) => (out[k] ??= []).push(v);
  if (!h) return out;
  if (Array.isArray(h)) h.forEach(([k, v]) => add(k, v));
  else if (typeof (h as Headers).forEach === "function" && !(h instanceof Object && Object.getPrototypeOf(h) === Object.prototype)) (h as Headers).forEach((v, k) => add(k, v));
  else Object.entries(h as Record<string, string>).forEach(([k, v]) => add(k, v));
  return out;
}

function bodyBase64(body: unknown): string | undefined {
  if (body == null) return undefined;
  let bytes: Uint8Array;
  if (typeof body === "string") bytes = new TextEncoder().encode(body);
  else if (body instanceof Uint8Array) bytes = body;
  else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
  else throw new Error("This kind of request can't be sent through the relay yet.");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const NO_BODY = new Set([101, 204, 205, 304]);

/**
 * A drop-in for fetch that goes through the relay sealed. The returned Response
 * streams: its body arrives as the Pod produces it. If the stream ends without
 * its sealed end marker, reading it fails rather than quietly returning less
 * than was sent.
 */
export async function sealedFetch(target: SealedTarget, url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url);
  const headers = headerRecord(init.headers as HeaderInit);
  for (const k of Object.keys(headers)) {
    const l = k.toLowerCase();
    if (l === "x-ghost-client-id" || l === "x-ghost-client-token") delete headers[k];
  }
  const request = {
    ts: Date.now(),
    method: (init.method ?? "GET").toUpperCase(),
    path: u.pathname,
    ...(u.search ? { query: u.search.slice(1) } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(init.body != null ? { body: bodyBase64(init.body) } : {}),
    token: target.clientToken,
  };
  const { session, envelope } = sealRequest(b64urlToBytes(target.podKey), new TextEncoder().encode(JSON.stringify(request)));

  const res = await fetch(`${target.relayServer.replace(/\/+$/, "")}/v1/sealed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Ghost-Client-Id": target.ghostId,
      "X-Ghost-Client-Token": target.clientToken,
    },
    body: envelope as unknown as BodyInit,
    signal: init.signal,
  });
  // The relay's own answers (device offline, bad token, slow down) pass through as they are.
  if (res.status !== 200) return res;

  const reader = res.body?.getReader();
  if (!reader) return buffered(session, new Uint8Array(await res.arrayBuffer()));

  let pending: Uint8Array = new Uint8Array(0);
  let head: { status: number; headers?: Record<string, string[]> } | null = null;
  let ended = false;
  const queue: Uint8Array[] = [];

  /** Reads until something the caller can use arrives: the head, a chunk, or the end. */
  const advance = async (): Promise<"more" | "done"> => {
    for (;;) {
      if (queue.length || ended) return ended && !queue.length ? "done" : "more";
      const { done, value } = await reader.read();
      if (done) {
        if (!ended || pending.length) throw new Error("The reply was cut short.");
        return "done";
      }
      const split = splitFrames(concat(pending, value));
      pending = split.rest;
      for (const f of split.frames) {
        const { kind, content } = session.openMessage(f);
        if (kind === MSG_HEAD) head = JSON.parse(new TextDecoder().decode(content));
        else if (kind === MSG_DATA) queue.push(content);
        else if (kind === MSG_END) ended = true;
        else if (kind === MSG_ERR) throw new Error(`Ghost couldn't answer: ${new TextDecoder().decode(content)}`);
      }
      if (head && (queue.length || ended)) return queue.length ? "more" : "done";
    }
  };

  while (!head) {
    const { done, value } = await reader.read();
    if (done) throw new Error("The reply was cut short.");
    const split = splitFrames(concat(pending, value));
    pending = split.rest;
    for (const f of split.frames) {
      const { kind, content } = session.openMessage(f);
      if (kind === MSG_HEAD) head = JSON.parse(new TextDecoder().decode(content));
      else if (kind === MSG_DATA) queue.push(content);
      else if (kind === MSG_END) ended = true;
      else if (kind === MSG_ERR) throw new Error(`Ghost couldn't answer: ${new TextDecoder().decode(content)}`);
    }
  }
  const h = head as { status: number; headers?: Record<string, string[]> };
  const outHeaders = new Headers();
  for (const [k, vs] of Object.entries(h.headers ?? {})) vs.forEach((v) => outHeaders.append(k, v));

  if (NO_BODY.has(h.status)) {
    reader.cancel().catch(() => {});
    return new Response(null, { status: h.status, headers: outHeaders });
  }
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!queue.length && !ended) await advance();
        if (queue.length) return controller.enqueue(queue.shift()!);
        if (ended) {
          if (pending.length) throw new Error("The reply was cut short.");
          controller.close();
        }
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });
  return new Response(stream, { status: h.status, headers: outHeaders });
}

function buffered(session: Session, all: Uint8Array): Response {
  const { frames, rest } = splitFrames(all);
  let head: { status: number; headers?: Record<string, string[]> } | null = null;
  const chunks: Uint8Array[] = [];
  let ended = false;
  for (const f of frames) {
    const { kind, content } = session.openMessage(f);
    if (kind === MSG_HEAD) head = JSON.parse(new TextDecoder().decode(content));
    else if (kind === MSG_DATA) chunks.push(content);
    else if (kind === MSG_END) ended = true;
    else if (kind === MSG_ERR) throw new Error(`Ghost couldn't answer: ${new TextDecoder().decode(content)}`);
  }
  if (!head || !ended || rest.length) throw new Error("The reply was cut short.");
  const h = new Headers();
  for (const [k, vs] of Object.entries((head as { headers?: Record<string, string[]> }).headers ?? {})) vs.forEach((v) => h.append(k, v));
  const status = (head as { status: number }).status;
  return new Response(NO_BODY.has(status) ? null : (concat(...chunks) as unknown as BodyInit), { status, headers: h });
}
