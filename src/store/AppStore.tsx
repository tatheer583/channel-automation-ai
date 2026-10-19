/**
 * Global app store: state, actions, toasts, the simulated clip-processing
 * ticker, REAL in-browser clip rendering/export, real YouTube publishing
 * (BYO OAuth client id), posting rules with local reminders, templates,
 * thumbnails, captions and performance tracking.
 *
 * Everything persists to localStorage; binary media lives in memory and is
 * re-attached from the user's device each session.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  ActivityEvent,
  ActivityKind,
  AppState,
  CaptionLine,
  CaptionStyle,
  Channel,
  ClipJob,
  ExportEntry,
  FormatOptions,
  Prefs,
  ScheduleEntry,
  TextTemplate,
  ToastItem,
  ToastKind,
  TrackStat,
  VideoAsset,
  VideoTranscript,
  AspectId,
  AutoPostRule,
  YtChannelInfo,
} from '../types'
import { appendActivity, clearStorage, loadState, saveState, sanitizeState } from '../lib/storage'
import { analyzeChannelUrl, dateKey, formatClock, parseTimestamp, uid } from '../lib/format'
import { attachVideo, getAttachedUrl, isSupportedVideoType, probeDuration, releaseAll, releaseVideo } from '../lib/videoStore'
import { captureFrameBlob, captureFrameDataUrl, renderClip } from '../lib/recorder'
import { buildSrt, buildVtt, downloadBlob, downloadText } from '../lib/fileExport'
import * as yt from '../lib/youtube'
import * as backend from '../lib/backend'

const MAX_TOASTS = 4
const TOAST_LIFETIME_MS = 4200
const QUEUED_DELAY_MS = 1800
/** Progress units per ms → a full simulation takes ≈ 9 s. */
const PROGRESS_RATE = 0.011
const MAX_VIDEO_SIZE = 512 * 1024 * 1024
const REMINDER_TICK_MS = 20_000

type Action =
  | { type: 'channel-add'; channel: Channel; event?: ActivityEvent }
  | { type: 'channel-remove'; id: string; event?: ActivityEvent }
  | { type: 'video-add'; video: VideoAsset; event?: ActivityEvent }
  | {
      type: 'video-update'
      id: string
      patch: Partial<Pick<VideoAsset, 'name' | 'size' | 'type' | 'duration' | 'sample' | 'thumb'>>
      event?: ActivityEvent
    }
  | { type: 'video-remove'; id: string; event?: ActivityEvent }
  | { type: 'video-transcript'; id: string; transcript: VideoTranscript; event?: ActivityEvent }
  | { type: 'clip-add'; clip: ClipJob; event?: ActivityEvent }
  | { type: 'clip-remove'; id: string; event?: ActivityEvent }
  | { type: 'clips-clear-done'; event?: ActivityEvent }
  | { type: 'schedule-add'; entry: ScheduleEntry; event?: ActivityEvent }
  | { type: 'schedule-remove'; id: string; event?: ActivityEvent }
  | { type: 'captions-set'; patch: Partial<CaptionStyle>; event?: ActivityEvent }
  | { type: 'format-set'; patch: Partial<FormatOptions>; event?: ActivityEvent }
  | { type: 'prefs-set'; patch: Partial<Prefs>; event?: ActivityEvent }
  | { type: 'templates-set'; templates: TextTemplate[]; event?: ActivityEvent }
  | { type: 'yt-set'; clientId: string; channel: YtChannelInfo | null; event?: ActivityEvent }
  | { type: 'rule-add'; rule: AutoPostRule; event?: ActivityEvent }
  | { type: 'rule-remove'; id: string; event?: ActivityEvent }
  | { type: 'rule-toggle'; id: string; enabled: boolean; event?: ActivityEvent }
  | { type: 'rule-fired'; id: string; at: number; event?: ActivityEvent }
  | { type: 'clip-captions'; id: string; lines: CaptionLine[]; event?: ActivityEvent }
  | { type: 'clip-status'; id: string; status: 'done'; at: number; event?: ActivityEvent }
  | { type: 'stat-add'; stat: TrackStat; event?: ActivityEvent }
  | { type: 'stat-remove'; id: string; event?: ActivityEvent }
  | { type: 'replace'; state: AppState; event?: ActivityEvent }
  | { type: 'tick'; at: number; event?: ActivityEvent }

function makeEvent(kind: ActivityKind, message: string): ActivityEvent {
  return { id: uid(), kind, message, at: Date.now() }
}

