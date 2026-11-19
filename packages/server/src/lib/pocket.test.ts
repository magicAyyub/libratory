import { describe, expect, it } from "vitest";

import {
  DEFAULT_POCKET_LANGUAGE,
  customVoiceStatePath,
  parsePocketVoice,
  pocketLanguageArgs,
  pocketNativeVoiceStatePath,
} from "./pocket.ts";
import { pocketCustomVoiceToEntry } from "./voice-catalog.ts";

describe("Pocket TTS voice ids", () => {
  it("keeps English on the checkpoint existing clones were encoded against", () => {
    expect(DEFAULT_POCKET_LANGUAGE.model).toBe("english_2026-04");
    expect(pocketLanguageArgs("alba")).toEqual(["--language", "english_2026-04"]);
  });

  it("resolves native voices to their own language only", () => {
    expect(parsePocketVoice("fr:voix-07")).toMatchObject({ kind: "native", voiceName: "voix-07" });
    expect(pocketLanguageArgs("fr:fabien")).toEqual(["--language", "french_24l"]);
    expect(parsePocketVoice("it:voix-07")).toBeNull();
    expect(parsePocketVoice("voix-07")).toBeNull();
    expect(parsePocketVoice("fr:voix-25")).toBeNull();
  });

  it("still treats catalog voices as catalog voices under French", () => {
    expect(parsePocketVoice("fr:estelle")).toMatchObject({ kind: "catalog", voiceName: "estelle" });
  });

  it("runs a clone on the checkpoint it was encoded against", () => {
    const id = "5e509238-95e1-41a0-9818-ec49f27e1bf3";
    expect(pocketLanguageArgs(`custom:${id}`)).toEqual(["--language", "english_2026-04"]);
    expect(pocketLanguageArgs(`custom:fr:${id}`)).toEqual(["--language", "french_24l"]);
    expect(customVoiceStatePath(`custom:fr:${id}`)).toMatch(new RegExp(`pocket-voices/${id}\\.safetensors$`));
  });

  it("rejects malformed clone ids", () => {
    const id = "5e509238-95e1-41a0-9818-ec49f27e1bf3";
    expect(parsePocketVoice(`custom:xx:${id}`)).toBeNull();
    expect(parsePocketVoice(`custom:fr:en:${id}`)).toBeNull();
    expect(parsePocketVoice("custom:fr:../../etc/passwd")).toBeNull();
  });

  it("keeps English clone ids in the form already saved on books", () => {
    const voice = { id: "5e509238-95e1-41a0-9818-ec49f27e1bf3", name: "Moi", seconds: 20 };
    expect(pocketCustomVoiceToEntry(voice)).toMatchObject({ id: `pocket:custom:${voice.id}`, language: "en" });
    expect(pocketCustomVoiceToEntry({ ...voice, language: "fr" })).toMatchObject({
      id: `pocket:custom:fr:${voice.id}`,
      language: "fr",
      note: "FR · 20s reference",
    });
  });

  it("stores native voices per checkpoint", () => {
    const parsed = parsePocketVoice("fr:fabien");
    if (parsed?.kind !== "native") throw new Error("expected a native voice");
    expect(pocketNativeVoiceStatePath(parsed.language, parsed.voiceName)).toMatch(/pocket-voices\/french_24l\/fabien\.safetensors$/);
  });
});
