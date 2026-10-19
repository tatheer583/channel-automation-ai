"""ChannelAI local service.

A small FastAPI app that runs on the developer's own machine and does the
things a browser cannot do well: decode media with FFmpeg and run a real
speech-recognition model.

The React frontend talks to this service over ``http://127.0.0.1:8000``. It is
a *local* tool: while this service is running, only browsers on this machine
(and only while this process is alive) can use it. Nothing here is a public
API and nothing is uploaded anywhere.

Endpoints
---------
GET  /api/health            -> service + model status (no side effects)
POST /api/transcribe        -> queue a transcription job, returns a job id
GET  /api/jobs/{job_id}     -> job progress / result / error
"""

from __future__ import annotations

import os
import shutil
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from pipeline import (
    DEFAULT_MODEL,
    KNOWN_MODELS,
    PipelineError,
    compute_type_name,
    transcribe_audio,
    decode_audio,
    model_is_loaded,
    unload_models,
)

SERVICE_NAME = "channelai-local"
SERVICE_VERSION = "0.1.0"

#: Uploads are streamed to a temp file; keep the ceiling explicit.
MAX_UPLOAD_MB = int(os.environ.get("CHANNELAI_MAX_UPLOAD_MB", "1024"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

#: Jobs (and their temp files) are dropped after this long.
JOB_TTL_SECONDS = 60 * 60

#: Optional shared token. When set, requests must send X-ChannelAI-Token.
API_TOKEN = os.environ.get("CHANNELAI_TOKEN", "").strip()

#: Work directory for uploaded files. Defaults to the OS temp folder.
WORK_DIR = Path(os.environ.get("CHANNELAI_WORK_DIR", tempfile.gettempdir())) / "channelai"

app = FastAPI(title="ChannelAI Local Service", version=SERVICE_VERSION)

# The frontend is served from a different origin (GitHub Pages or the Vite dev
# server), so the browser sends a cross-origin request. Allowed origins can be
# narrowed with CHANNELAI_ALLOWED_ORIGINS (comma separated) if desired.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        o.strip()
        for o in os.environ.get("CHANNELAI_ALLOWED_ORIGINS", "*").split(",")
        if o.strip()
    ] or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-ChannelAI-Token"],
)


# --- job model -------------------------------------------------------------


@dataclass
class Job:
    id: str
    filename: str
    status: str = "queued"  # queued | working | done | error
    stage: str = "Queued"
    message: str = ""
    progress: float = 0.0
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    result: dict[str, Any] | None = None
    error: str | None = None
    path: Path | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.id,
            "filename": self.filename,
            "status": self.status,
            "stage": self.stage,
            "message": self.message,
            "progress": round(self.progress, 4),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "result": self.result,
            "error": self.error,
        }


_jobs: dict[str, Job] = {}
_jobs_lock = threading.Lock()


def _update(job_id: str, **fields: Any) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            return
        for key, value in fields.items():
            setattr(job, key, value)
        job.updated_at = time.time()


def _sweep_jobs() -> None:
    """Drop expired jobs and delete their temp files."""
    cutoff = time.time() - JOB_TTL_SECONDS
    with _jobs_lock:
        stale = [j for j in _jobs.values() if j.updated_at < cutoff]
        for job in stale:
            _jobs.pop(job.id, None)
    for job in stale:
        if job.path is not None:
            try:
                job.path.unlink(missing_ok=True)
            except OSError:
                pass


# --- auth (optional) --------------------------------------------------------


@app.middleware("http")
async def token_guard(request: Request, call_next):
    """Reject requests that do not carry the optional local token."""
    if API_TOKEN and request.url.path.startswith("/api/"):
        provided = request.headers.get("x-channelai-token", "")
        if provided != API_TOKEN:
            return JSONResponse(
                status_code=401,
                content={"error": "Missing or wrong X-ChannelAI-Token header."},
            )
    return await call_next(request)


