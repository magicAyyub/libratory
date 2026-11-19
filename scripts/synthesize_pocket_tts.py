#!/usr/bin/env python3

import argparse
import json
import os
import sys
from importlib.metadata import version
from pathlib import Path

import numpy as np
import soundfile as sf

from chunk_io import load_existing_chunk, read_chunks, write_chunk_manifest
from pocket_text import synthesis_text_for


PAUSE_MS = 250
SAMPLE_RATE = 24000
DEFAULT_LANGUAGE = "english_2026-04"

# The catalog's French-model voices are almost all non-French speakers, which is audible. These are
# native recordings Kyutai publishes; encoding them needs the gated weights, once per voice. The
# revision is pinned so `voix-07` stays the same person. Ids mirror POCKET_NATIVE_VOICES in lib/pocket.ts.
NATIVE_VOICE_REPO = "kyutai/tts-voices"
NATIVE_VOICE_REVISION = "323332d33f997de8394f24a193e1a76df720e01a"
NATIVE_VOICES = {
    "french_24l": {
        "fabien": "unmute-prod-website/fabieng-enhanced-v2.wav",
        **{
            f"voix-{index:02d}": f"cml-tts/fr/{name}_enhanced.wav"
            for index, name in enumerate([
                "577_394_000070-0001", "928_486_000075-0001", "296_1028_000022-0001",
                "2114_1656_000053-0001", "2216_1745_000007-0001", "3267_1902_000075-0001",
                "2465_1943_000152-0002", "7142_2432_000124-0003", "579_2548_000015-0001",
                "2154_2576_000020-0003", "7400_2928_000100-0001", "5207_3078_000031-0002",
                "5476_3103_000072-0001", "4724_3731_000031-0001", "5830_4703_000037-0001",
                "5790_4893_000052-0001", "7591_6742_000149-0002", "6318_7016_000027-0002",
                "7601_7727_000062-0001", "7762_8734_000048-0002", "9834_9697_000150-0003",
                "10177_10625_000134-0003", "10179_11051_000005-0001", "12080_11650_000047-0001",
            ], start=1)
        },
    },
}







CLONING_UNAVAILABLE = (
    "voice cloning weights are unavailable — accept the terms at "
    "https://huggingface.co/kyutai/pocket-tts, set HF_TOKEN, and download them from the voice picker"
)

# load_model swaps in the cloning-free mirror whenever the gated repo refuses, so a token that has
# not accepted the terms would otherwise "succeed" and leave cloning exactly as unavailable as before.
TOKEN_REFUSED = (
    "HF_TOKEN cannot download kyutai/pocket-tts — accept the terms at "
    "https://huggingface.co/kyutai/pocket-tts with the account that owns the token"
)


def catalog_voices() -> list[str]:
    """The installed package owns the catalog — don't keep a copy that can drift from it."""
    from pocket_tts.utils.utils import _ORIGINS_OF_PREDEFINED_VOICES

    return list(_ORIGINS_OF_PREDEFINED_VOICES)


def resolve_voice(model, voice: str):
    """An existing path is a voice state or a reference to clone; anything else is a catalog name."""
    path = Path(voice)
    if path.exists():
        # A state file is already encoded, so playing it back needs no cloning weights
        if path.suffix != ".safetensors" and not getattr(model, "has_voice_cloning", False):
            raise RuntimeError(CLONING_UNAVAILABLE)
        return model.get_state_for_audio_prompt(path)

    known = catalog_voices()
    if voice not in known:
        raise RuntimeError(f"unknown voice '{voice}' — catalog voices are: {', '.join(sorted(known))}")
    return model.get_state_for_audio_prompt(voice)


def export_voice(audio_path: str, out_path: str, language: str) -> None:
    """Encode a reference recording once so synthesis can reload it in ~10ms."""
    from pocket_tts import TTSModel, export_model_state

    model = TTSModel.load_model(language=language)
    if not getattr(model, "has_voice_cloning", False):
        raise RuntimeError(CLONING_UNAVAILABLE)
    state = model.get_state_for_audio_prompt(Path(audio_path))
    export_model_state(state, out_path)
    print(json.dumps({"type": "exported", "path": out_path}), flush=True)


def prepare_native_voices(model, language: str, voices_dir: str) -> None:
    from huggingface_hub import hf_hub_download
    from pocket_tts import export_model_state

    sources = NATIVE_VOICES.get(language, {})
    target = Path(voices_dir) / language
    missing = {voice: source for voice, source in sources.items() if not (target / f"{voice}.safetensors").exists()}
    if not missing:
        return
    if not getattr(model, "has_voice_cloning", False):
        print(f"warning: skipping native {language} voices: {CLONING_UNAVAILABLE}", file=sys.stderr)
        return

    target.mkdir(parents=True, exist_ok=True)
    for voice, source in missing.items():
        audio = hf_hub_download(NATIVE_VOICE_REPO, source, revision=NATIVE_VOICE_REVISION)
        state = model.get_state_for_audio_prompt(Path(audio), truncate=True)
        partial = target / f"{voice}.partial"
        export_model_state(state, partial)
        partial.replace(target / f"{voice}.safetensors")


