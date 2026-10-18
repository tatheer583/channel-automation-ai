# ChannelAI — AI Channel Automation Platform (demo)

A polished, local-first demo workspace for planning channel automation workflows:
overviews, channel links, a video library with real local previews, a simulated
Clip Studio queue, caption/style templates, a content calendar, and settings.

**No backend, no API keys, no network calls.** All demo data and preferences live
in your browser's `localStorage`. "Processing" indicators are clearly labelled
simulations — downloading, rendering, caption AI and publishing require future
integrations and are intentionally not simulated as real.

## Tech

- React 19 + TypeScript + Vite 8
- CSS3 (custom design system, no UI framework)
- lucide-react icons
- Hash-based client routing (no extra dependency — works on GitHub Pages sub-paths)

## Getting started

```powershell
npm install     # install dependencies
npm run dev     # start the dev server → http://localhost:5173
```

## Production build & local preview

```powershell
npm run build   # type-checks (tsc -b) and bundles into dist/
npm run preview # serve the dist/ build locally
```

## Deploy to GitHub Pages

The repo ships with a GitHub Actions workflow (`.github/workflows/deploy.yml`)
that builds and deploys on every push to `main`:

1. Push this project to a GitHub repository (default branch: `main`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` triggers **Deploy to GitHub Pages** and publishes `dist/`.

The site will be served at `https://<user>.github.io/<repo>/`. Vite is configured
with `base: './'` (relative asset paths), so the build works from any sub-path;
hash routing (`#/overview`, `#/channels`, …) keeps deep links reload-free.

## Data & privacy

- Everything is stored under the localStorage key `channel-ai:v1`.
- Video *metadata* is persisted; the binary files stay on your device and are
  re-attached per session (object URLs cannot be persisted).
- Use **Settings → Data management** to export/import/reset the demo workspace.