# --- routes -----------------------------------------------------------------


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Report what this service can actually do right now."""
    _sweep_jobs()
    cached = _hf_cache_dir()
    return {
        "ok": True,
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "device": "cpu",
        "compute_type": compute_type_name(),
        "default_model": DEFAULT_MODEL,
        "known_models": list(KNOWN_MODELS),
        "model_loaded": model_is_loaded(DEFAULT_MODEL),
        "model_cached": cached,
        "max_upload_mb": MAX_UPLOAD_MB,
        "token_required": bool(API_TOKEN),
        "ffmpeg": "bundled (PyAV)",
        "work_dir": str(WORK_DIR),
    }


@app.post("/api/transcribe")
async def start_transcription(
    request: Request,
    file: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL),
    language: str = Form("auto"),
    beam_size: int = Form(1),
    max_chars: int = Form(42),
    max_lines: int = Form(2),
) -> dict[str, Any]:
    """Queue a transcription job. Returns immediately with a job id."""
    _sweep_jobs()
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    job_id = uuid.uuid4().hex
    suffix = Path(file.filename or "upload").suffix or ".bin"
    target = WORK_DIR / f"{job_id}{suffix}"

    written = 0
    try:
        with target.open("wb") as sink:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File is larger than the {MAX_UPLOAD_MB} MB limit.",
                    )
                sink.write(chunk)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    except Exception as exc:  # noqa: BLE001
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Could not store the upload: {exc}") from exc
    finally:
        await file.close()

    if written == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="The uploaded file was empty.")

    job = Job(id=job_id, filename=file.filename or target.name, path=target)
    with _jobs_lock:
        _jobs[job_id] = job

    worker = threading.Thread(
        target=_run_transcription,
        args=(job_id, target, model, language, beam_size, max_chars, max_lines),
        daemon=True,
    )
    worker.start()

    return {"job_id": job_id, "status": job.status, "filename": job.filename}


def _run_transcription(
    job_id: str,
    path: Path,
    model_name: str,
    language: str,
    beam_size: int,
    max_chars: int,
    max_lines: int,
) -> None:
    """Worker body: decode -> transcribe -> store result."""
    try:
        _update(job_id, status="working", stage="Extracting audio", message="Decoding the media file", progress=0.01)
        audio = decode_audio(path)

        _update(
            job_id,
            stage="Loading model",
            message=f"Loading Whisper '{model_name}' (first run downloads it)",
            progress=0.03,
        )

        def on_progress(fraction: float, stage: str) -> None:
            _update(job_id, progress=fraction, stage=stage, message=stage)

        result = transcribe_audio(
            audio,
            model_name=model_name,
            language=None if language in ("", "auto", "none") else language,
            beam_size=beam_size,
            on_progress=on_progress,
            max_chars=max_chars,
            max_lines=max_lines,
        )

        payload = {
            "captions": result.captions,
            "segments": [
                {"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text}
                for s in result.segments
            ],
            "language": result.language,
            "duration": round(result.duration, 2),
            "model": result.model,
            "elapsed": round(result.elapsed, 2),
            "compute_type": result.compute_type,
            "device": result.device,
            "caption_count": len(result.captions),
        }
        _update(
            job_id,
            status="done",
            stage="Done",
            message=f"{len(result.captions)} caption lines in {result.elapsed:.1f}s",
            progress=1.0,
            result=payload,
        )
    except PipelineError as exc:
        _update(job_id, status="error", stage="Failed", message=str(exc), error=str(exc))
    except Exception as exc:  # noqa: BLE001
        message = f"{type(exc).__name__}: {exc}"
        _update(job_id, status="error", stage="Failed", message=message, error=message)
    finally:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str) -> dict[str, Any]:
    """Poll a job's progress."""
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job id (it may have expired).")
    return job.as_dict()


@app.delete("/api/jobs/{job_id}")
def cancel_job(job_id: str) -> dict[str, Any]:
    """Forget a job and delete its temp file. Running work is not interrupted."""
    with _jobs_lock:
        job = _jobs.pop(job_id, None)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job id.")
    if job.path is not None:
        try:
            job.path.unlink(missing_ok=True)
        except OSError:
            pass
    return {"ok": True}


@app.post("/api/shutdown")
def shutdown() -> dict[str, Any]:
    """Release the Whisper model from RAM (it reloads on the next request)."""
    unload_models()
    return {"ok": True, "message": "Model unloaded."}


def _hf_cache_dir() -> dict[str, bool]:
    """Which Whisper sizes are already downloaded (offline-ready)."""
    cache_root = Path(
        os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")
    )
    hub = cache_root / "hub"
    result: dict[str, bool] = {}
    for name in KNOWN_MODELS:
        folder = hub / f"models--Systran--faster-whisper-{name}"
        result[name] = folder.exists()
    return result


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("CHANNELAI_HOST", "127.0.0.1"),
        port=int(os.environ.get("CHANNELAI_PORT", "8000")),
    )
