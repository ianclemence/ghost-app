// Phone-local collector: the phone is a travel cache, not a second Ghost.
//
// Travel-cache contract:
// - Offline the phone may ANSWER (local model) and COLLECT (one deterministic
//   memory write + the existing chat outbox). It must not execute actions.
// - Routines, hardware, files, notifications, and durable memory authority
//   live on the Pod. Pod-only tools are never defined here; the planner routes
//   those to the Pod via its capability advertisement.
//
// Why only local_memory.write: model-invoked JSON tool calls on a 0.6B model
// hallucinate. The single write below is invoked DETERMINISTICALLY by the
// pipeline (remember-intent match), never by parsing model output.
import type { SyncOp } from "./memsync";

export interface LocalToolDef {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  sensitive?: boolean;
}

export const PHONE_LOCAL_TOOLS: LocalToolDef[] = [
  { name: "local_memory.write", description: "Store a durable fact on this phone (syncs to Pod later)", parameters: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] } },
];

const memCache = new Map<string, string>();

// REMEMBER_RE is the deterministic collector trigger. Conservative on purpose:
// "remember X" / "don't forget X" / "my X is Y". Everything else is chat.
export const REMEMBER_RE = /^\s*(please\s+)?(remember|don't forget|dont forget)\b[:\s]+(.{3,500})\s*$/i;

export function extractRememberText(message: string): string | null {
  const m = REMEMBER_RE.exec(message.trim());
  if (!m) return null;
  const text = (m[3] ?? "").trim();
  return text.length >= 3 ? text : null;
}

function newOpId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

async function queueSyncOp(op: SyncOp): Promise<void> {
  try {
    const { openSyncDb, getCursor } = await import("./memsync");
    const db = await openSyncDb();
    await db.runAsync(
      "INSERT OR IGNORE INTO sync_ops(op_id,origin_device,entity_id,entity_kind,entity_version,scope,type,payload,origin_clock) VALUES(?,?,?,?,?,?,?,?,?)",
      op.op_id, op.origin_device, op.entity_id, op.entity_kind, op.entity_version, op.scope, op.type, op.payload ?? null, op.origin_clock,
    );
    void getCursor;
  } catch {
    // SQLite unavailable (unit tests) — memCache above still holds the fact
    // for this session; syncNow() picks up the DB path when available.
  }
}

// queueRememberFact is the ONLY phone-local write path. Deterministic:
// caller passes user text, we store ephemerally + enqueue a shared_durable op
// that syncNow() pushes to POST /v1/sync/ops when the Pod is reachable.
export async function queueRememberFact(text: string, deviceId = "phone"): Promise<{ key: string }> {
  const clean = text.trim().slice(0, 500);
  const key = `fact-${Date.now().toString(36)}`;
  memCache.set(key, clean);
  const now = Date.now();
  await queueSyncOp({
    op_id: newOpId(),
    origin_device: deviceId,
    entity_id: key,
    entity_kind: "fact",
    entity_version: 1,
    scope: "shared_durable",
    type: "upsert",
    payload: JSON.stringify({ text: clean }),
    origin_clock: now,
  });
  return { key };
}

export function readRememberedFact(key: string): string | null {
  return memCache.get(key) ?? null;
}

// recentRememberedFacts is the deterministic recall path. No model tool call:
// the pipeline injects these into context so offline Ghost can answer from
// its own notebook ("what's my bike size?"). memCache covers this session
// (and unit tests where SQLite is unavailable); the sync DB covers restarts.
// Newest first, deduped, bounded.
export async function recentRememberedFacts(limit = 5): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    const clean = t.trim().slice(0, 200);
    if (clean.length >= 2 && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  };
  // Session cache first (insertion order = oldest first → reverse).
  for (const v of [...memCache.values()].reverse()) {
    push(v);
    if (out.length >= limit) return out;
  }
  try {
    const { openSyncDb } = await import("./memsync");
    const db = await openSyncDb();
    const rows = await db.getAllAsync<{ payload: string | null }>(
      "SELECT payload FROM sync_ops WHERE entity_kind='fact' AND type='upsert' ORDER BY origin_clock DESC LIMIT ?",
      Math.max(limit * 2, limit),
    );
    for (const r of rows ?? []) {
      if (out.length >= limit) break;
      if (!r.payload) continue;
      try {
        const obj = JSON.parse(r.payload) as { text?: string };
        if (obj.text) push(obj.text);
      } catch {
        push(r.payload);
      }
    }
  } catch {
    // SQLite unavailable — session cache above is the fallback.
  }
  return out.slice(0, limit);
}

export async function executeLocalTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === "local_memory.write") {
    const value = String(args.value ?? args.text ?? "");
    if (!value) throw new Error("local_memory.write requires value");
    const key = String(args.key ?? "");
    if (key) {
      memCache.set(key, value);
      return { ok: true, key };
    }
    return { ok: true, ...(await queueRememberFact(value)) };
  }
  throw new Error(`tool ${name} has no phone executor (travel cache: collect-only)`);
}

export function phoneAdvertisement(deviceId: string): { device_id: string; tools: { name: string; executors: string[] }[] } {
  return {
    device_id: deviceId,
    tools: PHONE_LOCAL_TOOLS.map((t) => ({ name: t.name, executors: ["phone"] })),
  };
}

export function toToolSchemas(): { name: string; description: string; parameters?: Record<string, unknown> }[] {
  return PHONE_LOCAL_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
}
