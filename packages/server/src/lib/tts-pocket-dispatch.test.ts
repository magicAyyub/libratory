import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockWriteFile, mockSpawn } = vi.hoisted(() => ({
  mockWriteFile: vi.fn(async () => {}),
  mockSpawn: vi.fn(() => {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const proc = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };

    proc.stdout = stdout;
    proc.stderr = stderr;
    proc.kill = vi.fn();

    queueMicrotask(() => proc.emit("close", 0));
    return proc;
  }),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: mockWriteFile,
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

vi.mock("node:readline", () => ({
  createInterface: ({ input }: { input: EventEmitter }) => ({
    on(event: string, callback: (line: string) => void) {
      input.on(event, callback);
      return this;
    },
    close() {},
  }),
}));

import { getPreviewTextForVoice, synthesize } from "./tts.ts";

describe("Pocket TTS previews", () => {
  it("speaks French for native and cloned French voices", async () => {
    const french = await getPreviewTextForVoice("pocket:fr:estelle");
    expect(await getPreviewTextForVoice("pocket:fr:voix-07")).toBe(french);
    expect(await getPreviewTextForVoice("pocket:custom:fr:5e509238-95e1-41a0-9818-ec49f27e1bf3")).toBe(french);
    expect(await getPreviewTextForVoice("pocket:custom:5e509238-95e1-41a0-9818-ec49f27e1bf3")).not.toBe(french);
  });
});

describe("Pocket TTS chunking", () => {
  beforeEach(() => {
    mockSpawn.mockClear();
    mockWriteFile.mockClear();
  });

  it("keeps sentences in one paragraph in the same request and separates blank-line paragraphs", async () => {
    await synthesize({
      inputText: "Première phrase.\nDeuxième phrase.\n\nNouveau paragraphe.",
      outputPath: "/tmp/out.wav",
      voice: "pocket:fr:estelle",
      speed: 1,
    });

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/tmp/out.txt",
      "Première phrase. Deuxième phrase.\fNouveau paragraphe.",
      "utf-8",
    );
  });
});
