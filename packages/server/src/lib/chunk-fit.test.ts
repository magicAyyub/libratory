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
        "à 08 h 30",
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

  it("speaks French times and symbols without inventing them", () => {
    const program = `
import json, sys
sys.path.insert(0, ${JSON.stringify(scriptPath(""))})
from pocket_text import synthesis_text_for
print(json.dumps([
    synthesis_text_for(text, "french_24l")
    for text in ["Il est 9:30.", "À 18:05.", "à 9:30", "(Jean 3:16)", "Jean 3:16 et 4:12", "échelle à 1:50", "En 2020 : 30 morts.", "Il a payé €5 de plus.", "Coût : $20 par mois.", "Il doit €1. 000 ici", "€5 200 personnes", "$1,000 environ", "20 % et 5 €", "A & B", "5€50", "€2 millions", "€3 mille", "€5 €6", "US$5", "10%des gens", "1° le droit", "20°C dehors", "Il paya €1 de plus", "===== Fin ====="]
] + [synthesis_text_for("Paid €5 at 9:30", "english_2026-04")]))
`;
    const run = spawnSync("python3", ["-c", program], { encoding: "utf-8" });
    if (run.status !== 0) throw new Error(run.stderr);
    expect(JSON.parse(run.stdout)).toEqual([
      "Il est 9 h 30.", "À 18 h 05.", "à 9:30", "(Jean 3:16)", "Jean 3:16 et 4:12", "échelle à 1:50", "En 2020, 30 morts.",
      "Il a payé 5 euros de plus.", "Coût, 20 dollars par mois.", "Il doit €1. 000 ici", "€5 200 personnes",
      "1,000 dollars environ", "20 pour cent et 5 euros", "A et B", "5 euros 50", "2 millions d'euros", "3 mille euros",
      "5 euros 6 euros", "US$5", "10 pour cent des gens", "1° le droit", "20 degrés dehors", "Il paya 1 euro de plus", "Fin",
      "Paid €5 at 9:30",
    ]);
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
