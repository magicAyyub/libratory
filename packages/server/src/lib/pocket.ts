import { access, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { env } from "../env.ts";
import { pocketVoicesDir, scriptPath } from "./paths.ts";

export const POCKET_SCRIPT = scriptPath("synthesize_pocket_tts.py");
export const pocketPython = () => path.join(env.POCKET_ENV_PATH, "python");

export type PocketLanguage = {
  /** Short code used in voice ids: `pocket:<code>:<voice>` (English is implicit, `pocket:<voice>`). */
  code: string;
  label: string;
  /** pocket-tts config name — the checkpoint, not a runtime switch. */
  model: string;
  approxMb: number;
  /** Rough throughput on CPU; the 24-layer previews are markedly slower than the distilled ones. */
  realtimeFactor: number;
  note?: string;
};

// Kyutai ships one checkpoint per language. The "_24l" builds are 24-layer previews (641 MB of
// weights vs 209 MB) and upstream flags them as not-yet-distilled; French has no distilled build.
// Pinned by date: since pocket-tts 3 the bare "english" name points at a newer checkpoint, and this
// one's weights are what existing clones were encoded against.
const ENGLISH: PocketLanguage = { code: "en", label: "English", model: "english_2026-04", approxMb: 370, realtimeFactor: 12 };

export const POCKET_LANGUAGES: PocketLanguage[] = [
  ENGLISH,
  { code: "es", label: "Spanish", model: "spanish", approxMb: 370, realtimeFactor: 12 },
  { code: "it", label: "Italian", model: "italian", approxMb: 370, realtimeFactor: 12 },
  { code: "de", label: "German", model: "german", approxMb: 370, realtimeFactor: 12 },
  { code: "pt", label: "Portuguese", model: "portuguese", approxMb: 370, realtimeFactor: 12 },
  { code: "fr", label: "French", model: "french_24l", approxMb: 800, realtimeFactor: 5, note: "Preview model — larger and ~2.5x slower; Kyutai has no distilled French build yet" },
];

export const DEFAULT_POCKET_LANGUAGE = ENGLISH;

export function pocketLanguageByCode(code: string): PocketLanguage | null {
  return POCKET_LANGUAGES.find((l) => l.code === code) ?? null;
}

export type PocketVoiceLicense = "CC0" | "CC BY 4.0" | "CC BY-NC 4.0" | "unverified";

export type PocketVoice = {
  id: string;
  name: string;
  license: PocketVoiceLicense;
  note: string;
};

// Licenses come from the voices' source datasets, mapped in pocket_tts/utils/utils.py
// (_ORIGINS_OF_PREDEFINED_VOICES) — see docs/tts-licensing.md before any paid deployment.
export const POCKET_VOICES: PocketVoice[] = [
  { id: "alba", name: "Alba", license: "CC BY 4.0", note: "Voice-acted" },
  { id: "anna", name: "Anna", license: "CC BY 4.0", note: "VCTK" },
  { id: "vera", name: "Vera", license: "CC BY 4.0", note: "VCTK" },
  { id: "fantine", name: "Fantine", license: "CC BY 4.0", note: "VCTK" },
  { id: "charles", name: "Charles", license: "CC BY 4.0", note: "VCTK" },
  { id: "paul", name: "Paul", license: "CC BY 4.0", note: "VCTK" },
  { id: "eponine", name: "Eponine", license: "CC BY 4.0", note: "VCTK" },
  { id: "azelma", name: "Azelma", license: "CC BY 4.0", note: "VCTK" },
  { id: "george", name: "George", license: "CC BY 4.0", note: "VCTK" },
  { id: "mary", name: "Mary", license: "CC BY 4.0", note: "VCTK" },
  { id: "jane", name: "Jane", license: "CC BY 4.0", note: "VCTK" },
  { id: "michael", name: "Michael", license: "CC BY 4.0", note: "VCTK" },
  { id: "eve", name: "Eve", license: "CC BY 4.0", note: "VCTK" },
  { id: "marius", name: "Marius", license: "CC0", note: "Voice donation" },
  { id: "javert", name: "Javert", license: "CC0", note: "Voice donation" },
  { id: "bill_boerst", name: "Bill Boerst", license: "CC0", note: "LibriVox" },
  { id: "peter_yearsley", name: "Peter Yearsley", license: "CC0", note: "LibriVox" },
  { id: "stuart_bell", name: "Stuart Bell", license: "CC0", note: "LibriVox" },
  { id: "caro_davy", name: "Caro Davy", license: "CC0", note: "LibriVox" },
  { id: "giovanni", name: "Giovanni", license: "CC BY 4.0", note: "Italian speaker" },
  { id: "lola", name: "Lola", license: "CC BY 4.0", note: "Spanish speaker" },
  { id: "juergen", name: "Juergen", license: "CC BY 4.0", note: "German speaker" },
  { id: "rafael", name: "Rafael", license: "CC BY 4.0", note: "Portuguese speaker" },
  { id: "estelle", name: "Estelle", license: "unverified", note: "French speaker" },
  { id: "cosette", name: "Cosette", license: "CC BY-NC 4.0", note: "Expresso" },
  { id: "jean", name: "Jean", license: "CC BY-NC 4.0", note: "EARS" },
];

const POCKET_VOICE_IDS = new Set(POCKET_VOICES.map((voice) => voice.id));

// Native speakers for a language, encoded locally from Kyutai's recordings (NATIVE_VOICES in
// synthesize_pocket_tts.py). Unlike the catalog they exist for one checkpoint only.
export const POCKET_NATIVE_VOICES: Record<string, PocketVoice[]> = {
  fr: [
    { id: "fabien", name: "Fabien", license: "CC0", note: "French speaker" },
    ...Array.from({ length: 35 }, (_, index): PocketVoice => {
      const number = String(index + 1).padStart(2, "0");
      return { id: `voix-${number}`, name: `Voix ${number}`, license: "CC BY 4.0", note: "French speaker, CML-TTS" };
    }),
  ],
};

function nativePocketVoice(languageCode: string, voiceId: string): PocketVoice | null {
  return POCKET_NATIVE_VOICES[languageCode]?.find((voice) => voice.id === voiceId) ?? null;
}

export function pocketNativeVoiceStatePath(language: PocketLanguage, voiceId: string): string {
  return path.join(pocketVoicesDir, language.model, `${voiceId}.safetensors`);
}

// Encoding needs the gated weights, so a native voice is only offered once its state is on disk.
export async function pocketNativeVoicesPrepared(language: PocketLanguage): Promise<boolean> {
  const voices = POCKET_NATIVE_VOICES[language.code] ?? [];
  const present = await Promise.all(voices.map((voice) => pathExists(pocketNativeVoiceStatePath(language, voice.id))));
  return present.every(Boolean);
}

export async function listInstalledPocketNativeVoices(): Promise<Record<string, PocketVoice[]>> {
  const installed: Record<string, PocketVoice[]> = {};
  for (const [code, voices] of Object.entries(POCKET_NATIVE_VOICES)) {
    const language = pocketLanguageByCode(code);
    if (!language) continue;
    const present = await Promise.all(voices.map((voice) => pathExists(pocketNativeVoiceStatePath(language, voice.id))));
    installed[code] = voices.filter((_, index) => present[index]);
  }
  return installed;
}

export function isPocketCatalogVoice(voiceId: string): boolean {
  return POCKET_VOICE_IDS.has(voiceId);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function pocketEngineInstalled(): Promise<boolean> {
  return pathExists(pocketPython());
}

function hfCacheRoot(): string {
  return process.env.HF_HOME
    ? path.join(process.env.HF_HOME, "hub")
    : path.join(os.homedir(), ".cache", "huggingface", "hub");
}

const GATED_REPO = "pocket-tts";
const MIRROR_REPO = "pocket-tts-without-voice-cloning";

// Each pocket-tts release pins its weights to a revision and synthesis runs offline, so the same
// language cached by another release does not count. The installed package's config is the truth.
async function pinnedRevision(model: string, repo: string): Promise<string | null> {
  const lib = path.resolve(env.POCKET_ENV_PATH, "..", "lib");
  try {
    for (const python of await readdir(lib)) {
      const config = path.join(lib, python, "site-packages", "pocket_tts", "config", `${model}.yaml`);
      const text = await readFile(config, "utf-8").catch(() => null);
      if (text === null) continue;
      const line = text.split("\n").find((entry) => entry.includes(`hf://kyutai/${repo}/languages/${model}/model.safetensors@`));
      return line?.split("@").at(-1)?.trim() ?? null;
    }
  } catch {
    // No engine environment yet: fall through to any cached revision
  }
  return null;
}

async function pocketWeightsCached(repo: string, model: string): Promise<boolean> {
  const snapshots = path.join(hfCacheRoot(), `models--kyutai--${repo}`, "snapshots");
  const weights = (revision: string) => path.join(snapshots, revision, "languages", model, "model.safetensors");
  const pinned = await pinnedRevision(model, repo);
  if (pinned) return pathExists(weights(pinned));
  const entries = await readdir(snapshots).catch(() => [] as string[]);
  return (await Promise.all(entries.map((entry) => pathExists(weights(entry))))).some(Boolean);
}

// A language is usable once its checkpoint is in the HF cache; downloads land there, so no server
// restart is needed. With HF_TOKEN the weights come from the gated repo, without one from the
// cloning-free mirror; either satisfies synthesis.
export async function pocketLanguageInstalled(model: string): Promise<boolean> {
  return (await pocketWeightsCached(GATED_REPO, model)) || pocketWeightsCached(MIRROR_REPO, model);
}

// Cloning encodes against the checkpoint it will read with, so each language needs its own gated
// weights. Presence on disk is the honest signal: a token can be set with nothing fetched.
export async function pocketCloningAvailable(model: string = DEFAULT_POCKET_LANGUAGE.model): Promise<boolean> {
  return pocketWeightsCached(GATED_REPO, model);
}

const CUSTOM_VOICE_PREFIX = "custom:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ParsedPocketVoice =
  | { kind: "custom"; language: PocketLanguage; voice: string }
  | { kind: "catalog"; language: PocketLanguage; voiceName: string }
  | { kind: "native"; language: PocketLanguage; voiceName: string };

// `pocket:alba` stays English for ids stored before languages existed; `custom` is reserved.
export function parsePocketVoice(voice: string): ParsedPocketVoice | null {
  const custom = parseCustomVoice(voice);
  if (custom) return { kind: "custom", language: custom.language, voice };
  if (voice.startsWith(CUSTOM_VOICE_PREFIX)) return null;

  const separator = voice.indexOf(":");
  if (separator === -1) {
    return isPocketCatalogVoice(voice)
      ? { kind: "catalog", language: DEFAULT_POCKET_LANGUAGE, voiceName: voice }
      : null;
  }

  const language = pocketLanguageByCode(voice.slice(0, separator));
  const voiceName = voice.slice(separator + 1);
  if (!language) return null;
  if (nativePocketVoice(language.code, voiceName)) return { kind: "native", language, voiceName };
  if (!isPocketCatalogVoice(voiceName)) return null;
  return { kind: "catalog", language, voiceName };
}

// `custom:<uuid>` is an English clone, the form every clone had before they carried a language;
// `custom:<code>:<uuid>` was encoded against that language's checkpoint.
function parseCustomVoice(voice: string): { language: PocketLanguage; id: string } | null {
  if (!voice.startsWith(CUSTOM_VOICE_PREFIX)) return null;
  const parts = voice.slice(CUSTOM_VOICE_PREFIX.length).split(":");
  const id = parts.at(-1) ?? "";
  if (parts.length > 2 || !UUID_PATTERN.test(id)) return null;
  const language = parts.length === 2 ? pocketLanguageByCode(parts[0] ?? "") : DEFAULT_POCKET_LANGUAGE;
  return language ? { language, id } : null;
}

export function isPocketCustomVoice(voice: string): boolean {
  return parseCustomVoice(voice) !== null;
}

export function customVoiceStatePath(voice: string): string {
  const id = parseCustomVoice(voice)?.id;
  if (!id) throw new Error("Invalid cloned voice id");
  return path.join(pocketVoicesDir, `${id}.safetensors`);
}

// A cloned voice's state only fits the checkpoint it was encoded against, which its id names.
export function pocketLanguageArgs(voice: string): string[] {
  return ["--language", (parsePocketVoice(voice)?.language ?? DEFAULT_POCKET_LANGUAGE).model];
}

// Catalog voices pass through as bare names (the language rides in --language); cloned voices
// become a state file the subprocess loads.
export async function resolvePocketVoiceArg(voice: string): Promise<string> {
  if (!isPocketCustomVoice(voice)) {
    const parsed = parsePocketVoice(voice);
    if (parsed?.kind === "native") {
      const statePath = pocketNativeVoiceStatePath(parsed.language, parsed.voiceName);
      if (!(await pathExists(statePath))) {
        throw new Error("That voice is not prepared on this machine — run pnpm run setup or pick another voice");
      }
      return statePath;
    }
    return parsed?.kind === "catalog" ? parsed.voiceName : voice;
  }
  const statePath = customVoiceStatePath(voice);
  if (!(await pathExists(statePath))) {
    throw new Error("That cloned voice no longer exists — pick another voice in the picker");
  }
  return statePath;
}

export function isValidCustomVoiceId(id: string): boolean {
  return UUID_PATTERN.test(id);
}
