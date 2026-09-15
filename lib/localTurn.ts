// runLocalTurn: execution-planned send. Decides phone/pod/cloud via the
// shared planner, then drives EITHER the offline phone-local pipeline OR the
// original Pod SSE path with its full semantics (outcomes, clarification,
// lifecycle, tool phases) — one common Ghost event model in the UI.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authHeaders, baseURL, sendMessage, type GhostConfig } from "./ghostApi";
import { GhostTransport } from "./local/transport";
import { runLocalPipeline } from "./local/pipeline";
import { modelManager } from "./local/modelManager";
import { fetchCatalog, type ModelManifest } from "./local/registry";
import { classifyEffort, plan, type Privacy } from "./local/planner";
import { fetchPodCapabilities } from "./podClient";

const PRIVACY_KEY = "ghost:privacy";
const CATALOG_CACHE_KEY = "ghost:models:catalog";

type SendArgs = Parameters<typeof sendMessage>[1];

const HARDWARE_HINT = /\b(lamp|light|gpio|esp32|thermostat|sensor|lock\b|smart plug|switch\b|heater|fan\b|garage|sprinkler)\b/i;

async function loadCatalog(cfg: GhostConfig): Promise<ModelManifest[]> {
  try {
    const cat = await fetchCatalog(baseURL(cfg), authHeaders(cfg));
    await AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(cat.models));
    return cat.models;
  } catch {
    // Offline-first: a cached catalog still allows phone-local turns.
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    if (raw) return JSON.parse(raw) as ModelManifest[];
    throw new Error("Can't reach Ghost and no cached model catalog");
  }
}

export async function runLocalTurn(
  cfg: GhostConfig,
  content: string,
  history: { role: string; content: string }[],
  args: SendArgs & { signal?: AbortSignal },
): Promise<void> {
  const privacy = ((await AsyncStorage.getItem(PRIVACY_KEY)) ?? "balanced") as Privacy;
  const manifests = await loadCatalog(cfg);
  const transport = new GhostTransport({
    baseUrl: baseURL(cfg),
    headers: authHeaders(cfg),
    session: "mobile:default",
  });
  let podModelKnown = false;
  try {
    const caps = await fetchPodCapabilities(cfg);
    podModelKnown = (caps.tools?.length ?? 0) > 0;
  } catch {
    podModelKnown = false; // Pod unreachable: planner falls back to phone-local
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

  if (decision.target !== "phone") {
    // Pod/cloud path: byte-identical Pod semantics (keys stay on appliance).
    await sendMessage(cfg, args);
    return;
  }

  // Phone-local path through the shared Ghost pipeline.
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
            break;
          case "progress_event":
            if (e.text) args.onToolStatus?.("ghost", e.text);
            break;
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

// runPodTurn preserves the exact pre-existing Pod SSE behavior for callers
// that explicitly want the Pod path.
export async function runPodTurn(
  cfg: GhostConfig,
  args: Parameters<typeof sendMessage>[1],
): Promise<void> {
  await sendMessage(cfg, args);
}
