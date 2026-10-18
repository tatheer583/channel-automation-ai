/**
 * Real, fully client-side clip rendering.
 *
 * Draws the source video through an aspect-crop onto a canvas frame by frame
 * and records it (video + audio) with MediaRecorder — no servers, no keys,
 * no credits. Output is a downloadable WebM (or MP4 on Safari).
 *
 * Limitations (by design, they are honest): rendering happens in real time,
 * so a 30 s clip takes ~30 s; object-URL output lives for the session.
 */

import type { AspectId } from '../types'

export interface CropRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

export interface RenderRequest {
  url: string
  start: number
  end: number
  aspect: AspectId
  onProgress?: (fraction: number) => void
  shouldAbort?: () => boolean
}

export interface RenderResult {
  blob: Blob
  mime: string
}

const ACCEPTABLE_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
]

/** Target output pixel size per aspect (short edge = 720 px). */
export function outputDims(aspect: AspectId): { w: number; h: number; ratio: number } {
  switch (aspect) {
    case '9:16':
      return { w: 720, h: 1280, ratio: 9 / 16 }
    case '1:1':
      return { w: 720, h: 720, ratio: 1 }
    case '4:5':
      return { w: 720, h: 900, ratio: 4 / 5 }
    case '16:9':
    default:
      return { w: 1280, h: 720, ratio: 16 / 9 }
  }
}

/** Center-crop rect on the source video that matches the target ratio. */
export function computeCrop(vw: number, vh: number, aspect: AspectId): CropRect {
  const { ratio } = outputDims(aspect)
  const sourceRatio = vw / vh
  let sw = vw
  let sh = vh
  if (sourceRatio > ratio) {
    sw = Math.round(vh * ratio)
  } else {
    sh = Math.round(vw / ratio)
  }
  return {
    sx: Math.round((vw - sw) / 2),
    sy: Math.round((vh - sh) / 2),
    sw,
    sh,
  }
}

export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const type of ACCEPTABLE_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : null
}

function once(el: HTMLElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for "${event}"`))
    }, timeoutMs)
    const on = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('The video could not be decoded for rendering.'))
    }
    function cleanup() {
      window.clearTimeout(timer)
      el.removeEventListener(event, on)
      el.removeEventListener('error', onError)
    }
    el.addEventListener(event, on, { once: true })
    el.addEventListener('error', onError, { once: true })
  })
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup()
      resolve() // proceed anyway with the current frame
    }, 8000)
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    function cleanup() {
      window.clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.currentTime = Math.min(Math.max(0, time), (video.duration || time) - 0.05)
  })
}

/**
 * Render `[start, end)` of `url`, cropped to `aspect`, into a Blob.
 * Real-time speed; progress reports 0–1.
 */
export async function renderClip(request: RenderRequest): Promise<RenderResult> {
  const { url, start, end, aspect, onProgress, shouldAbort } = request
  if (typeof MediaRecorder === 'undefined' || typeof AudioContext === 'undefined') {
    throw new Error('This browser cannot record video locally (MediaRecorder missing).')
  }
  const mime = pickRecorderMime()
  if (!mime) throw new Error('No supported recording format found in this browser.')

  const video = document.createElement('video')
  video.src = url
  video.preload = 'auto'
  video.playsInline = true
  video.crossOrigin = 'anonymous'
  await once(video, 'loadedmetadata', 20000)
  if (shouldAbort?.()) throw new Error('Render cancelled.')

  const crop = computeCrop(video.videoWidth, video.videoHeight, aspect)
  const dims = outputDims(aspect)
  const canvas = document.createElement('canvas')
  canvas.width = dims.w
  canvas.height = dims.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')

  await seekTo(video, start)
  if (shouldAbort?.()) throw new Error('Render cancelled.')

  // Audio: route through WebAudio into the recording stream (silent to users).
  let audioContext: AudioContext | null = null
  const stream = canvas.captureStream(30)
  try {
    audioContext = new AudioContext()
    const source = audioContext.createMediaElementSource(video)
    const destination = audioContext.createMediaStreamDestination()
    source.connect(destination)
    for (const track of destination.stream.getAudioTracks()) {
      stream.addTrack(track)
    }
  } catch {
    // No audio track is still a valid visual render.
  }

  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 4_500_000,
    audioBitsPerSecond: 128_000,
  })
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  }

  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const type = mime.split(';')[0] || 'video/webm'
      resolve(new Blob(chunks, { type }))
    }
  })

  const total = Math.max(0.4, end - start)
  let rafId = 0
  recorder.start(250)
  try {
    await video.play()
  } catch {
    recorder.stop()
    await cleanupMedia(audioContext, stream)
    throw new Error('Playback was blocked by the browser. Try again (a click is required).')
  }

  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (shouldAbort?.()) {
        reject(new Error('Render cancelled.'))
        return
      }
      ctx.drawImage(
        video,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        0,
        0,
        canvas.width,
        canvas.height,
      )
      onProgress?.(Math.min(1, Math.max(0, (video.currentTime - start) / total)))
      if (video.currentTime >= end - 0.05 || video.ended) {
        resolve()
        return
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    const safety = window.setTimeout(
      () => {
        resolve()
      },
      (total + 30) * 1000,
    )
    window.setTimeout(() => {
      window.clearTimeout(safety)
      cancelAnimationFrame(rafId)
    }, 0)
  })

  cancelAnimationFrame(rafId)
  recorder.stop()
  const blob = await finished
  video.pause()
  video.removeAttribute('src')
  video.load()
  await cleanupMedia(audioContext, stream)
  onProgress?.(1)
  return { blob, mime: blob.type || mime.split(';')[0] }
}

async function cleanupMedia(context: AudioContext | null, stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop())
  if (context && context.state !== 'closed') {
    try {
      await context.close()
    } catch {
      // Ignore.
    }
  }
}

/**
 * Capture a still frame (JPEG dataURL) from a video URL at `time`.
 * Full-res `frameBlob` variant returns a PNG blob for downloads.
 */
export async function captureFrameDataUrl(url: string, time: number, width = 320): Promise<string> {
  const video = document.createElement('video')
  video.src = url
  video.preload = 'auto'
  video.muted = true
  await once(video, 'loadedmetadata', 20000)
  await seekTo(video, time)
  const ratio = video.videoHeight && video.videoWidth ? video.videoHeight / video.videoWidth : 0.5625
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.round(width * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  video.removeAttribute('src')
  video.load()
  return canvas.toDataURL('image/jpeg', 0.72)
}

export async function captureFrameBlob(url: string, time: number): Promise<Blob> {
  const video = document.createElement('video')
  video.src = url
  video.preload = 'auto'
  video.muted = true
  await once(video, 'loadedmetadata', 20000)
  await seekTo(video, time)
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  video.removeAttribute('src')
  video.load()
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? new Blob()), 'image/png'))
}
