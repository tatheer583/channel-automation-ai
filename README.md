# ChannelAI — free, open-source channel automation ✂️📺

**ChannelAI** is a 100% **free and open-source** (MIT) web app that automates the boring
parts of running a video channel: planning clips, auto-splitting long footage into
reels, **rendering them for real in your browser**, writing captions (SRT/VTT),
generating titles/hashtags, and **publishing to YouTube — on your own schedule**.

No subscriptions. No credit meters. No channels limit. No closed source.
Your files never leave your device; the only accounts involved are **your own**
(free Google OAuth you create yourself).

🚀 **Live app:** https://tatheer583.github.io/channel-automation-ai/

---

## How it compares with paid tools

| Feature | Ssemble (ssemble.com) — paid | Assembly (assemble.com) — paid | **ChannelAI — free & open source** |
| --- | --- | --- | --- |
| Price | Pro $9–15/mo · Expert $12–30/mo · Business $24–60/mo (annual) | CRM portal — $39 to $2,000+/mo (different product category) | **$0 — MIT license** |
| Usage metering | Credit system (1 credit ≈ 20 min of footage) — long videos burn credits fast | Seats/contacts metered | **Unlimited** — the only "limit" is your browser's CPU doing it locally |
| Channels per plan | 1–10 depending on tier | n/a | **Unlimited — add as many as you like** |
| Where your files go | Uploaded to their cloud (closed source) | Uploaded to their cloud | **Never leaves your device** — you attach local files, everything runs client-side |
| Clip creation | Cloud clipping | n/a | ✅ **Real in-browser rendering** (canvas crop + MediaRecorder + WebAudio) → real WebM/MP4 file |
| Auto-split long video | On their servers | n/a | ✅ **Local auto-split** — one range → 2–6 equal reel clips in one click |
| Captions | Credit-based AI captions | n/a | ✅ **Manual timed line editor + real SRT/VTT export**, auto-attached to uploads |
| Thumbnails | Generated in cloud | n/a | ✅ **Real frame capture** — persisted thumbnail + full-res PNG download |
| Titles / hashtags | AI templates | n/a | ✅ **Local `{{variable}}` template engine** (no AI fees) |
| Scheduled publishing to YouTube | Included | n/a | ✅ **Real — official YouTube Data API v3, your own free OAuth client** |
| Schedule enforcement | Their cloud runs it | n/a | ✅ **YouTube itself enforces it** (`publishAt`). Upload once; you can close the tab |
| Reminders / daily cadence | In their platform | n/a | ✅ **In-app + system notifications** for 1–2 (or n) posts/day rules |
| Open source | ❌ | ❌ | ✅ **MIT — audit it, fork it, self-host it** |
| What it will *never* do | — | — | Download third-party YouTube videos (ToS) or run hidden AI on your footage |

> Full platform details: Ssemble is a paid cloud service with a credit pool consumed
> by every minute you process; Assembly (`assemble.com`) is a client-portal/CRM
> product (agencies), not a like-for-like competitor — Ssemble is the comparison
> that matters here.

