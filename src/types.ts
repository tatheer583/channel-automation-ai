/** Core domain types for the ChannelAI demo workspace. */

export type AspectId = '9:16' | '1:1' | '16:9' | '4:5'
export type AccentId = 'violet' | 'blue' | 'teal'
export type DensityId = 'cozy' | 'compact'
export type ResolutionId = '720p' | '1080p' | '1440p'
export type FpsId = 24 | 30 | 60
export type ClipStatus = 'queued' | 'processing' | 'done'

export interface Channel {
  id: string
  name: string
  url: string
  kind: 'demo' | 'user'
  addedAt: number
}

export interface VideoAsset {
  id: string
  name: string
  size: number
  type: string
  /** Duration in seconds, when known. Probed locally from the file. */
  duration: number | null
  /** True for seeded sample metadata that has no local file attached. */
  sample: boolean
  addedAt: number
  /** Small JPEG dataURL captured from the local file (persisted, ~10–30 KB). */
  thumb?: string
  /** Real speech-to-text result produced by the local AI service. */
  transcript?: VideoTranscript
}

/**
 * A real transcript produced by the local Whisper service. `captions` are
 * already split into subtitle-sized lines with timings, ready for the
 * existing SRT/VTT export path.
 */
export interface VideoTranscript {
  captions: CaptionLine[]
  /** Detected language code, or null when it could not be determined. */
  language: string | null
  /** Length of the decoded audio in seconds. */
  duration: number
  /** Which Whisper model produced it. */
  model: string
  /** Wall-clock seconds the transcription took. */
  elapsed: number
  /** epoch ms when the transcript was created. */
  transcribedAt: number
}

export interface CaptionLine {
  id: string
  /** seconds */
  start: number
  /** seconds */
  end: number
  text: string
}

export interface ClipJob {
  id: string
  videoId: string
  title: string
  start: number
  end: number
  aspect: AspectId
  status: ClipStatus
  /** 0–100. Meaningful only while processing (simulated). */
  progress: number
  /** epoch ms when the current status was entered. */
  statusSince: number
  createdAt: number
  updatedAt: number
  /** Hand-authored caption lines for the clip (for SRT/VTT export + preview). */
  captionLines?: CaptionLine[]
}

export interface ScheduleEntry {
  id: string
  clipId: string
  /** Local date key, YYYY-MM-DD. */
  date: string
  /** Local time, HH:MM (24h). Empty string = unspecified. */
  time: string
  note: string
  createdAt: number
}

export type CaptionPosition = 'top' | 'center' | 'bottom'

export interface CaptionStyle {
  preset: string
  fontSize: number
  fontColor: string
  bgEnabled: boolean
  bgColor: string
  /** 0–100 opacity for the caption background bubble. */
  bgOpacity: number
  position: CaptionPosition
}

export interface FormatOptions {
  aspect: AspectId
  resolution: ResolutionId
  fps: FpsId
}

export interface TextTemplate {
  id: string
  label: string
  title: string
  description: string
  hashtags: string
}

export interface Prefs {
  accent: AccentId
  density: DensityId
  motionReduced: boolean
  defaultAspect: AspectId
  reminders: boolean
  /** Base URL of the local AI service (FastAPI) running on this machine. */
  backendUrl: string
  /** Optional token for the local service. Only needed if CHANNELAI_TOKEN is set. */
  backendToken: string
  /** Whisper model size used for transcription (tiny / base / small / ...). */
  whisperModel: string
  /** Language hint for Whisper: 'auto', 'ur', 'en', ... */
  transcribeLanguage: string
}

/**
 * A cross-platform performance snapshot the user records themselves.
 * Views/likes/comments are entered manually — nothing is scraped.
 */
export interface TrackStat {
  id: string
  clipId: string
  /** e.g. "TikTok", "YouTube Shorts" — free text label. */
  label: string
  views: number
  likes: number
  comments: number
  /** Local date key YYYY-MM-DD. */
  date: string
}

export type ActivityKind =
  | 'channel'
  | 'library'
  | 'clip'
  | 'schedule'
  | 'captions'
  | 'settings'
  | 'export'
  | 'system'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  message: string
  at: number
}

/** Metadata for a clip rendered in-browser this session (blob lives in memory). */
export interface ExportEntry {
  id: string
  clipId: string
  name: string
  size: number
  mime: string
  aspect: AspectId
  createdAt: number
}

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  kind: ToastKind
  title: string
  detail?: string
}

/** Connected Google/YouTube channel info (no secrets persisted — token is ephemeral). */
export interface YtChannelInfo {
  id: string
  title: string
  customUrl: string
  thumb: string
}

/**
 * A recurring posting rule. Rules ring a local reminder while the app is
 * open; the actual upload publishes as private with a YouTube-side publishAt
 * so the video goes live at the exact time regardless of the tab.
 */
export interface AutoPostRule {
  id: string
  /** Label e.g. "Daily morning reel". */
  name: string
  /** Local time HH:MM. */
  time: string
  enabled: boolean
  createdAt: number
  /** epoch ms of the last triggered reminder (persisted). */
  lastFiredAt: number | null
}

export interface AppState {
  channels: Channel[]
  videos: VideoAsset[]
  clips: ClipJob[]
  schedule: ScheduleEntry[]
  captions: CaptionStyle
  format: FormatOptions
  prefs: Prefs
  activity: ActivityEvent[]
  textTemplates: TextTemplate[]
  /** Google OAuth client id the USER supplies (never hard-coded). Empty = not configured. */
  ytClientId: string
  /** Persisted, non-secret info about the currently connected channel. */
  ytChannel: YtChannelInfo | null
  rules: AutoPostRule[]
  stats: TrackStat[]
}