function reducer(state: AppState, action: Action): AppState {
  const event = action.event
  const log = (next: AppState): AppState =>
    event ? { ...next, activity: appendActivity(next.activity, event) } : next

  switch (action.type) {
    case 'channel-add':
      return log({ ...state, channels: [...state.channels, action.channel] })
    case 'channel-remove': {
      if (!state.channels.some((c) => c.id === action.id)) return state
      return log({ ...state, channels: state.channels.filter((c) => c.id !== action.id) })
    }
    case 'video-add':
      return log({ ...state, videos: [...state.videos, action.video] })
    case 'video-update':
      return {
        ...state,
        videos: state.videos.map((v) =>
          v.id === action.id ? { ...v, ...action.patch } : v,
        ),
      }
    case 'video-remove': {
      if (!state.videos.some((v) => v.id === action.id)) return state
      const droppedClips = state.clips.filter((c) => c.videoId === action.id).map((c) => c.id)
      const droppedIds = new Set([...droppedClips, action.id])
      return log({
        ...state,
        videos: state.videos.filter((v) => v.id !== action.id),
        clips: state.clips.filter((c) => c.videoId !== action.id),
        schedule: state.schedule.filter((s) => !droppedClips.includes(s.clipId)),
        stats: state.stats.filter((s) => !droppedIds.has(s.clipId)),
      })
    }
    case 'video-transcript':
      return log({
        ...state,
        videos: state.videos.map((v) =>
          v.id === action.id ? { ...v, transcript: action.transcript } : v,
        ),
      })
    case 'clip-add':
      return log({ ...state, clips: [...state.clips, action.clip] })
    case 'clip-remove': {
      if (!state.clips.some((c) => c.id === action.id)) return state
      return log({
        ...state,
        clips: state.clips.filter((c) => c.id !== action.id),
        schedule: state.schedule.filter((s) => s.clipId !== action.id),
        stats: state.stats.filter((s) => s.clipId !== action.id),
      })
    }
    case 'clips-clear-done': {
      const doneIds = state.clips.filter((c) => c.status === 'done').map((c) => c.id)
      if (doneIds.length === 0) return state
      return log({
        ...state,
        clips: state.clips.filter((c) => c.status !== 'done'),
        schedule: state.schedule.filter((s) => !doneIds.includes(s.clipId)),
        stats: state.stats.filter((s) => !doneIds.includes(s.clipId)),
      })
    }
    case 'schedule-add':
      return log({ ...state, schedule: [...state.schedule, action.entry] })
    case 'schedule-remove':
      return log({
        ...state,
        schedule: state.schedule.filter((s) => s.id !== action.id),
      })
    case 'captions-set':
      return log({ ...state, captions: { ...state.captions, ...action.patch } })
    case 'format-set':
      return { ...state, format: { ...state.format, ...action.patch } }
    case 'prefs-set':
      return log({ ...state, prefs: { ...state.prefs, ...action.patch } })
    case 'templates-set':
      return log({ ...state, textTemplates: action.templates })
    case 'yt-set':
      return log({
        ...state,
        ytClientId: action.clientId,
        ytChannel: action.channel,
      })
    case 'rule-add':
      return log({ ...state, rules: [...state.rules, action.rule] })
    case 'rule-remove':
      return log({ ...state, rules: state.rules.filter((r) => r.id !== action.id) })
    case 'rule-toggle':
      return {
        ...state,
        rules: state.rules.map((r) => (r.id === action.id ? { ...r, enabled: action.enabled } : r)),
      }
    case 'rule-fired':
      return {
        ...state,
        rules: state.rules.map((r) => (r.id === action.id ? { ...r, lastFiredAt: action.at } : r)),
      }
    case 'clip-captions':
      return {
        ...state,
        clips: state.clips.map((c) => (c.id === action.id ? { ...c, captionLines: action.lines } : c)),
      }
    case 'clip-status':
      return log({
        ...state,
        clips: state.clips.map((c) =>
          c.id === action.id ? { ...c, status: 'done', progress: 100, statusSince: action.at, updatedAt: action.at } : c,
        ),
      })
    case 'stat-add':
      return log({ ...state, stats: [...state.stats, action.stat] })
    case 'stat-remove':
      return log({ ...state, stats: state.stats.filter((s) => s.id !== action.id) })
    case 'replace':
      return log(action.state)
    case 'tick': {
      let changed = false
      const completions: ActivityEvent[] = []
      const clips = state.clips.map((clip) => {
        if (clip.status === 'queued') {
          if (action.at - clip.statusSince >= QUEUED_DELAY_MS) {
            changed = true
            return {
              ...clip,
              status: 'processing' as const,
              progress: 8,
              statusSince: action.at,
              updatedAt: action.at,
            }
          }
          return clip
        }
        if (clip.status === 'processing') {
          const next = Math.min(100, clip.progress + (action.at - clip.statusSince) * PROGRESS_RATE)
          if (next >= 100) {
            changed = true
            completions.push({
              id: `${clip.id}:done`,
              kind: 'clip',
              message: `Clip "${clip.title}" completed (simulated processing)`,
              at: action.at,
            })
            return {
              ...clip,
              status: 'done' as const,
              progress: 100,
              statusSince: action.at,
              updatedAt: action.at,
            }
          }
          changed = true
          return { ...clip, progress: next, updatedAt: action.at }
        }
        return clip
      })
      if (!changed) return state
      let activity = state.activity
      for (const item of completions) {
        activity = appendActivity(activity, item)
      }
      return { ...state, clips, activity }
    }
    default: {
      // Exhaustive guard for future actions.
      const never: never = action
      return never
    }
  }
}

