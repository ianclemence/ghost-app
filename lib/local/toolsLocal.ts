// Phone-local tools: definitions advertise executors; executors run here.
// Pod-only hardware tools are NOT defined here — the planner routes those to
// the Pod via its capability advertisement.
import * as Notifications from "expo-notifications";
import { File, Paths } from "expo-file-system";

export interface LocalToolDef {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  sensitive?: boolean;
}

export const PHONE_LOCAL_TOOLS: LocalToolDef[] = [
  { name: "local_memory.write", description: "Store a durable fact on this phone", parameters: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] } },
  { name: "local_memory.read", description: "Read a durable fact from this phone", parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
  { name: "notifications.schedule", description: "Schedule a local notification", parameters: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, seconds: { type: "number" } }, required: ["title", "body"] } },
  { name: "files.read", description: "Read a file from Ghost app-private storage", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
  { name: "files.write", description: "Write a file to Ghost app-private storage", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
  { name: "device.info", description: "Report phone capability facts (no identifiers)", parameters: { type: "object", properties: {} } },
];

const memCache = new Map<string, string>();

export async function executeLocalTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "local_memory.write": {
      memCache.set(String(args.key), String(args.value));
      return { ok: true };
    }
    case "local_memory.read": {
      const v = memCache.get(String(args.key));
      return { key: args.key, value: v ?? null };
    }
    case "notifications.schedule": {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: String(args.title ?? "Ghost"), body: String(args.body ?? "") },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Number(args.seconds ?? 5) },
      });
      return { ok: true, id };
    }
    case "files.read": {
      const rel = String(args.path ?? "");
      if (rel.includes("..")) throw new Error("path escapes app storage");
      const f = new File(Paths.document, "ghost-files", rel);
      if (!f.exists) throw new Error("file not found");
      return { path: rel, content: await f.text() };
    }
    case "files.write": {
      const rel = String(args.path ?? "");
      if (rel.includes("..")) throw new Error("path escapes app storage");
      const f = new File(Paths.document, "ghost-files", rel);
      const parent = f.parentDirectory;
      if (!parent.exists) parent.create({ intermediates: true, idempotent: true });
      if (!f.exists) f.create();
      f.write(String(args.content ?? ""));
      return { ok: true, path: rel };
    }
    case "device.info": {
      return { runtime: "mobile-local", tools: PHONE_LOCAL_TOOLS.map((t) => t.name) };
    }
    default:
      throw new Error(`tool ${name} has no phone executor`);
  }
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
