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

export interface Prefs {
  accent: AccentId
  density: DensityId
  motionReduced: boolean
  defaultAspect: AspectId
}

export type ActivityKind =
  | 'channel'
  | 'library'
  | 'clip'
  | 'schedule'
  | 'captions'
  | 'settings'
  | 'system'

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  message: string
  at: number
}

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  kind: ToastKind
  title: string
  detail?: string
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
}
