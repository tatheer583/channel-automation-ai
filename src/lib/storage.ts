/**
 * Local persistence.
 *
 * All data lives under a single namespaced key in localStorage. Nothing here
 * touches the network, stores secrets, or persists binary media — video files
 * are re-attached from the user's device each session via videoStore.ts.
 */

import type {
  AppState,
  CaptionStyle,
  Channel,
  ClipJob,
  FormatOptions,
  Prefs,
  ScheduleEntry,
  VideoAsset,
  ActivityEvent,
} from '../types'
import { dateKey, uid } from './format'

const STORAGE_KEY = 'channel-ai:v1'
const MAX_ACTIVITY_ITEMS = 60

export const DEFAULT_CAPTIONS: CaptionStyle = {
  preset: 'bold-pop',
  fontSize: 30,
  fontColor: '#ffffff',
  bgEnabled: true,
  bgColor: '#1a1030',
  bgOpacity: 66,
  position: 'bottom',
}

export const DEFAULT_FORMAT: FormatOptions = {
  aspect: '9:16',
  resolution: '1080p',
  fps: 30,
}

export const DEFAULT_PREFS: Prefs = {
  accent: 'violet',
  density: 'cozy',
  motionReduced: false,
  defaultAspect: '9:16',
}

const MINUTE = 60_000
const DAY = 86_400_000

/** First-run demo content so every screen previews real interactions. */
export function seedAppState(): AppState {
  const now = Date.now()
  const ch1: Channel = {
    id: uid(),
    name: '@aurora-shorts',
    url: 'https://youtube.com/@aurora-shorts',
    kind: 'demo',
    addedAt: now - 4 * DAY,
  }
  const ch2: Channel = {
    id: uid(),
    name: 'MidnightDocs',
    url: 'https://youtube.com/channel/UCdemo-midnight-docs',
    kind: 'demo',
    addedAt: now - 2 * DAY,
  }
  const v1: VideoAsset = {
    id: uid(),
    name: 'Studio Session — Episode 04.mp4',
    size: 248 * 1024 * 1024,
    type: 'video/mp4',
    duration: 612,
    sample: true,
    addedAt: now - 3 * DAY,
  }
  const v2: VideoAsset = {
    id: uid(),
    name: 'Field Footage — City Lights.mp4',
    size: 512 * 1024 * 1024,
    type: 'video/mp4',
    duration: 1024,
    sample: true,
    addedAt: now - 1 * DAY,
  }
  const clip1: ClipJob = {
    id: uid(),
    videoId: v1.id,
    title: 'Opening Hook',
    start: 0,
    end: 30,
    aspect: '9:16',
    status: 'done',
    progress: 100,
    statusSince: now - 2 * DAY,
    createdAt: now - 2 * DAY - 10 * MINUTE,
    updatedAt: now - 2 * DAY + 2 * MINUTE,
  }
  const clip2: ClipJob = {
    id: uid(),
    videoId: v2.id,
    title: 'Skyline Timelapse',
    start: 45,
    end: 75,
    aspect: '1:1',
    status: 'queued',
    progress: 0,
    statusSince: now - 6 * MINUTE,
    createdAt: now - 6 * MINUTE,
    updatedAt: now - 6 * MINUTE,
  }
  const today = new Date()
  const schedule: ScheduleEntry[] = [
    {
      id: uid(),
      clipId: clip1.id,
      date: dateKey(today),
      time: '09:00',
      note: 'Morning slot',
      createdAt: now - 1 * DAY,
    },
    {
      id: uid(),
      clipId: clip2.id,
      date: dateKey(new Date(today.getTime() + 3 * DAY)),
      time: '18:30',
      note: 'Evening post',
      createdAt: now - 1 * DAY,
    },
  ]
  const activity: ActivityEvent[] = [
    { id: uid(), kind: 'clip', message: `Clip "${clip1.title}" completed (simulated processing)`, at: now - 2 * DAY + 2 * MINUTE },
    { id: uid(), kind: 'schedule', message: 'Two demo posts scheduled on the content calendar', at: now - 1 * DAY },
    { id: uid(), kind: 'library', message: `Sample metadata added for "${v2.name}"`, at: now - 1 * DAY },
    { id: uid(), kind: 'channel', message: `Added demo channel ${ch2.name}`, at: now - 2 * DAY },
    { id: uid(), kind: 'system', message: 'Workspace initialized with demo data', at: now - 4 * DAY },
  ]
  return {
    channels: [ch1, ch2],
    videos: [v1, v2],
    clips: [clip1, clip2],
    schedule,
    captions: { ...DEFAULT_CAPTIONS },
    format: { ...DEFAULT_FORMAT },
    prefs: { ...DEFAULT_PREFS },
    activity,
  }
}

interface LoadedShape {
  channels?: unknown
  videos?: unknown
  clips?: unknown
  schedule?: unknown
  captions?: unknown
  format?: unknown
  prefs?: unknown
  activity?: unknown
}

function asArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : []
}

function asObject(input: unknown): Record<string, unknown> {
  return input != null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {}
}

