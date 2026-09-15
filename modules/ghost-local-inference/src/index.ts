import type { EventSubscription } from "expo-modules-core";
import { NativeModule, requireNativeModule } from "expo-modules-core";

declare class GhostLocalInferenceNative extends NativeModule<{
  token: (e: { token: string }) => void;
}> {
  isAvailable(): Promise<boolean>;
  backendStatus(): Promise<{ linked: boolean; state: string; loadedModel: string | null; engine: string }>;
  loadModel(uri: string): Promise<void>;
  unloadModel(): Promise<void>;
  loadedModelUri(): Promise<string | null>;
  generate(prompt: string): Promise<string>;
  streamGenerate(prompt: string): Promise<string>;
  cancel(): Promise<void>;
  hashFile(uri: string): Promise<string>;
  deviceInfo(): Promise<Record<string, unknown>>;
  addListener(event: "token", cb: (e: { token: string }) => void): EventSubscription;
}

function load(): GhostLocalInferenceNative | null {
  try {
    return requireNativeModule<GhostLocalInferenceNative>("GhostLocalInference");
  } catch {
    return null;
  }
}

export const GhostLocalInference: GhostLocalInferenceNative | null = load();
export default GhostLocalInference;
