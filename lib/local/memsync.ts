// Operation-based memory sync (no whole-database copies, no last-write-wins).
// Syncs against the Pod's /v1/sync/ops; local persistence via expo-sqlite.
import * as SQLite from "expo-sqlite";

export type Scope = "phone_local" | "pod_owned" | "phone_owned" | "shared_durable" | "ephemeral";
export type OpType = "upsert" | "delete";

export interface SyncOp {
  op_id: string;
  origin_device: string;
  entity_id: string;
  entity_kind: string;
  entity_version: number;
  scope: Scope;
  type: OpType;
  payload?: string;
  origin_clock: number;
}

export function validateOp(o: SyncOp): string | null {
  if (!o.op_id || !o.origin_device || !o.entity_id || !o.entity_kind) return "op identity required";
  if (!(o.entity_version > 0) || !(o.origin_clock > 0)) return "versions must be positive";
  if (o.type !== "upsert" && o.type !== "delete") return "unknown op type";
  return null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_ops (
  op_id TEXT PRIMARY KEY,
  origin_device TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_version INTEGER NOT NULL,
  scope TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  origin_clock INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_ops(entity_kind, entity_id);
CREATE TABLE IF NOT EXISTS sync_meta (k TEXT PRIMARY KEY, v TEXT);
`;

let db: SQLite.SQLiteDatabase | null = null;

export async function openSyncDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("ghost-sync.db");
    await db.execAsync(SCHEMA);
  }
  return db;
}

export async function getCursor(): Promise<number> {
  const d = await openSyncDb();
  const row = await d.getFirstAsync<{ v: string }>("SELECT v FROM sync_meta WHERE k='cursor'");
  return row ? Number(row.v) : 0;
}

export async function setCursor(n: number): Promise<void> {
  const d = await openSyncDb();
  await d.runAsync("INSERT OR REPLACE INTO sync_meta(k,v) VALUES('cursor',?)", String(n));
}

// apply ingests one op idempotently; returns true when visible state changed.
export async function applyOp(o: SyncOp): Promise<boolean> {
  const err = validateOp(o);
  if (err) throw new Error(err);
  if (o.scope === "phone_local" || o.scope === "ephemeral") return false; // never synced
  const d = await openSyncDb();
  const dup = await d.getFirstAsync("SELECT op_id FROM sync_ops WHERE op_id=?", o.op_id);
  if (dup) return false;
  const cur = await d.getFirstAsync<{ entity_version: number; type: string }>(
    "SELECT entity_version, type FROM sync_ops WHERE entity_kind=? AND entity_id=? ORDER BY entity_version DESC LIMIT 1",
    o.entity_kind, o.entity_id,
  );
  if (cur && o.entity_version < cur.entity_version) return false; // stale
  if (cur && o.entity_version === cur.entity_version && !(o.type === "delete" && cur.type !== "delete")) return false;
  await d.runAsync(
    "INSERT INTO sync_ops(op_id,origin_device,entity_id,entity_kind,entity_version,scope,type,payload,origin_clock) VALUES(?,?,?,?,?,?,?,?,?)",
    o.op_id, o.origin_device, o.entity_id, o.entity_kind, o.entity_version, o.scope, o.type, o.payload ?? null, o.origin_clock,
  );
  const c = await getCursor();
  if (o.origin_clock > c) await setCursor(o.origin_clock);
  return true;
}

export async function pendingOps(sinceClock: number): Promise<SyncOp[]> {
  const d = await openSyncDb();
  return d.getAllAsync<SyncOp>("SELECT * FROM sync_ops WHERE origin_clock > ? ORDER BY origin_clock, op_id", sinceClock);
}

export async function pushOps(podBaseUrl: string, headers: Record<string, string>, ops: SyncOp[]): Promise<number> {
  const shared = ops.filter((o) => o.scope === "shared_durable" || o.scope === "pod_owned" || o.scope === "phone_owned");
  if (shared.length === 0) return 0;
  const res = await fetch(`${podBaseUrl}/v1/sync/ops`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ops: shared }),
  });
  if (!res.ok) throw new Error(`sync push failed (${res.status})`);
  const json = (await res.json()) as { applied: number };
  return json.applied ?? 0;
}

export async function pullOps(podBaseUrl: string, headers: Record<string, string>): Promise<number> {
  const cursor = await getCursor();
  const res = await fetch(`${podBaseUrl}/v1/sync/ops?since=${cursor}`, { headers });
  if (!res.ok) throw new Error(`sync pull failed (${res.status})`);
  const json = (await res.json()) as { ops: SyncOp[] };
  let applied = 0;
  for (const o of json.ops ?? []) {
    if (await applyOp(o)) applied++;
    else {
      // Advance cursor past seen ops even when they don't change state.
      const c = await getCursor();
      if (o.origin_clock > c) await setCursor(o.origin_clock);
    }
  }
  return applied;
}
