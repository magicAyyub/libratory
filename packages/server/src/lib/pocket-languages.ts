import {
  DEFAULT_POCKET_LANGUAGE,
  POCKET_LANGUAGES,
  POCKET_SCRIPT,
  pocketCloningAvailable,
  POCKET_NATIVE_VOICES,
  pocketLanguageInstalled,
  pocketPython,
  type PocketLanguage,
} from "./pocket.ts";
import { env, envFilePath } from "../env.ts";
import { DownloadTracker } from "./downloads.ts";
import { pocketVoicesDir } from "./paths.ts";

export type PocketLanguageState = {
  code: string;
  label: string;
  approxMb: number;
  realtimeFactor: number;
  note?: string;
  installed: boolean;
  downloading: boolean;
  error: string | null;
};

// Downloads land in the shared HF cache, which the synthesis subprocess reads at spawn time — so a
// finished download is live immediately, with no server restart. In-flight runs are tracked only
// so the UI can show progress; intentionally lost on restart like the extract registry.
const downloads = new DownloadTracker();

export async function listPocketLanguages(): Promise<PocketLanguageState[]> {
  const installed = await Promise.all(POCKET_LANGUAGES.map((l) => pocketLanguageInstalled(l.model)));
  return POCKET_LANGUAGES.map((language, i) => ({
    code: language.code,
    label: language.label,
    approxMb: language.approxMb,
    realtimeFactor: language.realtimeFactor,
    note: language.note,
    installed: installed[i] ?? false,
    downloading: downloads.downloading(language.code),
    error: downloads.error(language.code),
  }));
}

export function startPocketLanguageDownload(language: PocketLanguage): { started: boolean } {
  return downloads.start(language.code, pocketPython(), [
    POCKET_SCRIPT,
    "--cache-only",
    "--language",
    language.model,
    ...(POCKET_NATIVE_VOICES[language.code] ? ["--native-voices-dir", pocketVoicesDir] : []),
  ]);
}

const CLONING = "cloning";

export async function pocketCloningState() {
  const states = await Promise.all(POCKET_LANGUAGES.map(async (language) => ({
    language,
    installed: await pocketLanguageInstalled(language.model),
    cloning: await pocketCloningAvailable(language.model),
  })));
  const languages = states.filter((state) => state.installed && state.cloning).map((state) => state.language.code);
  return {
    available: languages.length > 0,
    languages,
    missing: states.filter((state) => state.installed && !state.cloning).map((state) => state.language.label),
    tokenSet: Boolean(env.HF_TOKEN),
    downloading: downloads.downloading(CLONING),
    error: downloads.error(CLONING),
    envFile: envFilePath,
  };
}

// Cloning needs the gated checkpoint of every language it can read, so this fetches them for each
// installed language; --require-cloning turns the library's silent fallback to the mirror into the
// error the user needs to see. The same weights are what native voices are encoded with.
export async function startPocketCloningDownload(): Promise<{ started: boolean }> {
  if (!env.HF_TOKEN) throw new Error(`Set HF_TOKEN in ${envFilePath} and restart Libratory first`);
  const others = (await Promise.all(POCKET_LANGUAGES.map(async (language) => (
    language !== DEFAULT_POCKET_LANGUAGE && await pocketLanguageInstalled(language.model) ? language.model : null
  )))).filter((model): model is string => model !== null);
  return downloads.start(CLONING, pocketPython(), [
    POCKET_SCRIPT,
    "--cache-only",
    "--require-cloning",
    "--language",
    DEFAULT_POCKET_LANGUAGE.model,
    ...others.flatMap((model) => ["--extra-language", model]),
    "--native-voices-dir",
    pocketVoicesDir,
  ]);
}
