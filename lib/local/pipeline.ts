// Travel-cache pipeline. The phone ANSWERS (local model) and COLLECTS (one
// deterministic remember + chat outbox). It does not act: no model-invoked
// tools, no routines, no hardware. The Pod is the only brain for those.
//
// Flow: reflex → bounded context → local inference (tools: none) →
// deterministic remember capture → done. Pod/cloud turns stream Pod SSE
// unchanged (keys stay on the appliance).
import { classifyEffort, plan, type Availability, type Privacy } from "./planner";
import { extractRememberText, queueRememberFact, recentRememberedFacts } from "./toolsLocal";
import { assistantMessage, progressEvent, type GhostEvent, type RoutingTarget } from "./ghostEvents";
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

// buildContext bounds what enters the model: current message + recent history.
// Never dumps whole memory stores.
export function buildContext(message: string, history: ChatMessage[], maxTurns = 10): ChatMessage[] {
  const recent = history.slice(-maxTurns * 2);
  return [...recent, { role: "user", content: message }];
}

export function routingLabel(target: RoutingTarget, podReachable: boolean): string {
  if (target === "phone") {
    return podReachable
      ? "Answering on this phone · Pod reachable, will sync"
      : "Answering on this phone · will sync when Pod is back";
  }
  if (target === "cloud") return "Answered via Pod cloud · keys stayed on Pod";
  return "Answered by home Pod";
}

export async function runLocalPipeline(input: PipelineInput, h: PipelineHandlers): Promise<void> {
  const effort = classifyEffort(input.message);
  const avail: Availability = {
    phone: true,
    pod: input.transport.podAvailable,
    cloud: input.transport.podAvailable && input.cloudAllowed,
    phoneModel: true, // refined below
    podModel: input.podModelKnown,
    cloudModel: input.transport.podAvailable && input.cloudAllowed,
    needsHardware: input.needsHardware,
  };
  // Phone model presence is authoritative locally.
  const { modelManager } = await import("./modelManager");
  const active = await modelManager.activeModel(input.manifests);
  avail.phoneModel = active !== null;

  const decision = plan({ effort, privacy: input.privacy, avail, podPreferred: input.podPreferred });
  const target = decision.target as RoutingTarget;
  h.onEvent(progressEvent(routingLabel(target, input.transport.podAvailable), { target, reason: decision.reason, willSync: target === "phone" }));

  if (target !== "phone") {
    // Pod/cloud path: same UX, Pod gateway executes (keys stay on appliance).
    await input.transport.streamPod(input.message, { onEvent: (e) => h.onEvent(e) }, input.signal);
    return;
  }

  // Phone-local path: answer only. No tool schemas are offered to the small
  // model — past JSON tool-call parsing hallucinated; collection below is
  // deterministic and never model-invoked.
  const quick = reflexAnswer(input.message);
  if (quick) {
    h.onEvent(assistantMessage(quick));
    h.onEvent({ kind: "done", text: quick, data: { target: "phone" as RoutingTarget } });
    return;
  }
  const messages = buildContext(input.message, input.history);
  // Deterministic recall: inject collected facts as a system note so the
  // small model answers from the notebook without any tool-call round-trip.
  try {
    const facts = await recentRememberedFacts(5);
    if (facts.length > 0) {
      messages.unshift({
        role: "system",
        content: `Saved on this phone (syncs to Pod when reachable):\n${facts.map((f) => `- ${f}`).join("\n")}`,
      });
    }
  } catch { /* recall never breaks answers */ }
  let acc = "";
  await input.transport.streamLocal(
    input.manifests,
    { messages, tools: [] },
    {
      onEvent: (e) => {
        if (e.kind === "assistant_message") acc = e.text ?? acc;
        h.onEvent(e);
      },
    },
    input.signal,
  );
  // Deterministic collector: "remember ..." queues a sync op + outbox-style
  // durability without trusting model output.
  const remember = extractRememberText(input.message);
  if (remember) {
    try {
      await queueRememberFact(remember);
      h.onEvent({ kind: "tool_status", tool: "local_memory.write", text: "Saved on this phone · will sync to Pod" });
    } catch (e) {
      h.onEvent({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      return;
    }
  }
  h.onEvent({ kind: "done", text: acc, data: { target: "phone" as RoutingTarget, willSync: true } });
}