**The honest catch:** ChannelAI can't fetch YouTube's video bytes from another
website (nobody's static app can, and YouTube's terms don't allow it). The flow is:
paste or note the reference video, attach your own copy of the footage once
(for your videos: YouTube Studio → Download), and ChannelAI automates everything
else end-to-end.

---

## Real features in this build

- **Clip Studio** — timestamped clips, aspect ratios (9:16 / 1:1 / 4:5 / 16:9),
  **auto-splitting**, a *simulated* processing queue (clearly labelled as demo),
  and the **real** render path: crop + re-encode in-browser with progress and cancel.
- **Exports** — every render is a real file you can download; session metadata list
  (blob URLs live in memory — re-rendering is free and instant to trigger).
- **Clip editor** — timed caption lines (editable), template preview,
  one-click **SRT / VTT** downloads.
- **Publish to YouTube** — official API upload with progress: title/description/
  hashtags prefilled from templates, category, privacy, **scheduled publishing**
  (private + `publishAt` → YouTube flips it public at your exact time), and
  **auto-attached VTT caption tracks**.
- **Library** — local videos with real previews, duration probing, saved
  thumbnails, frame capture.
- **Calendar** — schedule per clip with date/time and a "due today" overview banner.
- **Posting rules** — e.g. "Morning reel 09:00" + "Evening reel 18:30"; reminders
  ring locally (Notification API), and the actual go-live time rides on YouTube's
  `publishAt`.
- **Settings** — accent/density prefs, **YouTube Connect** (your own OAuth client —
  step-by-step guide included, zero secrets in this repo), data export/import/reset.
- **Performance tracker** — manually logged views/likes/comments per platform,
  stored locally, exportable as CSV (nothing is scraped).
- **Local AI service** (optional, `backend/`) — **real** speech-to-text on your
  own CPU: FFmpeg-style audio decoding + a Whisper model, with word-level
  timings turned into subtitle-sized caption lines. See
  [`docs/STAGE_A.md`](docs/STAGE_A.md).

### Tagged honestly

The processing queue and demo analytics are **simulations with fixed timers**,
labelled everywhere. Streaming marketing-speak stays out: features either run for
real, or are explicitly named as demo.

---

## Local AI service (optional, free, offline)

The browser alone cannot run a good speech-recognition model, so ChannelAI can
talk to a **small local service** you start on your own machine:

```powershell
cd C:\Users\1\Projects\ChannelAI
py -3.11 -m venv backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\backend\start.ps1
```

Then in the app: **Settings → Local AI service → Test connection**, and use
**Transcribe** in the Video Library. Everything else in the app works with or
without it — if the service is off, the app says so instead of pretending.

- **No cloud, no credits, no API keys.** Your media never leaves your machine.
- `faster-whisper` (int8, CPU) — no PyTorch, ~300 MB of dependencies.
- Measured on an i5-8350U (4 cores, no GPU): `base` ≈ 2.8× realtime,
  `tiny` ≈ 5.3× realtime.
- Full setup, troubleshooting and limits: [`docs/STAGE_A.md`](docs/STAGE_A.md).

---

## The YouTube pipeline (no backend, no secrets)

1. **Attach your file** in the Video Library (your own footage or a licensed copy).
2. **Clip / auto-split** it in Clip Studio → press **Render** → a real video file.
3. **Edit captions** in the clip editor (SRT/VTT ready).
4. Press **Publish** → connect with *your* free OAuth Client ID → pick
   **Private + scheduled time** → ChannelAI uploads via the official API.
5. YouTube publishes it at the exact date/time — daily 1 or 2 reels on autopilot.

Quota math: the free YouTube API default (10,000 units/day; upload = 1,600) allows
~6 uploads/day — far beyond a 1–2/day cadence. Google has confirmed unverified
projects may schedule `publishAt` releases; we cite this in `docs/RESEARCH.md`.

## Tech

- React 19 + TypeScript + Vite 8
- CSS3 design system (no UI framework), lucide icons
- Hash routing (deep links work on GitHub Pages sub-paths)
- No backend, no API keys committed, no hard-coded secrets, localStorage persistence

## Getting started

```bash
npm install     # dependencies
npm run dev     # dev server → http://localhost:5173
npm run build   # type-checks (tsc -b) and bundles to dist/
npm run preview # serve the production build locally
```

## Deploy to GitHub Pages

A workflow (`.github/workflows/deploy.yml`) builds and deploys on every push to
`main`:

1. Push this repo to GitHub (default branch `main`).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Pushes deploy automatically to `https://<user>.github.io/<repo>/`.

`base: './'` keeps assets relative; hash routing keeps reloads stable.

## Data & privacy

- Workspace data lives under localStorage key `channel-ai:v1`; video/binary media
  is re-attached from disk each session (object URLs can't persist).
- **Metadata persisted:** channels, videos, clips, captions, templates, rules,
  thumbnails, stats. **Never persisted:** video bytes and your OAuth token
  (kept in tab memory only).
- Settings → Data management exports/imports/resets the workspace as JSON.

## License

MIT — see [LICENSE](./LICENSE). Fork it, self-host it, strip out whatever you need.
