"""The chunk files every narrator script shares with the server.

The server writes the chapter as chunks separated by form feeds; a script writes each chunk's audio
as chunk-NNN.wav (and chunk-NNN.words.json where it times words) beside a chunks.json manifest, so
previews, resume and the sync map all read the same layout whatever engine spoke it.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

CHUNK_SEPARATOR = "\f"


def read_chunks(input_path: str) -> list[str]:
    text = Path(input_path).read_text(encoding="utf-8").strip()
    if not text:
        raise RuntimeError("input text is empty")
    return [chunk.strip() for chunk in text.split(CHUNK_SEPARATOR) if chunk.strip()]


def write_chunk_manifest(
    chunks_dir: str,
    chunks: list[str],
    synthesis_texts: list[str] | None = None,
) -> None:
    os.makedirs(chunks_dir, exist_ok=True)
    if synthesis_texts is not None and len(synthesis_texts) != len(chunks):
        raise ValueError("synthesis_texts must have the same number of entries as chunks")

    manifest_path = os.path.join(chunks_dir, "chunks.json")
    if synthesis_texts is not None:
        try:
            with open(manifest_path, encoding="utf-8") as f:
                cached = json.load(f)
        except (OSError, json.JSONDecodeError):
            cached = []

        cached_by_index = {
            entry["index"]: entry
            for entry in cached
            if isinstance(entry, dict) and isinstance(entry.get("index"), int)
        } if isinstance(cached, list) else {}

        keep = 0
        while keep < len(chunks):
            entry = cached_by_index.get(keep + 1)
            if not entry or entry.get("text") != chunks[keep]:
                break
            old_synthesis_text = entry.get("synthesisText", entry["text"])
            if old_synthesis_text != synthesis_texts[keep]:
                break
            keep += 1

        for name in os.listdir(chunks_dir):
            if name.startswith("chunk-") and (name.endswith(".wav") or name.endswith(".words.json")):
                index_text = name[6:].removesuffix(".words.json").removesuffix(".wav")
                if index_text.isdigit() and int(index_text) > keep:
                    os.remove(os.path.join(chunks_dir, name))

    manifest = [
        {
            "index": index,
            "text": chunk,
            **({"synthesisText": synthesis_texts[index - 1]} if synthesis_texts is not None else {}),
        }
        for index, chunk in enumerate(chunks, start=1)
    ]
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False)


def chunk_words_path(chunks_dir: str, index: int) -> str:
    return os.path.join(chunks_dir, f"chunk-{index:03d}.words.json")


def write_chunk_words(chunks_dir: str, index: int, words: list) -> None:
    # An empty list is written too: it records that timings were tried, so a resume keeps the chunk
    os.makedirs(chunks_dir, exist_ok=True)
    with open(chunk_words_path(chunks_dir, index), "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False)


def load_existing_chunk(chunks_dir, index: int, needs_words: bool = False):
    """A previously-synthesized chunk's audio, so resume can skip regenerating it.

    With needs_words, a chunk spoken before its engine timed words is spoken again.
    """
    if not chunks_dir:
        return None
    path = os.path.join(chunks_dir, f"chunk-{index:03d}.wav")
    if not os.path.exists(path):
        return None
    if needs_words and not os.path.exists(chunk_words_path(chunks_dir, index)):
        return None
    try:
        import soundfile as sf

        data, _ = sf.read(path, dtype="float32")
        return data if len(data) else None
    except Exception:
        return None
