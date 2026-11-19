#!/bin/sh
# What `pnpm run setup` does for the native path, the entrypoint does for the container: cache the
# default Pocket TTS narrator into the /models volume before the server starts. Synthesis workers
# run HF_HUB_OFFLINE=1 and never download, so a fresh volume would otherwise serve the whole UI and
# then fail its first synthesis. Cached models make later boots instant and offline-safe.
#
# Non-fatal on purpose: with no network and no cached voice the app still comes up — the library,
# uploads and raw extraction all work — and synthesis reports the missing voice when asked.
if ! /opt/venv-pocket/bin/python /app/scripts/synthesize_pocket_tts.py --cache-only --language french_24l >/dev/null; then
  echo "warning: could not cache the Pocket TTS voice; synthesis will fail until a restart with network access" >&2
fi
# Piper's Bulgarian voice, 63 MB, the same way: from the cache when it is there, else fetched once
if ! /opt/venv-piper/bin/python /app/scripts/synthesize_piper_tts.py --cache-only >/dev/null; then
  echo "warning: could not cache the Piper Bulgarian voice (63 MB); it will be unavailable until a restart with network access" >&2
fi
exec "$@"
