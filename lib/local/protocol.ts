// Ghost Agent Protocol — versioned envelopes shared by phone and Pod.
// Mirrors pkg/ghostproto (proto_version 1). Transport-independent.
export const GHOST_PROTO_VERSION = 1;
export const GHOST_PROTO_MIN_SUPPORTED = 1;

export type GhostProtoType =
  | "authenticate" | "pair" | "capabilities" | "session" | "task"
  | "inference" | "tool_invoke" | "tool_result" | "memory_op" | "event"
  | "progress" | "clarification" | "steering" | "cancel" | "sync" | "health";

export interface GhostEnvelope {
  proto_version: number;
  type: GhostProtoType;
  message_id: string;
  correlation_id?: string;
  device_id?: string;
  install_id?: string;
  session_id?: string;
  task_id?: string;
  tool_call_id?: string;
  event_id?: string;
  sync_op_id?: string;
  idempotency_key?: string;
  nonce?: string;
  timestamp_unix?: number;
  payload?: Record<string, unknown>;
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function newEnvelope(type: GhostProtoType, fields: Partial<GhostEnvelope> = {}): GhostEnvelope {
  return {
    proto_version: GHOST_PROTO_VERSION,
    type,
    message_id: randomId(),
    timestamp_unix: Math.floor(Date.now() / 1000),
    nonce: randomId(),
    ...fields,
  };
}

export function validateEnvelope(e: GhostEnvelope): string | null {
  if (e.proto_version < GHOST_PROTO_MIN_SUPPORTED || e.proto_version > GHOST_PROTO_VERSION) {
    return "protocol version mismatch";
  }
  if (!e.type || !e.message_id) return "type and message_id required";
  return null;
}

// In-memory nonce window for replay protection on received messages.
export class NonceWindow {
  private seen = new Map<string, number>();
  constructor(private windowSec = 300) {}
  check(nonce: string | undefined, nowSec = Math.floor(Date.now() / 1000)): boolean {
    if (!nonce) return true;
    if (this.seen.has(nonce)) return false;
    const cutoff = nowSec - this.windowSec;
    for (const [k, ts] of this.seen) if (ts < cutoff) this.seen.delete(k);
    this.seen.set(nonce, nowSec);
    return true;
  }
}
