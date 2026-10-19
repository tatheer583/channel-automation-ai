# ChannelAI — Deep Research Notes (Oct 2026)

Findings behind the v0.2/v0.3 "real automation" architecture. Everything below was
verified against official Google/YouTube documentation and Google's issue tracker.

## 1. Scheduled publishing is REAL without a backend ✅

`videos.insert` accepts `status.publishAt` **if `privacyStatus = "private"`** and the
video has never been published (ISO-8601 date-time). YouTube itself flips the video
to public at that instant — no app running needed.

- Google issue tracker (572863050, answered 2026-10): unverified API projects are
  **no longer** restricted to private-viewing mode, and "an unaudited API project can
  successfully schedule a private video for public release using `status.publishAt`,
  and YouTube will honor that scheduled release."
- Past `publishAt` → video publishes immediately (useful for "publish now" fallback).
- Implication: ChannelAI uploads as private+publishAt = competitor-style "post daily
  at 09:00" with **zero servers**. Quota cost per upload: 1,600 units of the free
  10,000/day default → ≈6 uploads/day is the practical ceiling (plenty for 1–2
  reels/day) unless the project requests more quota.

## 2. Browser-only YouTube OAuth (no backend, no secret) ✅

Google Identity Services **token model** (`initTokenClient` + `requestAccessToken`)
is Google's recommended path for apps with no backend:

- Access token returned to the JS callback; ~1 h lifetime; re-request on 401 (needs
  a user gesture — our Publish button qualifies; keep "Connect" click purely
  gesture-driven).
- `prompt: ''` shows consent only the first time; popup flow only (older redirect
  flows are deprecated/discouraged).
- Scopes used: `youtube.upload` (upload + captions) + `youtube.force-ssl`
  (caption-track management for owned videos).
- **Origin registration is strict** — the user's Google Cloud OAuth client (Web
  application type) must list JavaScript origins with NO path/query:
  - `https://tatheer583.github.io` (production)
  - `http://localhost:5173` (dev; localhost is exempt from the HTTPS rule)
  Missing origin ⇒ `origin_mismatch`. This must be explained step-by-step in the
  Settings card (it is the #1 support issue).
- Token is kept in memory only (`tokenRef`), client ID (not a secret) in localStorage.

## 3. Captions attach (pending live test)

`captions.insert` (upload URI + `part=snippet`) attaches a real VTT track to an
owned video. Community reports indicate browser `FormData` (JSON metadata part +
media part) works against the media-upload endpoint. Plan: verify during the first
live publish; if rejected, fall back to `multipart/related` built via a `Blob` +
`Content-Type: multipart/related; boundary=…`.

## 4. YouTube download boundary (legal/architecture note)

A static web app cannot fetch YouTube video bytes client-side (CORS + YouTube ToS).
ChannelAI's honest boundary:

- Reference video links (own videos or licensed copies): user attaches the file
  once (YouTube Studio → Download for own videos). Encode/export of "the original"
  via studio UI is allowed by YouTube for one's own channel.
- Everything after attach is fully automated: crop/clip → captions → title/desc/
  hashtags → publish + schedule → reminder rules.
- Never ship/download yt-dlp-style fetchers in the product.

## 5. Policy small-print worth supporting later

- `status.selfDeclaredMadeForKids` must be declared on insert (we send `false`).
- New `status.containsSyntheticMedia` disclosure exists for altered/synthetic media
  (Oct 2026 viewCount change note also visible on docs). Add an optional checkbox
  in the Publish dialog beforeit ships publicly.
- `statistics.viewCount` definition change (2026-08-24): counts at play start —
  affects our manual stats labels; keep our tracker labeled "your own recording".

## 6. Ssemble comparison facts (README table)

- Ssemble paid tiers (annual): Pro $9–15/mo, Expert $12–30/mo, Business $24–60/mo;
  credit system (1 credit = 20 min) means long videos eat credits fast; channel count
  capped by plan (1–10); cloud closed-source service.
- ChannelAI: 100% free, MIT open-source, runs locally in the browser, unlimited
  channels (as many as you add), no credits — browser CPU time is the only limit.
  Real features not credit-gated: real render/export, real scheduled publishing via
  YouTube publishAt, SRT/VTT captions, thumbnails, templates, CSV tracker.

---

## Tomorrow's TODO (v0.3 UI wave)

1. **Studio** — per-clip buttons: `Render (real)` with progress + cancel, `Auto-split
   into N clips`, clip-editor modal (caption line timeline + SRT/VTT download +
   template preview/apply), Exports card with download/copy and `Publish to YouTube`
   dialog (template-prefilled snippet, privacy + publishAt = keep private&schedule,
   category select, attach-captions checkbox, live upload progress + cancel,
   result link to youtu.be/<id>).
2. **Settings** — YouTube Connect card: client-id input, connect/disconnect,
   connected-channel chip, step-by-step "create your OAuth client" helper (origins
   `https://tatheer583.github.io` + `http://localhost:5173`), reminders toggle +
   Notification permission button, posting-rules manager (name + HH:MM, enable).
3. **Library** — thumbnail capture (persisting dataURL preview) + full-size PNG
   download per video; attach-file affordance for YouTube-source metadata rows.
4. **Overview** — onboarding checklist (add channel → add video → edit captions →
   render → connect YouTube → set rule), performance tracker card (manual stats +
   CSV export), due-today banner.
5. **Captions page** — Text templates editor card (edit default templates, live
   `{{var}}` preview).
6. CSS for all the above; `npm run build`; README rewrite (comparison table) +
   MIT LICENSE + `package.json` version 0.3.0; commit, push, live-site check.

## Known-good facts

- Build passes with v0.3 foundation (tsc strict, vite 8). Commit `b3d786c`.
- Live site: https://tatheer583.github.io/channel-automation-ai/
- GitHub Pages auto-deploys on push to `main` (workflow build).
