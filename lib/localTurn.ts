// runLocalTurn: execution-planned send. Travel-cache contract: the phone
// ANSWERS (local Mini) and COLLECTS (remember + outbox). The Pod is the only
// brain for routines, hardware, files, notifications, and durable memory.
//
// cfg is nullable: a phone with an active Mini is a useful offline Ghost and
// must answer with no Pod and no network. Pod/cloud turns use the original
// Pod SSE path with full semantics (keys stay on the appliance).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authHeaders, baseURL, sendMessage, type GhostConfig } from "./ghostApi";
import { GhostTransport } from "./local/transport";
import { runLocalPipeline } from "./local/pipeline";
import { modelManager } from "./local/modelManager";
import { loadCatalog } from "./local/catalog";
import { classifyEffort, plan, type Privacy } from "./local/planner";
import { fetchPodCapabilities } from "./podClient";
import { recordLocalMetric } from "./local/metrics";

const PRIVACY_KEY = "ghost:privacy";

type SendArgs = Parameters<typeof sendMessage>[1];

const HARDWARE_HINT = /\b(lamp|light|gpio|esp32|thermostat|sensor|lock\b|smart plug|switch\b|heater|fan\b|garage|sprinkler)\b/i;

export async function runLocalTurn(
  cfg: GhostConfig | null,
  content: string,
  history: { role: string; content: string }[],
  args: SendArgs,
): Promise<void> {
  const privacy = ((await AsyncStorage.getItem(PRIVACY_KEY)) ?? "balanced") as Privacy;
  const pod = cfg ? { baseUrl: baseURL(cfg), headers: authHeaders(cfg) } : null;
  const manifests = await loadCatalog(pod);
  const transport = new GhostTransport(
    cfg ? { baseUrl: baseURL(cfg), headers: authHeaders(cfg), session: "main" } : null,
  );

  let podModelKnown = false;
  if (cfg) {
    try {
      const caps = await fetchPodCapabilities(cfg);
      podModelKnown = (caps.tools?.length ?? 0) > 0;
    } catch {
      podModelKnown = false; // Pod unreachable: planner falls back to phone-local
    }
  }

  const active = await modelManager.activeModel(manifests).catch(() => null);
  const decision = plan({
    effort: classifyEffort(content),
    privacy,
    avail: {
      phone: true,
      pod: transport.podAvailable,
      cloud: transport.podAvailable && privacy === "cloud_capable",
      phoneModel: active !== null,
      podModel: podModelKnown,
      cloudModel: transport.podAvailable && privacy === "cloud_capable",
      needsHardware: HARDWARE_HINT.test(content),
    },
  });

  if (decision.target !== "phone" && cfg) {
    // Pod/cloud path: byte-identical Pod semantics (keys stay on appliance).
    // Honest routing: surface where this ran.
    args.onToolStatus?.("ghost", decision.target === "cloud" ? "Answered via Pod cloud · keys stayed on Pod" : "Answered by home Pod");
    await recordLocalMetric("pod_turns").catch(() => undefined);
    await sendMessage(cfg, args);
    return;
  }

  // Phone-local path through the travel-cache pipeline.
  await recordLocalMetric("phone_turns").catch(() => undefined);
  let last = "";
  await runLocalPipeline(
    {
      message: content,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      privacy,
      podPreferred: false,
      manifests,
      transport,
      podModelKnown,
      cloudAllowed: false,
      needsHardware: false,
      signal: args.signal,
    },
    {
      onEvent: (e) => {
        switch (e.kind) {
          case "assistant_message": {
            const text = e.text ?? "";
            if (text.length >= last.length && text.startsWith(last)) {
              args.onChunk(text.slice(last.length));
            } else if (text) {
              args.onChunk(text);
            }
            last = text;
            break;
          }
          case "tool_status":
            args.onToolStatus?.(e.tool ?? "tool", e.text ?? "working");
            if (e.tool === "local_memory.write") void recordLocalMetric("remember_captures").catch(() => undefined);
            break;
          case "progress_event": {
            const d = (e.data ?? {}) as { target?: string; reason?: string };
            const label = e.text ?? (d.target === "phone" ? "Answering on this phone · will sync when Pod is back" : "Answered by home Pod");
            args.onToolStatus?.("ghost", label);
            break;
          }
          case "clarify_request":
            args.onClarify?.({ questionId: `q-${Date.now()}`, question: e.text ?? "", choices: [], requestId: "" });
            break;
          case "done":
            args.onDone(last || e.text || "");
            break;
          case "error":
            args.onError({ kind: "provider", message: e.text ?? "Ghost couldn't generate a response.", retryable: true });
            break;
          case "cancelled":
            args.onDone(last);
            break;
        }
      },
    },
  );
}