def cache_models(language: str, require_cloning: bool = False, native_voices_dir: str | None = None) -> None:
    from pocket_tts import TTSModel

    model = TTSModel.load_model(language=language)
    if require_cloning and not getattr(model, "has_voice_cloning", False):
        print(TOKEN_REFUSED, file=sys.stderr, flush=True)
        sys.exit(1)
    for voice in catalog_voices():
        try:
            model.get_state_for_audio_prompt(voice)
        except Exception as exc:
            print(f"warning: could not cache voice {voice}: {exc}", file=sys.stderr)
    if native_voices_dir:
        prepare_native_voices(model, language, native_voices_dir)
    print(json.dumps({
        "type": "cached",
        "language": language,
        "voiceCloning": bool(getattr(model, "has_voice_cloning", False)),
    }), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Synthesize text to WAV using Kyutai Pocket TTS")
    parser.add_argument("--input", help="Path to chunked input text file")
    parser.add_argument("--output", help="Path to output WAV file")
    parser.add_argument("--voice", help="Catalog voice name, or path to a reference audio/.safetensors file")
    parser.add_argument("--chunks-dir", default=None, help="Optional directory to persist per-chunk WAV previews")
    parser.add_argument("--language", default=DEFAULT_LANGUAGE, help="Pocket TTS language model to load")
    parser.add_argument("--cache-only", action="store_true", help="Download model and catalog voices, then exit")
    parser.add_argument("--require-cloning", action="store_true", help="With --cache-only: fail unless the gated cloning weights arrived")
    parser.add_argument("--native-voices-dir", default=None, help="With --cache-only: also encode this language's native voices here")
    parser.add_argument("--export-voice", default=None, help="Reference audio to encode into a reusable voice state")
    parser.add_argument("--voice-out", default=None, help="Destination .safetensors path for --export-voice")
    args = parser.parse_args()

    if args.cache_only:
        cache_models(args.language, args.require_cloning, args.native_voices_dir)
        return

    if args.export_voice:
        if not args.voice_out:
            raise RuntimeError("--voice-out is required with --export-voice")
        export_voice(args.export_voice, args.voice_out, args.language)
        return

    for required in ("input", "output", "voice"):
        if not getattr(args, required):
            raise RuntimeError(f"--{required} is required")

    chunks = read_chunks(args.input)
    synthesis_chunks = [synthesis_text_for(chunk, args.language) for chunk in chunks]
    if args.chunks_dir:
        # New weights change the voice, so audio from another release must not be stitched in on resume
        write_chunk_manifest(args.chunks_dir, chunks, synthesis_chunks, f"pocket-tts {version('pocket-tts')} {args.language}")
    print(json.dumps({"type": "chunks", "total": len(chunks)}), flush=True)

    loaded: list = []

    def synthesizer():
        """Deferred so a fully-resumed chapter never pays the model load."""
        if not loaded:
            from pocket_tts import TTSModel

            model = TTSModel.load_model(language=args.language)
            loaded.append((model, resolve_voice(model, args.voice)))
        return loaded[0]

    if not chunks:
        raise RuntimeError("No audio chunks were produced")

    silence = np.zeros(int(SAMPLE_RATE * PAUSE_MS / 1000), dtype=np.float32)
    # Streamed to disk rather than held: a long chapter's float32 audio runs to a gigabyte
    partial_output = args.output + ".partial"
    total_samples = 0
    out = sf.SoundFile(partial_output, "w", samplerate=SAMPLE_RATE, channels=1, format="WAV")

    for index, chunk in enumerate(chunks, start=1):
        waveform = load_existing_chunk(args.chunks_dir, index)
        if waveform is None:
            model, voice_state = synthesizer()
            waveform = model.generate_audio(voice_state, synthesis_chunks[index - 1]).numpy().astype(np.float32).squeeze()
            if waveform.size == 0:
                raise RuntimeError(f"chunk {index} produced no audio")
            if args.chunks_dir:
                os.makedirs(args.chunks_dir, exist_ok=True)
                sf.write(os.path.join(args.chunks_dir, f"chunk-{index:03d}.wav"), waveform, SAMPLE_RATE)

        out.write(waveform)
        total_samples += len(waveform)
        if index < len(chunks):
            out.write(silence)
            total_samples += len(silence)

        print(json.dumps({
            "type": "progress",
            "chunk": index,
            "totalChunks": len(chunks),
            "audioSeconds": round(total_samples / SAMPLE_RATE, 1),
        }), flush=True)

    out.close()
    os.replace(partial_output, args.output)
    print(json.dumps({
        "type": "done",
        "audioSeconds": round(total_samples / SAMPLE_RATE, 1),
        "chunks": len(chunks),
    }), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
