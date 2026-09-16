// Common Ghost event model: the UI consumes these regardless of whether
// inference ran on the phone, the Pod, or cloud. Local inference emits the
// same semantic events the Pod sends over SSE/WebSocket.
export type GhostEventKind =
  | "assistant_message" | "clarify_request" | "progress_event"
  | "tool_status" | "done" | "error" | "cancelled";

export interface GhostEvent {
  kind: GhostEventKind;
  text?: string;
  tool?: string;
  data?: unknown;
}

export function assistantMessage(text: string): GhostEvent {
  return { kind: "assistant_message", text };
}

export function clarifyRequest(question: string): GhostEvent {
  return { kind: "clarify_request", text: question };
}

export type RoutingTarget = "phone" | "pod" | "cloud";

export function progressEvent(text: string, data?: { target?: RoutingTarget; reason?: string; willSync?: boolean }): GhostEvent {
  return { kind: "progress_event", text, data };
}

// parsePodSSELine maps one Pod SSE data line onto the common model, reusing
// the existing wire vocabulary (text/raw/lifecycle/tool/clarify).
export function parsePodSSELine(line: string): GhostEvent | null {
  const t = line.trim();
  if (!t || t.startsWith(":") || t === "done" || t === "[DONE]") return null;
  const payload = t.startsWith("data:") ? t.slice(5).trim() : t;
  try {
    const obj = JSON.parse(payload) as { type?: string; text?: string; chunk?: string; question?: string; status?: string; tool?: string };
    switch (obj.type) {
      case "clarify": case "clarify_request":
        return clarifyRequest(obj.question ?? obj.text ?? "");
      case "tool": case "tool_status":
        return { kind: "tool_status", tool: obj.tool, text: obj.status ?? obj.text };
      case "lifecycle": case "progress":
        return progressEvent(obj.text ?? "");
      case "text": case "raw": case "chunk":
        return assistantMessage(obj.text ?? obj.chunk ?? "");
      default:
        if (obj.text) return assistantMessage(obj.text);
        return null;
    }
  } catch {
    return assistantMessage(payload);
  }
}
