"""Local media pipeline for ChannelAI.

Two responsibilities, both running entirely on the user's own CPU:

1. ``decode_audio``   - turn any video/audio container into a mono 16 kHz
   float32 NumPy array using PyAV (which bundles its own FFmpeg libraries, so
   no separate FFmpeg installation is required on Windows).
2. ``transcribe_audio`` - run a Whisper model over that array with
   faster-whisper (CTranslate2, int8) and turn the raw segments into
   caption-sized subtitle lines.

No network access happens here at runtime. The only download is the Whisper
model weights, which happen once and are then cached under
``%USERPROFILE%\\.cache\\huggingface`` for offline use afterwards.
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator

import numpy as np

# --- configuration ---------------------------------------------------------

SAMPLE_RATE = 16_000

#: Whisper sizes faster-whisper can load by short name. Small models are the
#: only realistic option on an 8 GB CPU-only laptop.
KNOWN_MODELS = ("tiny", "base", "small", "medium", "large-v3")

DEFAULT_MODEL = os.environ.get("CHANNELAI_WHISPER_MODEL", "base").strip() or "base"

#: Leave headroom for the OS and the browser. ``0`` means "let ctranslate2 decide".
CPU_THREADS = int(os.environ.get("CHANNELAI_CPU_THREADS", "2") or 0)

#: int8 keeps both the model and the working memory small enough for 8 GB.
COMPUTE_TYPE = os.environ.get("CHANNELAI_COMPUTE_TYPE", "int8").strip() or "int8"


def compute_type_name() -> str:
    """The quantisation actually in use (reported by /api/health)."""
    return COMPUTE_TYPE


# --- errors ----------------------------------------------------------------


class PipelineError(RuntimeError):
    """A failure the user can act on (bad file, no audio, missing codec...)."""


class NoAudioTrack(PipelineError):
    """The uploaded container has no decodable audio stream."""


# --- model cache -----------------------------------------------------------

_model_cache: dict[str, Any] = {}
_model_lock = threading.Lock()


def load_model(model_name: str = DEFAULT_MODEL) -> Any:
    """Load (and cache) a faster-whisper model. Blocking; call from a worker."""
    key = model_name.strip() or DEFAULT_MODEL
    with _model_lock:
        cached = _model_cache.get(key)
        if cached is not None:
            return cached

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:  # pragma: no cover - dependency guard
            raise PipelineError(
                "faster-whisper is not installed in this environment. "
                "Run: backend\\.venv\\Scripts\\python.exe -m pip install -r backend\\requirements.txt"
            ) from exc

        try:
            model = WhisperModel(
                key,
                device="cpu",
                compute_type=COMPUTE_TYPE,
                cpu_threads=CPU_THREADS if CPU_THREADS > 0 else 0,
                num_workers=1,
            )
        except Exception as exc:  # noqa: BLE001 - surfaced to the UI verbatim
            raise PipelineError(f"Could not load Whisper model '{key}': {exc}") from exc

        _model_cache[key] = model
        return model


def unload_models() -> None:
    """Drop cached models (frees RAM)."""
    with _model_lock:
        _model_cache.clear()


def model_is_loaded(model_name: str = DEFAULT_MODEL) -> bool:
    with _model_lock:
        return (model_name.strip() or DEFAULT_MODEL) in _model_cache


# --- audio decoding --------------------------------------------------------


def decode_audio(path: Path) -> np.ndarray:
    """Decode any container into a mono 16 kHz float32 array.

    PyAV ships a complete FFmpeg build, so this works for MP4/MOV/MKV/WebM and
    every audio format FFmpeg supports without a separate FFmpeg install.
    """
    try:
        import av
    except ImportError as exc:  # pragma: no cover - dependency guard
        raise PipelineError("PyAV is not installed. Run: pip install -r backend\\requirements.txt") from exc

    if not path.exists():
        raise PipelineError(f"File not found: {path}")

    try:
        container = av.open(str(path))
    except Exception as exc:  # noqa: BLE001
        raise PipelineError(f"Could not open this file as media: {exc}") from exc

    try:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise NoAudioTrack("This file has no audio track, so there is nothing to transcribe.")
        stream.thread_type = "AUTO"

        resampler = av.audio.resampler.AudioResampler(
            format="s16",
            layout="mono",
            rate=SAMPLE_RATE,
        )

        chunks: list[np.ndarray] = []
        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                array = resampled.to_ndarray()
                if array.size:
                    chunks.append(array.reshape(-1).astype(np.float32) / 32768.0)
        # Flush the resampler buffer.
        for resampled in resampler.resample(None):
            array = resampled.to_ndarray()
            if array.size:
                chunks.append(array.reshape(-1).astype(np.float32) / 32768.0)
    except PipelineError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise PipelineError(f"Could not decode the audio stream: {exc}") from exc
    finally:
        try:
            container.close()
        except Exception:  # noqa: BLE001
            pass

    if not chunks:
        raise NoAudioTrack("The audio stream produced no samples - the file may be corrupt.")

    audio = np.concatenate(chunks).astype(np.float32)
    if audio.size == 0:
        raise NoAudioTrack("The audio stream is empty.")
    return audio


# --- transcription ---------------------------------------------------------


@dataclass
class TranscriptWord:
    start: float
    end: float
    word: str


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str
    words: list[TranscriptWord]


@dataclass
class TranscriptionResult:
    segments: list[TranscriptSegment]
    captions: list[dict[str, Any]]
    language: str | None
    duration: float
    model: str
    elapsed: float
    compute_type: str = COMPUTE_TYPE
    device: str = "cpu"


def transcribe_audio(
    audio: np.ndarray,
    *,
    model_name: str = DEFAULT_MODEL,
    language: str | None = None,
    beam_size: int = 1,
    on_progress: Callable[[float, str], None] | None = None,
    max_chars: int = 42,
    max_lines: int = 2,
    max_duration: float = 6.0,
    min_duration: float = 0.7,
) -> TranscriptionResult:
    """Run Whisper over a mono 16 kHz float32 array."""
    import time

    started = time.time()
    duration = float(audio.size) / SAMPLE_RATE

    if on_progress:
        on_progress(0.02, "Loading model")

    model = load_model(model_name)

    if on_progress:
        on_progress(0.05, "Transcribing")

    try:
        raw_segments, info = model.transcribe(
            audio,
            language=(language or None),
            beam_size=max(1, int(beam_size)),
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 400},
            word_timestamps=True,
            condition_on_previous_text=False,
            temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
        )
    except Exception as exc:  # noqa: BLE001
        raise PipelineError(f"Whisper failed while decoding the speech: {exc}") from exc

    segments: list[TranscriptSegment] = []
    try:
        for seg in raw_segments:
            words = [
                TranscriptWord(start=float(w.start), end=float(w.end), word=str(w.word))
                for w in (seg.words or [])
                if w.start is not None and w.end is not None
            ]
            segments.append(
                TranscriptSegment(
                    start=float(seg.start),
                    end=float(seg.end),
                    text=str(seg.text or "").strip(),
                    words=words,
                )
            )
            if on_progress and duration > 0:
                on_progress(min(0.98, max(0.05, float(seg.end) / duration)), "Transcribing")
    except Exception as exc:  # noqa: BLE001
        raise PipelineError(f"Whisper failed while decoding the speech: {exc}") from exc

    captions = segments_to_captions(
        segments,
        max_chars=max_chars,
        max_lines=max_lines,
        max_duration=max_duration,
        min_duration=min_duration,
    )

    detected = getattr(info, "language", None)
    return TranscriptionResult(
        segments=segments,
        captions=captions,
        language=detected,
        duration=duration,
        model=model_name,
        elapsed=time.time() - started,
    )


# --- caption shaping --------------------------------------------------------


def _chunk_words(
    words: list[TranscriptWord],
    *,
    max_chars: int,
    max_lines: int,
    max_duration: float,
) -> list[list[TranscriptWord]]:
    """Group words into caption-sized blocks."""
    limit = max(8, max_chars * max(1, max_lines))
    blocks: list[list[TranscriptWord]] = []
    current: list[TranscriptWord] = []
    current_len = 0

    for word in words:
        token = word.word.strip()
        if not token:
            continue
        addition = len(token) + (1 if current else 0)
        too_long = current_len + addition > limit
        too_slow = bool(current) and (word.end - current[0].start) > max_duration

        if current and (too_long or too_slow):
            blocks.append(current)
            current = []
            current_len = 0
            addition = len(token)

        current.append(word)
        current_len += addition

    if current:
        blocks.append(current)
    return blocks


def segments_to_captions(
    segments: list[TranscriptSegment],
    *,
    max_chars: int = 42,
    max_lines: int = 2,
    max_duration: float = 6.0,
    min_duration: float = 0.7,
) -> list[dict[str, Any]]:
    """Turn Whisper segments into subtitle-sized lines with real timings.

    Whisper segments are often 10-20 s long with a full sentence. Subtitles
    need short blocks, so we re-split on word boundaries.
    """
    captions: list[dict[str, Any]] = []
    counter = 0

    for segment in segments:
        words = segment.words
        if not words:
            text = segment.text.strip()
            if not text:
                continue
            captions.append(
                {
                    "id": f"c{counter}",
                    "start": round(segment.start, 3),
                    "end": round(max(segment.end, segment.start + min_duration), 3),
                    "text": text,
                }
            )
            counter += 1
            continue

        for block in _chunk_words(
            words,
            max_chars=max_chars,
            max_lines=max_lines,
            max_duration=max_duration,
        ):
            text = " ".join(w.word.strip() for w in block if w.word.strip()).strip()
            if not text:
                continue
            start = float(block[0].start)
            end = float(block[-1].end)
            if end <= start:
                end = start + min_duration
            captions.append(
                {
                    "id": f"c{counter}",
                    "start": round(start, 3),
                    "end": round(end, 3),
                    "text": text,
                }
            )
            counter += 1

    # Merge a very short line into its neighbour when they are adjacent in time.
    merged: list[dict[str, Any]] = []
    for caption in captions:
        if (
            merged
            and (caption["end"] - caption["start"]) < min_duration
            and (caption["start"] - merged[-1]["end"]) < 0.35
        ):
            previous = merged[-1]
            merged[-1] = {
                **previous,
                "end": caption["end"],
                "text": f"{previous['text']} {caption['text']}".strip(),
            }
        else:
            merged.append(caption)

    return merged
