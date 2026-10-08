import { describe, expect, test } from "bun:test";
import { useGhostStore } from "./store";

const reset = () => useGhostStore.setState({ messages: [], streamBuffer: "", isStreaming: false, queued: [], seenMessageIds: new Set() });

describe("streaming into the store", () => {
  test("words keep going to the reply being written when something is sent after it", () => {
    reset();
    const s = useGhostStore.getState();
    s.appendMessage({ id: "temp-u1", role: "user", content: "go", timestamp: 1, status: "sending" });
    s.appendMessage({ id: "temp-a-1", role: "assistant", content: "", timestamp: 2, status: "streaming" });
    s.appendStream("Hello");
    s.appendMessage({ id: "temp-u2", role: "user", content: "also this", timestamp: 3, status: "sending" });
    s.appendStream(" world");
    const reply = useGhostStore.getState().messages.find((m) => m.id === "temp-a-1");
    expect(reply?.content).toBe("Hello world");
  });

  test("a row keeps its key when its id changes on commit", () => {
    reset();
    const s = useGhostStore.getState();
    s.appendMessage({ id: "temp-a-1", role: "assistant", content: "done", timestamp: 2, status: "streaming" });
    s.commitStream();
    const m = useGhostStore.getState().messages[0];
    expect(m.id).not.toBe("temp-a-1");
    expect(m.key).toBe("temp-a-1");
  });

  test("a reply with no words is dropped, unless it has a record of what Ghost tried", () => {
    reset();
    const s = useGhostStore.getState();
    s.appendMessage({ id: "temp-a-1", role: "assistant", content: "", timestamp: 2, status: "streaming" });
    s.appendMessage({ id: "temp-a-2", role: "assistant", content: "", timestamp: 9000, status: "streaming", steps: [{ id: "c", tool: "exec", kind: "command", state: "failed", startedAt: 1 }] });
    s.commitStream();
    expect(useGhostStore.getState().messages).toHaveLength(1);
    expect(useGhostStore.getState().messages[0].steps).toHaveLength(1);
  });
});
