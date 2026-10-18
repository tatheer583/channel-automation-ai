/**
 * Global app store: state, actions, toasts and the simulated clip-processing
 * ticker. Everything persists to localStorage; the simulation is clearly
 * labelled in the UI and never touches the network.
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
  CaptionStyle,
  Channel,
  ClipJob,
  FormatOptions,
  Prefs,
  ScheduleEntry,
  ToastItem,
  ToastKind,
  VideoAsset,
  AspectId,
} from '../types'
import { appendActivity, clearStorage, loadState, saveState, sanitizeState } from '../lib/storage'
import { analyzeChannelUrl, formatClock, parseTimestamp, uid } from '../lib/format'
import { attachVideo, getAttachedUrl, isSupportedVideoType, probeDuration, releaseAll, releaseVideo } from '../lib/videoStore'

const MAX_TOASTS = 4
const TOAST_LIFETIME_MS = 4200
const QUEUED_DELAY_MS = 1800
/** Progress units per ms → a full simulation takes ≈ 9 s. */
const PROGRESS_RATE = 0.011
const MAX_VIDEO_SIZE = 512 * 1024 * 1024

type Action =
  | { type: 'channel-add'; channel: Channel; event?: ActivityEvent }
  | { type: 'channel-remove'; id: string; event?: ActivityEvent }
  | { type: 'video-add'; video: VideoAsset; event?: ActivityEvent }
  | {
      type: 'video-update'
      id: string
      patch: Partial<Pick<VideoAsset, 'name' | 'size' | 'type' | 'duration' | 'sample'>>
    }
  | { type: 'video-remove'; id: string; event?: ActivityEvent }
  | { type: 'clip-add'; clip: ClipJob; event?: ActivityEvent }
  | { type: 'clip-remove'; id: string; event?: ActivityEvent }
  | { type: 'clips-clear-done'; event?: ActivityEvent }
  | { type: 'schedule-add'; entry: ScheduleEntry; event?: ActivityEvent }
  | { type: 'schedule-remove'; id: string; event?: ActivityEvent }
  | { type: 'captions-set'; patch: Partial<CaptionStyle>; event?: ActivityEvent }
  | { type: 'format-set'; patch: Partial<FormatOptions> }
  | { type: 'prefs-set'; patch: Partial<Prefs>; event?: ActivityEvent }
  | { type: 'replace'; state: AppState; event?: ActivityEvent }
  | { type: 'tick'; at: number }

function makeEvent(kind: ActivityKind, message: string): ActivityEvent {
  return { id: uid(), kind, message, at: Date.now() }
}

function reducer(state: AppState, action: Action): AppState {
  const event = 'event' in action ? action.event : undefined
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
      return log({
        ...state,
        videos: state.videos.filter((v) => v.id !== action.id),
        clips: state.clips.filter((c) => c.videoId !== action.id),
        schedule: state.schedule.filter((s) => !droppedClips.includes(s.clipId)),
      })
    }
    case 'clip-add':
      return log({ ...state, clips: [...state.clips, action.clip] })
    case 'clip-remove': {
      if (!state.clips.some((c) => c.id === action.id)) return state
      return log({
        ...state,
        clips: state.clips.filter((c) => c.id !== action.id),
        schedule: state.schedule.filter((s) => s.clipId !== action.id),
      })
    }
    case 'clips-clear-done': {
      const doneIds = state.clips.filter((c) => c.status === 'done').map((c) => c.id)
      if (doneIds.length === 0) return state
      return log({
        ...state,
        clips: state.clips.filter((c) => c.status !== 'done'),
        schedule: state.schedule.filter((s) => !doneIds.includes(s.clipId)),
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
  addClip: (input: AddClipInput) => ClipCreatorResult
  removeClip: (id: string) => void
  clearDoneClips: () => void
  addSchedule: (clipId: string, date: string, time: string, note: string) => { ok: boolean; error: string | null }
  removeSchedule: (id: string) => void
  setCaptions: (patch: Partial<CaptionStyle>, message?: string) => void
  setFormat: (patch: Partial<FormatOptions>) => void
  setPrefs: (patch: Partial<Prefs>, message?: string) => void
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
    [state, toasts, dismissToast, toast, addChannel, removeChannel, removeVideo, removeClip, clearDoneClips],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