export interface AddClipInput {
  videoId: string
  startText: string
  endText: string
  aspect: AspectId
  title?: string
}

export interface ClipCreatorResult {
  ok: boolean
  error: string | null
  clipId: string | null
}

export interface AddVideoResult {
  ok: boolean
  error: string | null
  videoId: string | null
}

export interface PublishInput {
  exportId: string | null
  /** Upload the attached source file instead of a rendered clip. */
  useSourceFile: boolean
  clipId: string
  metadata: {
    title: string
    description: string
    tags: string[]
    privacy: 'public' | 'private' | 'unlisted'
    /** Local date key + HH:MM → converted to YouTube publishAt. */
    publishDate: string
    publishTime: string
    categoryId: string
    attachCaptions: boolean
  }
}

export interface PublishResult {
  ok: boolean
  error: string | null
  videoId: string | null
  link: string | null
}

interface AppContextValue {
  state: AppState
  toasts: ToastItem[]
  dismissToast: (id: string) => void
  toast: (kind: ToastKind, title: string, detail?: string) => void
  addChannel: (url: string, name: string) => { ok: boolean; error: string | null }
  removeChannel: (id: string) => void
  addVideoFile: (file: File) => Promise<AddVideoResult>
  attachFileToVideo: (videoId: string, file: File) => Promise<AddVideoResult>
  removeVideo: (id: string) => void
  /**
   * Send a local file to the local AI service and store the real transcript
   * on the video. Reports honest upload + processing progress.
   */
  transcribeVideo: (
    videoId: string,
    file: File,
    callbacks?: {
      onUpload?: (fraction: number) => void
      onProgress?: (fraction: number, stage: string) => void
    },
  ) => Promise<{ ok: boolean; error: string | null }>
  addClip: (input: AddClipInput) => ClipCreatorResult
  removeClip: (id: string) => void
  clearDoneClips: () => void
  addSchedule: (clipId: string, date: string, time: string, note: string) => { ok: boolean; error: string | null }
  removeSchedule: (id: string) => void
  setCaptions: (patch: Partial<CaptionStyle>, message?: string) => void
  setFormat: (patch: Partial<FormatOptions>) => void
  setPrefs: (patch: Partial<Prefs>, message?: string) => void
  setTemplates: (templates: TextTemplate[], message?: string) => void
  addCaptionLine: (clipId: string, line: Omit<CaptionLine, 'id'>) => void
  /** Replace every caption line on a clip (used when applying a transcript). */
  setCaptionLines: (clipId: string, lines: CaptionLine[]) => void
  updateCaptionLine: (clipId: string, lineId: string, patch: Partial<Omit<CaptionLine, 'id'>>) => void
  removeCaptionLine: (clipId: string, lineId: string) => void
  exportCaptions: (clipId: string, format: 'srt' | 'vtt') => void
  captureThumb: (videoId: string, time: number) => Promise<void>
  downloadFrame: (videoId: string, time: number, thumbName: string) => Promise<void>
  exportClip: (clipId: string) => Promise<void>
  cancelRender: () => void
  renderState: { clipId: string; progress: number } | null
  exports: ExportEntry[]
  exportUrl: (exportId: string) => string | null
  downloadExport: (exportId: string) => void
  removeExport: (exportId: string) => void
  addStat: (clipId: string, label: string, views: number, likes: number, comments: number) => void
  removeStat: (id: string) => void
  connectYouTube: (clientId: string) => Promise<void>
  disconnectYouTube: () => void
  publishClip: (input: PublishInput) => Promise<PublishResult>
  cancelPublish: () => void
  publishState: { clipId: string; uploadedBytes: number; totalBytes: number; label: string } | null
  addRule: (name: string, time: string) => { ok: boolean; error: string | null }
  removeRule: (id: string) => void
  toggleRule: (id: string, enabled: boolean) => void
  exportData: () => string
  importData: (raw: string) => { ok: boolean; error: string | null }
  resetData: () => void
  videoUrl: (videoId: string) => string | null
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, number>())
  const stateRef = useRef(state)
  stateRef.current = state

  // Session-only export artifacts (object URLs + metadata list).
  const [exports, setExports] = useState<ExportEntry[]>([])
  const exportUrls = useRef(new Map<string, string>())
  const [renderState, setRenderState] = useState<{ clipId: string; progress: number } | null>(null)
  const renderAbort = useRef(false)
  const [publishState, setPublishState] = useState<{
    clipId: string
    uploadedBytes: number
    totalBytes: number
    label: string
  } | null>(null)
  const publishAbort = useRef(false)
  const tokenRef = useRef<string | null>(null)

  // ---- toasts ---------------------------------------------------------------
  const dismissToast = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (kind: ToastKind, title: string, detail?: string) => {
      const item: ToastItem = { id: uid(), kind, title, detail }
      setToasts((list) => [...list, item].slice(-MAX_TOASTS))
      const timer = window.setTimeout(() => dismissToast(item.id), TOAST_LIFETIME_MS)
      timers.current.set(item.id, timer)
    },
    [dismissToast],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer))
      pending.clear()
    }
  }, [])

  // ---- persistence & theme side-effects --------------------------------------
  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.accent = state.prefs.accent
    root.dataset.density = state.prefs.density
    root.dataset.motion = state.prefs.motionReduced ? 'reduced' : 'full'
  }, [state.prefs.accent, state.prefs.density, state.prefs.motionReduced])

  // ---- simulated processing ticker --------------------------------------------
  const activeClipCount = useMemo(
    () => state.clips.filter((c) => c.status !== 'done').length,
    [state.clips],
  )
  useEffect(() => {
    if (activeClipCount === 0) return undefined
    const interval = window.setInterval(() => {
      dispatch({ type: 'tick', at: Date.now() })
    }, 900)
    return () => window.clearInterval(interval)
  }, [activeClipCount])

  // ---- posting-rule reminders ---------------------------------------------------
  useEffect(() => {
    if (!state.prefs.reminders) return undefined
    const interval = window.setInterval(() => {
      const now = new Date()
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      for (const rule of stateRef.current.rules) {
        if (!rule.enabled || rule.time !== hhmm) continue
        if (rule.lastFiredAt && now.getTime() - rule.lastFiredAt < 50 * 60 * 1000) continue
        dispatch({ type: 'rule-fired', id: rule.id, at: now.getTime() })
        const body = `Time to post "${rule.name}". Open Clip Studio and publish today's reel.`
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`ChannelAI · ${rule.name}`, { body })
        }
        toast('info', `Reminder — ${rule.name}`, body)
      }
    }, REMINDER_TICK_MS)
    return () => window.clearInterval(interval)
  }, [state.prefs.reminders, toast])

  // ---- actions -----------------------------------------------------------------
  const addChannel = useCallback((url: string, name: string) => {
    const result = analyzeChannelUrl(url)
    if (result.error || !result.info) {
      return { ok: false, error: result.error ?? 'Enter a channel URL.' }
    }
    const channel: Channel = {
      id: uid(),
      name: name.trim() || result.info.name,
      url: result.info.url,
      kind: 'user',
      addedAt: Date.now(),
    }
    dispatch({
      type: 'channel-add',
      channel,
      event: makeEvent('channel', `Added demo channel ${channel.name}`),
    })
    return { ok: true, error: null }
  }, [])

  const removeChannel = useCallback((id: string) => {
    dispatch({ type: 'channel-remove', id, event: makeEvent('channel', 'Removed a demo channel') })
  }, [])

  const removeVideo = useCallback((id: string) => {
    const video = stateRef.current.videos.find((v) => v.id === id)
    releaseVideo(id)
    if (!video) return
    dispatch({
      type: 'video-remove',
      id,
      event: makeEvent('library', `Removed "${video.name}" from the library`),
    })
  }, [])

  const removeClip = useCallback((id: string) => {
    const clip = stateRef.current.clips.find((c) => c.id === id)
    if (!clip) return
    dispatch({
      type: 'clip-remove',
      id,
      event: makeEvent('clip', `Removed clip job "${clip.title}"`),
    })
  }, [])

  const clearDoneClips = useCallback(() => {
    dispatch({ type: 'clips-clear-done', event: makeEvent('clip', 'Cleared completed clip jobs') })
  }, [])

  const value: AppContextValue = useMemo(
    () => ({
      state,
      toasts,
      dismissToast,
      toast,
      addChannel,
      removeChannel,
      addVideoFile: async (file: File) => {
        if (!isSupportedVideoType(file.type, file.name)) {
          return { ok: false, error: 'Unsupported file type. Use MP4, WebM, M4V, MOV or OGV.', videoId: null }
        }
        if (file.size > MAX_VIDEO_SIZE) {
          return { ok: false, error: 'File is larger than the 512 MB demo limit.', videoId: null }
        }
        const id = uid()
        const url = attachVideo(id, file)
        dispatch({
          type: 'video-add',
          video: {
            id,
            name: file.name,
            size: file.size,
            type: file.type || 'video/unknown',
            duration: null,
            sample: false,
            addedAt: Date.now(),
          },
          event: makeEvent('library', `Added "${file.name}" to the library`),
        })
        const duration = await probeDuration(url)
        if (duration != null) dispatch({ type: 'video-update', id, patch: { duration } })
        return { ok: true, error: null, videoId: id }
      },
      attachFileToVideo: async (videoId: string, file: File) => {
        const video = stateRef.current.videos.find((v) => v.id === videoId)
        if (!video) return { ok: false, error: 'That video no longer exists.', videoId: null }
        if (!isSupportedVideoType(file.type, file.name)) {
          return { ok: false, error: 'Unsupported file type. Use MP4, WebM, M4V, MOV or OGV.', videoId: null }
        }
        if (file.size > MAX_VIDEO_SIZE) {
          return { ok: false, error: 'File is larger than the 512 MB demo limit.', videoId: null }
        }
        const url = attachVideo(videoId, file)
        dispatch({
          type: 'video-update',
          id: videoId,
          patch: { name: file.name, size: file.size, type: file.type || 'video/unknown', sample: false, duration: null },
        })
        const duration = await probeDuration(url)
        if (duration != null) dispatch({ type: 'video-update', id: videoId, patch: { duration } })
        return { ok: true, error: null, videoId }
      },
      removeVideo,
      transcribeVideo: async (videoId, file, callbacks) => {
        const prefs = stateRef.current.prefs
        const config = { url: prefs.backendUrl, token: prefs.backendToken }
        try {
          const result = await backend.transcribe(
            config,
            file,
            { model: prefs.whisperModel, language: prefs.transcribeLanguage },
            { onUpload: callbacks?.onUpload, onProgress: callbacks?.onProgress },
          )
          const transcript: VideoTranscript = {
            captions: result.captions.map((c) => ({
              id: c.id,
              start: c.start,
              end: c.end,
              text: c.text,
            })),
            language: result.language,
            duration: result.duration,
            model: result.model,
            elapsed: result.elapsed,
            transcribedAt: Date.now(),
          }
          dispatch({
            type: 'video-transcript',
            id: videoId,
            transcript,
            event: makeEvent(
              'captions',
              `Transcribed "${file.name}" — ${transcript.captions.length} caption lines in ${transcript.elapsed.toFixed(1)}s`,
            ),
          })
          return { ok: true, error: null }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Transcription failed for an unknown reason.'
          return { ok: false, error: message }
        }
      },
      addClip: (input) => {
        const video = stateRef.current.videos.find((v) => v.id === input.videoId)
        if (!video) return { ok: false, error: 'Pick a video from the library first.', clipId: null }
        const start = parseTimestamp(input.startText)
        const end = parseTimestamp(input.endText)
        if (start == null) return { ok: false, error: 'Start time must look like 0:30 or 1:02:03.', clipId: null }
        if (end == null) return { ok: false, error: 'End time must look like 0:45 or 1:02:03.', clipId: null }
        if (end <= start) return { ok: false, error: 'The end time must be after the start time.', clipId: null }
        if (video.duration != null && end > video.duration + 0.25) {
          return {
            ok: false,
            error: `End time is beyond the video length (${formatClock(video.duration)}).`,
            clipId: null,
          }
        }
        const now = Date.now()
        const title =
          input.title?.trim() ||
          `${video.name.replace(/\.[^.]+$/, '')} — ${formatClock(start)}–${formatClock(end)}`
        const clip: ClipJob = {
          id: uid(),
          videoId: video.id,
          title,
          start,
          end,
          aspect: input.aspect,
          status: 'queued',
          progress: 0,
          statusSince: now,
          createdAt: now,
          updatedAt: now,
        }
        dispatch({
          type: 'clip-add',
          clip,
          event: makeEvent('clip', `Queued clip "${clip.title}" (simulated processing)`),
        })
        return { ok: true, error: null, clipId: clip.id }
      },
      removeClip,
      clearDoneClips,
      addSchedule: (clipId, date, time, note) => {
        const clip = stateRef.current.clips.find((c) => c.id === clipId)
        if (!clip) return { ok: false, error: 'Pick a clip to schedule.' }
        const probe = new Date(`${date}T00:00:00`)
        if (Number.isNaN(probe.getTime())) return { ok: false, error: 'The date is not valid.' }
        const entry: ScheduleEntry = {
          id: uid(),
          clipId,
          date,
          time,
          note: note.trim(),
          createdAt: Date.now(),
        }
        dispatch({
          type: 'schedule-add',
          entry,
          event: makeEvent('schedule', `Scheduled "${clip.title}" for ${date}${time ? ` at ${time}` : ''} (demo)`),
        })
        return { ok: true, error: null }
      },
      removeSchedule: (id) => {
        dispatch({ type: 'schedule-remove', id, event: makeEvent('schedule', 'Removed a scheduled demo post') })
      },
      setCaptions: (patch, message) => {
        dispatch({ type: 'captions-set', patch, event: message ? makeEvent('captions', message) : undefined })
      },
      setFormat: (patch) => dispatch({ type: 'format-set', patch }),
      setPrefs: (patch, message) => {
        dispatch({ type: 'prefs-set', patch, event: message ? makeEvent('settings', message) : undefined })
      },
      setTemplates: (templates, message) => {
        dispatch({ type: 'templates-set', templates, event: message ? makeEvent('captions', message) : undefined })
      },
      setCaptionLines: (clipId, lines) => {
        const clip = stateRef.current.clips.find((c) => c.id === clipId)
        if (!clip) return
        dispatch({
          type: 'clip-captions',
          id: clipId,
          lines,
          event: makeEvent('captions', `Replaced caption lines on "${clip.title}"`),
        })
      },
      addCaptionLine: (clipId, line) => {
        const clip = stateRef.current.clips.find((c) => c.id === clipId)
        if (!clip) return
        const lines = [...(clip.captionLines ?? []), { id: uid(), ...line }]
        dispatch({ type: 'clip-captions', id: clipId, lines })
      },
      updateCaptionLine: (clipId, lineId, patch) => {
        const clip = stateRef.current.clips.find((c) => c.id === clipId)
        if (!clip) return
        const lines = (clip.captionLines ?? []).map((line) =>
          line.id === lineId ? { ...line, ...patch } : line,
        )
        dispatch({ type: 'clip-captions', id: clipId, lines })
      },
      removeCaptionLine: (clipId, lineId) => {
        const clip = stateRef.current.clips.find((c) => c.id === clipId)
        if (!clip) return
        const lines = (clip.captionLines ?? []).filter((line) => line.id !== lineId)
        dispatch({ type: 'clip-captions', id: clipId, lines })
      },
      exportCaptions: (clipId, format) => {
        const clip = stateRef.current.clips.find((c) => c.id === clipId)
        if (!clip) {
          toast('error', 'Clip not found')
          return
        }
        const lines = clip.captionLines ?? []
        if (lines.length === 0) {
          toast('info', 'No caption lines yet', 'Add timing lines in the clip editor first.')
          return
        }
        const safe = clip.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
        if (format === 'srt') {
          downloadText(buildSrt(lines), `${safe}.srt`, 'text/plain')
        } else {
          downloadText(buildVtt(lines), `${safe}.vtt`, 'text/vtt')
        }
        toast('success', `${format.toUpperCase()} downloaded`, `${lines.length} caption line${lines.length === 1 ? '' : 's'} exported.`)
      },
      captureThumb: async (videoId, time) => {
        const url = getAttachedUrl(videoId)
        const video = stateRef.current.videos.find((v) => v.id === videoId)
        if (!url || !video) {
          toast('error', 'File not attached', 'Thumbnails need the source file attached this session.')
          return
        }
        try {
          const dataUrl = await captureFrameDataUrl(url, time, 320)
          dispatch({ type: 'video-update', id: videoId, patch: { thumb: dataUrl } })
          toast('success', 'Thumbnail captured', 'Saved locally with the video metadata.')
        } catch {
          toast('error', 'Capture failed', 'The frame could not be read from this file.')
        }
      },
      downloadFrame: async (videoId, time, thumbName) => {
        const url = getAttachedUrl(videoId)
        if (!url) {
          toast('error', 'File not attached', 'Frame export needs the source file attached this session.')
          return
        }
        try {
          const blob = await captureFrameBlob(url, time)
          const safe = thumbName.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 50) || 'thumbnail'
          downloadBlob(blob, `${safe}.png`)
          toast('success', 'Full-size frame downloaded', `${Math.round(blob.size / 1024)} KB PNG`)
        } catch {
          toast('error', 'Capture failed', 'The frame could not be read from this file.')
        }
      },
      exportClip: async (clipId) => {
        const clip = stateRef.current.clips.find((c) => c.id === clipId)
        if (!clip) {
          toast('error', 'Clip not found')
          return
        }
        const url = getAttachedUrl(clip.videoId)
        if (!url) {
          const videoName = stateRef.current.videos.find((v) => v.id === clip.videoId)?.name ?? 'The video'
          toast('error', 'Source file not attached', `Re-attach "${videoName}" in the Video Library first.`)
          return
        }
        if (renderState != null) {
          toast('info', 'A render is already running', 'Wait for it to finish or cancel it first.')
          return
        }
        renderAbort.current = false
        setRenderState({ clipId, progress: 0 })
        try {
          const { blob, mime } = await renderClip({
            url,
            start: clip.start,
            end: clip.end,
            aspect: clip.aspect,
            onProgress: (fraction) => setRenderState({ clipId, progress: fraction * 100 }),
            shouldAbort: () => renderAbort.current,
          })
          const ext = mime.includes('mp4') ? 'mp4' : 'webm'
          const name = `${clip.title.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)}.${ext}`
          const exportId = uid()
          exportUrls.current.set(exportId, URL.createObjectURL(blob))
          setExports((list) => [
            ...list,
            {
              id: exportId,
              clipId: clip.id,
              name,
              size: blob.size,
              mime: blob.type || mime,
              aspect: clip.aspect,
              createdAt: Date.now(),
            },
          ])
          dispatch({
            type: 'clip-status',
            id: clipId,
            status: 'done',
            at: Date.now(),
            event: makeEvent(
              'export',
              `Rendered "${clip.title}" · ${Math.round(blob.size / 1024)} KB (real, in-browser)`,
            ),
          })
          toast('success', 'Clip rendered for real', 'Download it from the Exports card — it is free, no credits.')
        } catch (error) {
          if (error instanceof Error && error.message.includes('cancelled')) {
            toast('info', 'Render cancelled')
          } else {
            toast('error', 'Render failed', error instanceof Error ? error.message : undefined)
          }
        } finally {
          setRenderState(null)
        }
      },
      cancelRender: () => {
        renderAbort.current = true
      },
      renderState,
      exports,
      exportUrl: (exportId) => exportUrls.current.get(exportId) ?? null,
      downloadExport: (exportId) => {
        const url = exportUrls.current.get(exportId)
        const entry = exports.find((e) => e.id === exportId)
        if (!url || !entry) {
          toast('info', 'Export expired', 'Rendered files live for this session — re-render anytime, it is free.')
          return
        }
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = entry.name
        anchor.click()
      },
      removeExport: (exportId) => {
        if (exportUrls.current.has(exportId)) {
          URL.revokeObjectURL(exportUrls.current.get(exportId) as string)
          exportUrls.current.delete(exportId)
        }
        setExports((list) => list.filter((e) => e.id !== exportId))
      },
      addStat: (clipId, label, views, likes, comments) => {
        const clip = stateRef.current.clips.find((c) => c.id === clipId)
        if (!clip) {
          toast('error', 'Pick a clip first')
          return
        }
        const stat: TrackStat = {
          id: uid(),
          clipId,
          label: label.trim() || 'All platforms',
          views,
          likes,
          comments,
          date: dateKey(new Date()),
        }
        dispatch({
          type: 'stat-add',
          stat,
          event: makeEvent('system', `Logged performance for "${clip.title}" · ${views.toLocaleString()} views`),
        })
      },
      removeStat: (id) => {
        dispatch({ type: 'stat-remove', id, event: makeEvent('system', 'Removed a performance entry') })
      },
      connectYouTube: async (clientId) => {
        if (!clientId.trim()) {
          toast('error', 'Paste your OAuth Client ID first', 'Settings → YouTube publishing has a step-by-step link.')
          return
        }
        try {
          const token = await yt.requestAccessToken(clientId.trim())
          const channel = await yt.fetchMyChannel(token)
          tokenRef.current = token
          dispatch({
            type: 'yt-set',
            clientId: clientId.trim(),
            channel,
            event: makeEvent('system', `Connected YouTube channel: ${channel.title}`),
          })
          toast('success', 'YouTube connected', `Will publish to ${channel.title}. Token stays in memory only.`)
        } catch (error) {
          toast('error', 'YouTube connect failed', error instanceof Error ? error.message : undefined)
        }
      },
      disconnectYouTube: () => {
        tokenRef.current = null
        dispatch({ type: 'yt-set', clientId: stateRef.current.ytClientId, channel: null })
        toast('info', 'YouTube disconnected', 'The stored access token was discarded.')
      },
      publishClip: async (input) => {
        const workspace = stateRef.current
        const clip = workspace.clips.find((c) => c.id === input.clipId)
        if (!clip) return { ok: false, error: 'Clip not found.', videoId: null, link: null }

        let blob: Blob | null = null
        let filename = 'video.mp4'
        if (input.useSourceFile) {
          const url = getAttachedUrl(clip.videoId)
          if (!url) {
            return { ok: false, error: 'Attach the source file in the Video Library first.', videoId: null, link: null }
          }
          blob = await (await fetch(url)).blob()
          filename = workspace.videos.find((v) => v.id === clip.videoId)?.name ?? 'source.mp4'
        } else if (input.exportId) {
          const entry = exports.find((e) => e.id === input.exportId)
          const url = exportUrls.current.get(input.exportId)
          if (!entry || !url) {
            return { ok: false, error: 'That rendered export is not available (session expired?) — render it again.', videoId: null, link: null }
          }
          blob = await (await fetch(url)).blob()
          filename = entry.name
        }
        if (!blob || blob.size === 0) {
          return { ok: false, error: 'Nothing to upload — render or attach a file first.', videoId: null, link: null }
        }

        let token = tokenRef.current
        if (!token) {
          if (!workspace.ytClientId) {
            return {
              ok: false,
              error: 'Connect YouTube first (Settings → YouTube publishing, paste your OAuth Client ID).',
              videoId: null,
              link: null,
            }
          }
          try {
            token = await yt.requestAccessToken(workspace.ytClientId)
            tokenRef.current = token
          } catch (error) {
            return {
              ok: false,
              error: error instanceof Error ? error.message : 'Authorization failed.',
              videoId: null,
              link: null,
            }
          }
        }

        const publishAt =
          input.metadata.privacy === 'private' && input.metadata.publishDate && input.metadata.publishTime
            ? new Date(`${input.metadata.publishDate}T${input.metadata.publishTime}:00`).toISOString()
            : null
        if (publishAt && Number.isNaN(new Date(publishAt).getTime())) {
          return { ok: false, error: 'The publication date/time is not valid.', videoId: null, link: null }
        }

        publishAbort.current = false
        setPublishState({ clipId: input.clipId, uploadedBytes: 0, totalBytes: blob.size, label: 'Starting upload…' })
        try {
          const videoId = await yt.uploadVideo(
            token,
            blob,
            filename,
            {
              title: input.metadata.title,
              description: input.metadata.description,
              tags: input.metadata.tags,
              privacy: input.metadata.privacy,
              publishAt,
              categoryId: input.metadata.categoryId,
              language: 'en',
            },
            (progress) => {
              setPublishState({
                clipId: input.clipId,
                uploadedBytes: progress.uploadedBytes,
                totalBytes: progress.totalBytes,
                label: 'Uploading…',
              })
            },
            () => publishAbort.current,
          )
          if (input.metadata.attachCaptions && (clip.captionLines ?? []).length > 0) {
            setPublishState({
              clipId: input.clipId,
              uploadedBytes: blob.size,
              totalBytes: blob.size,
              label: 'Attaching captions…',
            })
            await yt.uploadCaptionTrack(token, videoId, clip.captionLines ?? [])
          }
          dispatch({
            type: 'clip-status',
            id: input.clipId,
            status: 'done',
            at: Date.now(),
            event: makeEvent(
              'export',
              `Published "${input.metadata.title}" to YouTube${publishAt ? ` (scheduled ${input.metadata.publishDate} ${input.metadata.publishTime})` : ''}`,
            ),
          })
          const link = `https://youtu.be/${videoId}`
          return { ok: true, error: null, videoId, link }
        } catch (error) {
          if (error instanceof Error && /cancelled/i.test(error.message)) {
            return { ok: false, error: 'Upload cancelled.', videoId: null, link: null }
          }
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Upload failed.',
            videoId: null,
            link: null,
          }
        } finally {
          setPublishState(null)
        }
      },
      cancelPublish: () => {
        publishAbort.current = true
      },
      publishState,
      addRule: (name, time) => {
        if (!name.trim()) return { ok: false, error: 'Give the posting rule a name.' }
        if (!/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: 'Time must be HH:MM.' }
        const rule: AutoPostRule = {
          id: uid(),
          name: name.trim(),
          time,
          enabled: true,
          createdAt: Date.now(),
          lastFiredAt: null,
        }
        dispatch({
          type: 'rule-add',
          rule,
          event: makeEvent('schedule', `Posting rule "${rule.name}" set for ${rule.time} daily (local reminder + YouTube publishAt)`),
        })
        return { ok: true, error: null }
      },
      removeRule: (id) => {
        dispatch({ type: 'rule-remove', id, event: makeEvent('schedule', 'Removed a posting rule') })
      },
      toggleRule: (id, enabled) => dispatch({ type: 'rule-toggle', id, enabled }),
      exportData: () => JSON.stringify(stateRef.current, null, 2),
      importData: (raw) => {
        try {
          const parsed = sanitizeState(JSON.parse(raw))
          if (!parsed) return { ok: false, error: 'The file is not a ChannelAI workspace export.' }
          releaseAll()
          dispatch({ type: 'replace', state: parsed, event: makeEvent('system', 'Imported workspace data') })
          return { ok: true, error: null }
        } catch {
          return { ok: false, error: 'The file could not be read as JSON.' }
        }
      },
      resetData: () => {
        releaseAll()
        clearStorage()
        dispatch({ type: 'replace', state: loadState(), event: makeEvent('system', 'Workspace data reset to the demo start') })
      },
      videoUrl: (videoId: string) => getAttachedUrl(videoId),
    }),
    [
      state,
      toasts,
      dismissToast,
      toast,
      addChannel,
      removeChannel,
      removeVideo,
      removeClip,
      clearDoneClips,
      exports,
      renderState,
      publishState,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
