import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

import { parseFile } from "music-metadata";

import { pocketVoicesDir } from "./paths.ts";
import {
  DEFAULT_POCKET_LANGUAGE,
  POCKET_SCRIPT,
  isValidCustomVoiceId,
  pocketCloningAvailable,
  pocketLanguageByCode,
  pocketLanguageInstalled,
  pocketPython,
} from "./pocket.ts";

const execFileAsync = promisify(execFile);

export type CustomPocketVoice = {
  id: string;
  name: string;
  createdAt: string;
  seconds: number;
  /** Code of the checkpoint the voice was encoded against. */
  language: string;
};

// Below this the model has too little material and the clone drifts toward the catalog voice
const MIN_REFERENCE_SECONDS = 8;
const MAX_REFERENCE_SECONDS = 120;

function metadataPath(id: string): string {
  return path.join(pocketVoicesDir, `${id}.json`);
}

export async function listCustomPocketVoices(): Promise<CustomPocketVoice[]> {
  let entries: string[];
  try {
    entries = await readdir(pocketVoicesDir);
  } catch {
    return [];
  }
  const present = new Set(entries);
  const metas = await Promise.all(
    entries.filter((name) => name.endsWith(".json")).map(async (entry) => {
      try {
        const meta = JSON.parse(await readFile(path.join(pocketVoicesDir, entry), "utf-8")) as CustomPocketVoice;
        if (!present.has(`${meta.id}.safetensors`)) return null;
        // Clones made before they carried a language were all encoded against English
        return { ...meta, language: meta.language ?? DEFAULT_POCKET_LANGUAGE.code };
      } catch {
        return null;
      }
    }),
  );
  return metas.filter((meta): meta is CustomPocketVoice => meta !== null).sort((a, b) => a.name.localeCompare(b.name));
}

// Browser recordings arrive as webm/opus or mp4/aac, and pocket-tts reads WAV with a hardcoded
// int16 reader — normalising through ffmpeg first covers both.
export async function createCustomPocketVoice(
  sourcePath: string,
  name: string,
  languageCode: string = DEFAULT_POCKET_LANGUAGE.code,
): Promise<CustomPocketVoice> {
  const language = pocketLanguageByCode(languageCode);
  if (!language) throw new Error(`Unknown Pocket TTS language: ${languageCode}`);
  if (!(await pocketLanguageInstalled(language.model))) {
    throw new Error(`Download the ${language.label} voices first, then clone this voice`);
  }
  if (!(await pocketCloningAvailable())) {
    throw new Error("Voice cloning weights are not installed — download them from Your voices in the voice picker");
  }

  const id = randomUUID();
  await mkdir(pocketVoicesDir, { recursive: true });
  const wavPath = path.join(pocketVoicesDir, `${id}.reference.wav`);
  const statePath = path.join(pocketVoicesDir, `${id}.safetensors`);

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", sourcePath,
      "-t", String(MAX_REFERENCE_SECONDS),
      "-ac", "1",
      "-ar", "24000",
      "-c:a", "pcm_s16le",
      wavPath,
    ], { timeout: 120_000 });

    const seconds = (await parseFile(wavPath, { duration: true })).format.duration ?? 0;
    if (seconds < MIN_REFERENCE_SECONDS) {
      throw new Error(`Recording is ${seconds.toFixed(1)}s — use at least ${MIN_REFERENCE_SECONDS}s (about 20s works best)`);
    }

    await execFileAsync(pocketPython(), [
      POCKET_SCRIPT,
      "--export-voice", wavPath,
      "--voice-out", statePath,
      "--language", language.model,
    ], { timeout: 300_000, env: { ...process.env, HF_HUB_OFFLINE: "1" } });

    const meta: CustomPocketVoice = {
      id,
      name: name.trim() || "Untitled voice",
      createdAt: new Date().toISOString(),
      seconds: Math.round(seconds * 10) / 10,
      language: language.code,
    };
    await writeFile(metadataPath(id), JSON.stringify(meta), "utf-8");
    return meta;
  } finally {
    await rm(wavPath, { force: true });
  }
}

export async function deleteCustomPocketVoice(id: string): Promise<void> {
  if (!isValidCustomVoiceId(id)) throw new Error("Invalid voice id");
  await rm(path.join(pocketVoicesDir, `${id}.safetensors`), { force: true });
  await rm(metadataPath(id), { force: true });
}
