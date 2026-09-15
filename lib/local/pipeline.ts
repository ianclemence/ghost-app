// Local-Ghost execution pipeline. Same Ghost semantics as the Pod:
// user → reflex → context planner → effort → memory → execution planner →
// runtime → tool execution → memory update → response. No "mobile special
// chat pipeline": stages are shared concepts with runtime-aware storage.
import { classifyEffort, plan, type Availability, type Privacy } from "./planner";
import { executeLocalTool, toToolSchemas } from "./toolsLocal";
import { assistantMessage, clarifyRequest, progressEvent, type GhostEvent } from "./ghostEvents";
import type { ChatMessage } from "./runtime";
import { GhostTransport } from "./transport";
import type { ModelManifest } from "./registry";

export interface PipelineInput {
  message: string;
  history: ChatMessage[];
  privacy: Privacy;
  podPreferred: boolean;
  manifests: ModelManifest[];
  transport: GhostTransport;
  podModelKnown: boolean;
  cloudAllowed: boolean;
  needsHardware?: boolean;
  signal?: AbortSignal;
}

export interface PipelineHandlers {
  onEvent(e: GhostEvent): void;
}

// reflex answers trivially without model inference (local, synchronous).
function reflexAnswer(msg: string): string | null {
  const m = msg.trim().toLowerCase();
  if (/^(hi|hello|hey|yo)\b/.test(m) && m.length < 24) return "Hey — I'm here, running on this phone.";
  if (/^(thanks|thank you|thx)\b/.test(m)) return "Anytime.";
  return null;
}

// buildContext bounds what enters the model: current message + recent history
// + active task handled by caller. Never dumps whole memory stores.
export function buildContext(message: string, history: ChatMessage[], maxTurns = 10): ChatMessage[] {
  const recent = history.slice(-maxTurns * 2);
  return [...recent, { role: "user", content: message }];
}

function parseToolCallJson(text: string): { tool: string; args: Record<string, unknown> } | null {
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try {
    const obj = JSON.parse(text.slice(i, j + 1)) as { tool?: string; args?: Record<string, unknown> };
    if (obj.tool) return { tool: obj.tool, args: obj.args ?? {} };
    return null;
  } catch {
    return null;
  }
}

const CLARIFY_RE = /\b(which|what kind|clarify|do you mean|need more)\b/i;

export async function runLocalPipeline(input: PipelineInput, h: PipelineHandlers): Promise<void> {
  const effort = classifyEffort(input.message);
  const avail: Availability = {
    phone: true,
    pod: input.transport.podAvailable,
    cloud: input.transport.podAvailable && input.cloudAllowed,
    phoneModel: (await input.transport.podAvailable) ? true : true, // refined below
    podModel: input.podModelKnown,
    cloudModel: input.transport.podAvailable && input.cloudAllowed,
    needsHardware: input.needsHardware,
  };
  // Phone model presence is authoritative locally.
  const { modelManager } = await import("./modelManager");
  const active = await modelManager.activeModel(input.manifests);
  avail.phoneModel = active !== null;

  const decision = plan({ effort, privacy: input.privacy, avail, podPreferred: input.podPreferred });
  h.onEvent(progressEvent(`Ghost · ${decision.target === "phone" ? "Local" : decision.target === "pod" ? "Home" : "Cloud"}`));

  if (decision.target !== "phone") {
    // Pod/cloud path: same UX, Pod gateway executes (keys stay on appliance).
    await input.transport.streamPod(input.message, { onEvent: (e) => h.onEvent(e) }, input.signal);
    return;
  }

  // Phone-local path.
  const quick = reflexAnswer(input.message);
  if (quick) {
    h.onEvent(assistantMessage(quick));
    h.onEvent({ kind: "done", text: quick });
    return;
  }
  const messages = buildContext(input.message, input.history);
  let acc = "";
  await input.transport.streamLocal(
    input.manifests,
    { messages, tools: toToolSchemas() },
    {
      onEvent: (e) => {
        if (e.kind === "assistant_message") acc = e.text ?? acc;
        h.onEvent(e);
      },
    },
    input.signal,
  );
  // Tool execution: model-requested local tools run on the phone.
  const call = parseToolCallJson(acc);
  if (call) {
    h.onEvent({ kind: "tool_status", tool: call.tool, text: "running on this phone" });
    try {
      const result = await executeLocalTool(call.tool, call.args);
      h.onEvent(assistantMessage(`Done: ${JSON.stringify(result)}`));
    } catch (e) {
      h.onEvent({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      return;
    }
  }
  // Clarification continues the same task regardless of runtime.
  if (CLARIFY_RE.test(acc) && acc.length < 400) {
    h.onEvent(clarifyRequest(acc));
    return;
  }
  h.onEvent({ kind: "done", text: acc });
}
