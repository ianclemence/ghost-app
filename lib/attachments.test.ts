import { describe, expect, test } from "bun:test";
import {
  attachmentProblem,
  base64Bytes,
  fileSize,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  photoName,
  toMediaItems,
} from "./attachments";

describe("attachments", () => {
  test("sizes read like a person would say them", () => {
    expect(fileSize(88)).toBe("88 B");
    expect(fileSize(320 * 1024)).toBe("320 KB");
    expect(fileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  test("limits fail at the picker with a reason", () => {
    expect(attachmentProblem(1024, 0)).toBeNull();
    expect(attachmentProblem(0, 0)).toBe("That file is empty.");
    expect(attachmentProblem(MAX_ATTACHMENT_BYTES + 1, 0)).toContain("The limit is 25 MB");
    expect(attachmentProblem(1024, MAX_ATTACHMENTS)).toContain(`up to ${MAX_ATTACHMENTS}`);
  });

  test("the wire shape carries name and type so the Pod can identify the file", () => {
    expect(
      toMediaItems([{ uri: "file:///a", b64: "aGk=", mime: "application/pdf", name: "lease.pdf", kind: "file", size: 2 }]),
    ).toEqual([{ base64: "aGk=", mime_type: "application/pdf", filename: "lease.pdf" }]);
  });

  test("base64 length converts to bytes", () => {
    expect(base64Bytes("aGk=")).toBe(2);
    expect(base64Bytes("aGVsbG8=")).toBe(5);
    expect(base64Bytes("aGVsbG8h")).toBe(6);
  });

  test("an unnamed photo gets a real extension", () => {
    expect(photoName("file:///tmp/abc", "image/png", 0)).toBe("photo-1.png");
    expect(photoName("file:///tmp/IMG_1.HEIC", "image/heic", 0)).toBe("IMG_1.HEIC");
    expect(photoName("file:///tmp/abc", "image/jpeg", 2)).toBe("photo-3.jpg");
  });
});