/** Coerce arbitrary parsed JSON into a safe AppState (defaults fill gaps). */
export function sanitizeState(input: unknown): AppState | null {
  if (input == null || typeof input !== 'object') return null
  const raw = input as LoadedShape
  const seed = seedAppState()
  const channels = asArray(raw.channels).filter(
    (c): c is Channel =>
      c != null && typeof c === 'object' && typeof (c as Channel).id === 'string' && typeof (c as Channel).url === 'string',
  )
  const videos = asArray(raw.videos).filter(
    (v): v is VideoAsset =>
      v != null && typeof v === 'object' && typeof (v as VideoAsset).id === 'string' && typeof (v as VideoAsset).name === 'string',
  )
  const clips = asArray(raw.clips).filter((c): c is ClipJob => {
    if (c == null || typeof c !== 'object') return false
    const job = c as Partial<ClipJob>
    return (
      typeof job.id === 'string' &&
      typeof job.videoId === 'string' &&
      typeof job.start === 'number' &&
      typeof job.end === 'number' &&
      (job.status === 'queued' || job.status === 'processing' || job.status === 'done')
    )
  })
  const schedule = asArray(raw.schedule).filter(
    (s): s is ScheduleEntry =>
      s != null && typeof s === 'object' && typeof (s as ScheduleEntry).clipId === 'string' && typeof (s as ScheduleEntry).date === 'string',
  )
  const activity = asArray(raw.activity).filter(
    (a): a is ActivityEvent =>
      a != null && typeof a === 'object' && typeof (a as ActivityEvent).id === 'string' && typeof (a as ActivityEvent).message === 'string',
  )
  const captionRaw = asObject(raw.captions)
  const formatRaw = asObject(raw.format)
  const prefsRaw = asObject(raw.prefs)
  const captions: CaptionStyle = {
    preset: typeof captionRaw.preset === 'string' ? captionRaw.preset : DEFAULT_CAPTIONS.preset,
    fontSize: typeof captionRaw.fontSize === 'number' ? Math.round(captionRaw.fontSize) : DEFAULT_CAPTIONS.fontSize,
    fontColor: typeof captionRaw.fontColor === 'string' ? captionRaw.fontColor : DEFAULT_CAPTIONS.fontColor,
    bgEnabled: typeof captionRaw.bgEnabled === 'boolean' ? captionRaw.bgEnabled : DEFAULT_CAPTIONS.bgEnabled,
    bgColor: typeof captionRaw.bgColor === 'string' ? captionRaw.bgColor : DEFAULT_CAPTIONS.bgColor,
    bgOpacity: typeof captionRaw.bgOpacity === 'number' ? captionRaw.bgOpacity : DEFAULT_CAPTIONS.bgOpacity,
    position: captionRaw.position === 'top' || captionRaw.position === 'center' || captionRaw.position === 'bottom'
      ? captionRaw.position
      : DEFAULT_CAPTIONS.position,
  }
  const format: FormatOptions = {
    aspect: typeof formatRaw.aspect === 'string' ? (formatRaw.aspect as FormatOptions['aspect']) : DEFAULT_FORMAT.aspect,
    resolution: typeof formatRaw.resolution === 'string' ? (formatRaw.resolution as FormatOptions['resolution']) : DEFAULT_FORMAT.resolution,
    fps: typeof formatRaw.fps === 'number' ? (formatRaw.fps as FormatOptions['fps']) : DEFAULT_FORMAT.fps,
  }
  const prefs: Prefs = {
    accent: prefsRaw.accent === 'blue' || prefsRaw.accent === 'teal' || prefsRaw.accent === 'violet' ? prefsRaw.accent : DEFAULT_PREFS.accent,
    density: prefsRaw.density === 'compact' ? 'compact' : prefsRaw.density === 'cozy' ? 'cozy' : DEFAULT_PREFS.density,
    motionReduced: typeof prefsRaw.motionReduced === 'boolean' ? prefsRaw.motionReduced : DEFAULT_PREFS.motionReduced,
    defaultAspect: typeof prefsRaw.defaultAspect === 'string' ? (prefsRaw.defaultAspect as Prefs['defaultAspect']) : DEFAULT_PREFS.defaultAspect,
  }
  // Drop clips/schedule rows whose references vanished during editing elsewhere.
  const videoIds = new Set(videos.map((v) => v.id))
  const clipIds = new Set(clips.map((c) => c.id))
  const cleanClips = clips.filter((c) => videoIds.has(c.videoId))
  const cleanSchedule = schedule.filter((s) => clipIds.has(s.clipId))
  return {
    channels: channels.length > 0 ? channels : seed.channels,
    videos: videos.length > 0 ? videos : seed.videos,
    clips: cleanClips.length > 0 ? cleanClips : seed.clips,
    schedule: cleanSchedule.length > 0 ? cleanSchedule : seed.schedule,
    captions,
    format,
    prefs,
    activity: activity.length > 0 ? activity.slice(0, MAX_ACTIVITY_ITEMS) : seed.activity,
  }
}

/** Load state from localStorage; seeds demo data on first run / bad data. */
export function loadState(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = sanitizeState(JSON.parse(raw))
      if (parsed) return parsed
    }
  } catch {
    // Corrupted or unavailable storage → fall through to the seed.
  }
  return seedAppState()
}

/** Persist the whole state; failures are non-fatal (private mode etc.). */
export function saveState(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage may be full or blocked; the app keeps working in memory.
  }
}

export function clearStorage(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore.
  }
}

export function appendActivity(events: ActivityEvent[], incoming: ActivityEvent): ActivityEvent[] {
  const next = [incoming, ...events.filter((e) => e.id !== incoming.id)]
  return next.slice(0, MAX_ACTIVITY_ITEMS)
}
