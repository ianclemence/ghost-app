import { describe, expect, test } from "bun:test";
import {
  clickMessages,
  namedKeyMessages,
  parseFrame,
  scrollMessage,
  screencastSocketURL,
  tapToPage,
  typeMessages,
} from "./browserInput";

describe("steering the browser from the phone", () => {
  test("a tap on the picture lands on the matching point of the page", () => {
    // The page is 1280x720 and is drawn 390x219 wide on the phone.
    expect(tapToPage({ x: 195, y: 110 }, { width: 390, height: 219 }, { width: 1280, height: 720 })).toEqual({ x: 640, y: 362 });
    expect(tapToPage({ x: 0, y: 0 }, { width: 390, height: 219 }, { width: 1280, height: 720 })).toEqual({ x: 0, y: 0 });
  });

  test("a tap on the very edge is still on the page, and a bad size is safe", () => {
    expect(tapToPage({ x: 999, y: 999 }, { width: 390, height: 219 }, { width: 1280, height: 720 })).toEqual({ x: 1279, y: 719 });
    expect(tapToPage({ x: -5, y: -5 }, { width: 390, height: 219 }, { width: 1280, height: 720 })).toEqual({ x: 0, y: 0 });
    expect(tapToPage({ x: 10, y: 10 }, { width: 0, height: 0 }, { width: 1280, height: 720 })).toEqual({ x: 0, y: 0 });
  });

  test("a click is move, press, release at the same point", () => {
    expect(clickMessages(40, 50).map((m) => m.eventType)).toEqual(["mouseMoved", "mousePressed", "mouseReleased"]);
    expect(clickMessages(40, 50).every((m) => m.x === 40 && m.y === 50)).toBe(true);
    expect(clickMessages(1, 2)[1]).toMatchObject({ type: "input_mouse", button: "left", clickCount: 1 });
  });

  test("typing is a press and a release per character, and a newline is Enter", () => {
    const m = typeMessages("hi\n");
    expect(m.map((x) => `${x.eventType}:${x.key}`)).toEqual(["keyDown:h", "keyUp:h", "keyDown:i", "keyUp:i", "keyDown:Enter", "keyUp:Enter"]);
    expect(m[0]).toMatchObject({ type: "input_keyboard", text: "h" });
  });

  test("typing handles non-Latin text and is bounded", () => {
    expect(typeMessages("好").map((x) => x.key)).toEqual(["好", "好"]);
    expect(typeMessages("x".repeat(2000)).length).toBe(1000);
  });

  test("named keys and scrolling", () => {
    expect(namedKeyMessages("Backspace").map((x) => x.eventType)).toEqual(["keyDown", "keyUp"]);
    expect(namedKeyMessages("Enter")[0]).toMatchObject({ key: "Enter", text: "\r" });
    expect(scrollMessage(10, 20, 300)).toMatchObject({ eventType: "mouseWheel", deltaY: 300 });
  });

  test("a frame is read, anything else is ignored", () => {
    const raw = JSON.stringify({ type: "frame", seq: 7, data: "AAAA", metadata: { deviceWidth: 1280, deviceHeight: 720 } });
    expect(parseFrame(raw)).toEqual({ seq: 7, data: "AAAA", device: { width: 1280, height: 720 } });
    expect(parseFrame(JSON.stringify({ type: "status" }))).toBeNull();
    expect(parseFrame(JSON.stringify({ type: "frame", seq: 1, data: "x" }))).toBeNull();
    expect(parseFrame("not json")).toBeNull();
  });

  test("the socket address asks for one frame at a time", () => {
    expect(screencastSocketURL("ws://pod:8766", "/v1/browser/screencast?token=abc")).toBe("ws://pod:8766/v1/browser/screencast?token=abc&pacing=ack&maxFps=8");
  });
});
