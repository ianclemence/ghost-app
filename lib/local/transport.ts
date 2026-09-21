// Transport abstraction: chat is not "HTTP to Pi". LOCAL runs the React
// Native → native-runtime path; POD runs Ghost Protocol → Pi API; CLOUD runs
// through the Pod gateway (keys stay on the appliance, never on the phone).
import { parsePodSSELine, progressEvent, type GhostEvent } from "./ghostEvents";
import { ReasoningStreamFilter } from "./reasoning";
import type { GenerateRequest } from "./runtime";
import { mobileLocalRuntime } from "./localRuntime";
import { modelManager } from "./modelManager";
import type { ModelManifest } from "./registry";

export type TransportKind = "local" | "pod" | "cloud";
export type ExecutionTarget = "phone" | "pod" | "cloud";

export interface TransportHandlers {
  onEvent(e: GhostEvent): void;
}

export interface PodTransportConfig {
  baseUrl: string;
  headers: Record<string, string>;
  session: string;
}

export class GhostTransport {
  constructor(private pod: PodTransportConfig | null) {}

  setPod(cfg: PodTransportConfig | null) {
    this.pod = cfg;
  }

  get podAvailable(): boolean {
    return this.pod !== null;
  }

  // streamLocal executes a fully offline phone-local turn.
  async streamLocal(manifests: ModelManifest[], req: Omit<GenerateRequest, "model">, h: TransportHandlers, signal?: AbortSignal): Promise<void> {
    const active = await modelManager.activeModel(manifests);
    if (!active) throw new Error("No local model active. Download one first.");
    const uri = modelManager.artifactUri(active);
    if (!uri) throw new Error("Active model artifact missing. Reinstall it.");
    await mobileLocalRuntime.ensureLoaded(uri);
    h.onEvent(progressEvent("Ghost · Local"));
    let acc = "";
    const full = await mobileLocalRuntime.stream(
      { ...req, model: { id: active.id, version: active.version, runtime: "mobile-local", locality: "phone" } },
      (tok) => {
        acc += tok;
        h.onEvent({ kind: "assistant_message", text: acc });
      },
      signal,
    );
    h.onEvent({ kind: "done", text: full.content });
  }

  // streamPod executes via the existing Pod SSE chat API (unchanged wire).
  async streamPod(message: string, h: TransportHandlers, signal?: AbortSignal): Promise<void> {
    if (!this.pod) throw new Error("pod not connected");
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(`${this.pod.baseUrl}/v1/chat`, {
        method: "POST",
        headers: { ...this.pod.headers, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ session: this.pod.session, message }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`pod chat failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // Defense-in-depth: if a Pod (older build) streams inline reasoning,
      // strip it before it reaches the UI. Newer Pods strip it at source.
      const filter = new ReasoningStreamFilter();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const ev = parsePodSSELine(line);
          if (!ev) continue;
          if (ev.kind === "assistant_message") {
            const visible = filter.write(ev.text ?? "");
            if (visible) h.onEvent({ ...ev, text: visible });
          } else {
            h.onEvent(ev);
          }
        }
      }
      const tail = filter.flush();
      if (tail) h.onEvent({ kind: "assistant_message", text: tail });
      h.onEvent({ kind: "done" });
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
