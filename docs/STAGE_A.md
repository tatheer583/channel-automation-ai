# Stage A — the local AI service (real transcription, no cloud)

This is the guide for running ChannelAI's speech-to-text on your own Windows
machine. Everything in it is free and offline after the first model download.

---

## 1. What this actually does (and what it does not)

| | |
| --- | --- |
| **Real** | Speech → text with timestamps, produced by a Whisper model running on your CPU |
| **Real** | Audio extraction from any video (FFmpeg, bundled inside PyAV) |
| **Real** | Subtitle-sized caption lines that export to real SRT / VTT files |
| **Real** | Progress reporting (upload %, then the model's own stages) |
| **Not real** | Nothing here is simulated. If the service is off, the app says so. |

**It is not a hosted service.** The backend is a program on your laptop. It is
reachable only from browsers running on the same machine, and only while the
process is alive. The GitHub Pages site does not host it and cannot.

---

## 2. Requirements

| Item | Requirement | Notes |
| --- | --- | --- |
| Python | 3.11 or newer | Already on this machine (`uv`-managed CPython 3.11.15) |
| RAM | ~700 MB free while transcribing | Close Chrome first — it was using 2.5 GB |
| Disk | ~520 MB | venv 303 MB + Whisper models 216 MB (both `tiny` and `base`) |
| GPU | **Not needed** | Everything runs on the CPU, `int8` quantised |
| Internet | Only for the first model download | After that it works offline |

---

## 3. One-time setup

Open **PowerShell** (press `Win`, type `powershell`, Enter).

```powershell
cd C:\Users\1\Projects\ChannelAI

# 1. Create the virtual environment (a private copy of Python for this project)
py -3.11 -m venv backend\.venv

# 2. Install the backend packages
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Expected output ends with:

```
Successfully installed fastapi-0.149.0 faster-whisper-1.2.1 uvicorn-0.54.0 ...
```

> **If `py` is not recognised:** the Python launcher may not be on your PATH in
> that window. Use the full path instead:
> ```powershell
> & "C:\Users\1\AppData\Roaming\uv\python\cpython-3.11.15-windows-x86_64-none\python.exe" -m venv backend\.venv
> ```

> **Do not install PyTorch.** `faster-whisper` does not need it, and PyTorch
> alone is ~2.5 GB — bigger than the free space on your C: drive.

---

## 4. Starting the service

```powershell
cd C:\Users\1\Projects\ChannelAI
.\backend\start.ps1
```

You should see:

```
ChannelAI local service starting on http://127.0.0.1:8000
Press Ctrl+C to stop it.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

**Leave that window open.** Closing it stops the service (and the app will
honestly report "the local AI service is not reachable").

### Starting the frontend (second window)

```powershell
cd C:\Users\1\Projects\ChannelAI
npm run dev
```

Open <http://localhost:5173>.

---

## 5. Using it

1. **Settings → Local AI service → Test connection.**
   You should see `channelai-local v0.1.0 — cpu / int8`. If it says
   *not reachable*, the service is not running — go back to step 4.

2. **Pick a model.**
   - `base` — recommended for Urdu + English. Measured **2.8× realtime** here.
   - `tiny` — faster (**5.3×**) but noticeably worse on Urdu.
   - Language: `Auto` for mixed content, or pin `Urdu` / `English`.

3. **Video Library → drop a video in → press Transcribe.**
   The modal shows the real upload percentage, then the real stage names
   (`Extracting audio` → `Loading model` → `Transcribing`).

   The **first run downloads the model** (~145 MB for `base`). That is why the
   first transcription is slow. Later runs use the cache and are ~3× faster
   than the audio length.

4. **Clip Studio → open a clip → Apply video transcript.**
   The transcript lines inside the clip's range are copied in and re-based to
   the clip's first frame.

5. **Download SRT / VTT** from the same editor. Those are real subtitle files.

---

## 6. Measured on this machine

HP laptop, i5-8350U (4 cores / 8 threads), 8 GB RAM, **no GPU**.

| Model | Speed | 1-minute clip | 10-minute clip | Notes |
| --- | --- | --- | --- | --- |
| `tiny` | 5.3× realtime | ~11 s | ~1 min 53 s | Fastest; weaker on Urdu |
| `base` | 2.8× realtime | ~21 s | ~3 min 34 s | **Recommended for Urdu + English** |
| `small` | ~0.8× realtime | ~1 min 15 s | ~12 min | Best accuracy, slow here |

Peak RAM for the service: **~340 MB** working set (2.1 GB private / reserved).
Disk added so far: **520 MB**.

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `The local AI service is not reachable` | Service not running | Start it (`.\backend\start.ps1`) and press **Test connection** again |
| `401` / token errors | `CHANNELAI_TOKEN` is set on the service but not in Settings | Copy the same token into Settings → Local AI service → Local token |
| `This file has no audio track` | The video is silent | Pick a file with speech; the service refuses to invent words |
| `Could not load Whisper model` | First download failed / offline | Check internet, then retry. The model caches to `%USERPROFILE%\.cache\huggingface` |
| Very slow first transcription | Downloading the model | Normal — it is a one-time ~145 MB download |
| `uvicorn: command not found` | venv not activated | Use the full path: `.\backend\.venv\Scripts\python.exe -m uvicorn app:app --app-dir backend --port 8000` |
| PowerShell blocks `start.ps1` | Execution policy | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that window |
| CORS error in the browser console | Service on a different port | Set the address in Settings to match the port you started it on |

---

## 8. Security & privacy

- **Your media never leaves the machine.** The browser uploads it to
  `http://127.0.0.1:8000` — a process on your own laptop.
- Uploaded files are written to `%TEMP%\channelai` and **deleted as soon as the
  job finishes** (success or failure).
- The service binds to `127.0.0.1` only, so it is not reachable from the
  network or from other devices.
- CORS is open (`*`) by default because the frontend runs on a different
  origin (GitHub Pages). To restrict it, start the service with
  `$env:CHANNELAI_ALLOWED_ORIGINS="http://localhost:5173"` before running it.
- Set `CHANNELAI_TOKEN` to require a shared token for every request.
- Nothing is written to the repository. The venv is git-ignored.

---

## 9. Honest limitations

- **The service is per-machine.** It is not "online platform" software and is
  not meant to be exposed publicly.
- **Transcripts are stored in `localStorage`**, capped at 3000 lines per video.
  A very long video can fill the browser's storage quota; the app degrades
  gracefully (it keeps working in memory) but old transcripts may not persist.
- **Rendering is still browser-based.** The in-browser renderer is real-time
  (a 30 s clip takes 30 s) and outputs WebM. Server-side FFmpeg clipping to
  MP4 is the next milestone, not this one.
- **The clip queue animation is still simulated** in Clip Studio; the actual
  render and the transcription are real.
- **Whisper is not perfect**, especially on Urdu, background noise and fast
  speech. Always read the transcript before publishing — that is what the
  caption editor is for.

---

## 10. Where things live

| Path | What it is |
| --- | --- |
| `backend/app.py` | The HTTP service (routes, jobs, CORS, token guard) |
| `backend/pipeline.py` | Audio decoding + Whisper + caption splitting |
| `backend/start.ps1` | One-line launcher |
| `backend/requirements.txt` | Pinned Python dependencies |
| `src/lib/backend.ts` | Browser-side client for the service |
| `src/pages/Settings.tsx` | The "Local AI service" card |
| `src/pages/Library.tsx` | The Transcribe action + progress modal |
| `src/pages/Studio.tsx` | "Apply video transcript" |

---

## 11. Next milestones (Stage A, in order)

1. Server-side FFmpeg clipping → fast, frame-accurate MP4 with burned-in
   subtitles (replaces the real-time browser render).
2. Replace the simulated clip queue with real backend progress.
3. AI-assisted titles/descriptions from the transcript (local template engine
   first, optional LLM later).
4. Auto-clipping: pick the most "quotable" moments from the transcript.
5. Stage B: hosting the backend, then YouTube OAuth publishing.
