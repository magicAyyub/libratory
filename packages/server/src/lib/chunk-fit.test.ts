import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { scriptPath } from "./paths.ts";

describe("Pocket TTS French speech-text normalization", () => {
  it("cleans observed French punctuation only for the French Pocket model", () => {
    const program = `
import json, sys
sys.path.insert(0, ${JSON.stringify(scriptPath(""))})
from pocket_text import synthesis_text_for
texts = [
    "d’assimiler",
    "qu’un",
    "l’oiseau",
    "J’ai jamais eu « la larme facile », comme on dit.",
    "Ah ! là là !",
    "22/11/63",
    "son père : je ne le connaissais que depuis six ans",
    "parents – ils sont morts à deux ans d’intervalle",
    "parents - ils sont morts à deux ans d’intervalle",
    "porte-monnaie",
    "à 08:30",
]
print(json.dumps({
    "french": [synthesis_text_for(text, "french_24l") for text in texts],
    "english": [synthesis_text_for(text, "english") for text in texts],
}))
`;
    const run = spawnSync("python3", ["-c", program], { encoding: "utf-8" });
    if (run.status !== 0) throw new Error(run.stderr);
    expect(JSON.parse(run.stdout)).toEqual({
      french: [
        "d'assimiler",
        "qu'un",
        "l'oiseau",
        "J'ai jamais eu la larme facile, comme on dit.",
        "Ah! là là!",
        "22 11 63",
        "son père, je ne le connaissais que depuis six ans",
        "parents, ils sont morts à deux ans d'intervalle",
        "parents, ils sont morts à deux ans d'intervalle",
        "porte-monnaie",
        "à 08:30",
      ],
      english: [
        "d’assimiler",
        "qu’un",
        "l’oiseau",
        "J’ai jamais eu « la larme facile », comme on dit.",
        "Ah ! là là !",
        "22/11/63",
        "son père : je ne le connaissais que depuis six ans",
        "parents – ils sont morts à deux ans d’intervalle",
        "parents - ils sont morts à deux ans d’intervalle",
        "porte-monnaie",
        "à 08:30",
      ],
    });
  });

  it("removes French typos that are invisible on the page", () => {
    const program = `
import json, sys
sys.path.insert(0, ${JSON.stringify(scriptPath(""))})
from pocket_text import synthesis_text_for
print(json.dumps([
    synthesis_text_for(text, "french_24l")
    for text in ["l\\u02bcart", "pre\\u0302t", "dif\\ufb01cile", "af\\u00adfaire\\u200b", "dix\\u00a0mille", "c\\u2011est"]
]))
`;
    const run = spawnSync("python3", ["-c", program], { encoding: "utf-8" });
    if (run.status !== 0) throw new Error(run.stderr);
    expect(JSON.parse(run.stdout)).toEqual(["l'art", "prêt", "difficile", "affaire", "dix mille", "c-est"]);
  });

  it("discards resumed audio made by another engine release", () => {
    const program = `
import json, os, sys, tempfile
sys.path.insert(0, ${JSON.stringify(scriptPath(""))})
from chunk_io import write_chunk_manifest
d = tempfile.mkdtemp()
write_chunk_manifest(d, ["Texte."], ["Texte."], "pocket-tts 2.1.0 french_24l")
open(os.path.join(d, "chunk-001.wav"), "w").close()
write_chunk_manifest(d, ["Texte."], ["Texte."], "pocket-tts 2.1.0 french_24l")
kept = os.path.exists(os.path.join(d, "chunk-001.wav"))
write_chunk_manifest(d, ["Texte."], ["Texte."], "pocket-tts 4.0.1 french_24l")
print(json.dumps([kept, os.path.exists(os.path.join(d, "chunk-001.wav"))]))
`;
    const run = spawnSync("python3", ["-c", program], { encoding: "utf-8" });
    if (run.status !== 0) throw new Error(run.stderr);
    expect(JSON.parse(run.stdout)).toEqual([true, false]);
  });

  it("invalidates resumed audio when the spoken text changes but keeps original chunk text", () => {
    const program = `
import json, os, sys, tempfile
sys.path.insert(0, ${JSON.stringify(scriptPath(""))})
from chunk_io import write_chunk_manifest
d = tempfile.mkdtemp()
original = ["Unchanged.", "d’assimiler.", "« la larme facile »,", "22/11/63"]
for i in range(1, 5):
    open(os.path.join(d, f"chunk-{i:03d}.wav"), "w").close()
write_chunk_manifest(d, original)
spoken = ["Unchanged.", "d'assimiler.", "la larme facile,", "22 11 63"]
write_chunk_manifest(d, original, spoken)
print(json.dumps({
    "files": sorted(os.listdir(d)),
    "manifest": json.load(open(os.path.join(d, "chunks.json"), encoding="utf-8")),
}))
`;
    const run = spawnSync("python3", ["-c", program], { encoding: "utf-8" });
    if (run.status !== 0) throw new Error(run.stderr);
    expect(JSON.parse(run.stdout)).toEqual({
      files: ["chunk-001.wav", "chunks.json"],
      manifest: [
        { index: 1, text: "Unchanged.", synthesisText: "Unchanged." },
        { index: 2, text: "d’assimiler.", synthesisText: "d'assimiler." },
        { index: 3, text: "« la larme facile »,", synthesisText: "la larme facile," },
        { index: 4, text: "22/11/63", synthesisText: "22 11 63" },
      ],
    });
  });
});
