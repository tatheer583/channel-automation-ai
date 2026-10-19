/**
 * Registry for in-memory object URLs of locally attached video files.
 * Object URLs cannot live in localStorage, so only metadata is persisted —
 * the binary file reference is re-attached (per session) from the Video Library.
 *
 * The original `File` handle is kept alongside the URL so features that need
 * the real bytes (sending a file to the local AI service) can get them
 * without asking the user to pick the file twice.
 */

const urls = new Map<string, string>()
const files = new Map<string, File>()

/** (Re)attach a local file for a video id; releases any previous URL. */
export function attachVideo(videoId: string, file: File): string {
  releaseVideo(videoId)
  const url = URL.createObjectURL(file)
  urls.set(videoId, url)
  files.set(videoId, file)
  return url
}

export function getAttachedUrl(videoId: string): string | null {
  return urls.get(videoId) ?? null
}

/** The original File for an attached video, when it is still in this session. */
export function getAttachedFile(videoId: string): File | null {
  return files.get(videoId) ?? null
}

export function releaseVideo(videoId: string): void {
  const url = urls.get(videoId)
  if (url) {
    URL.revokeObjectURL(url)
    urls.delete(videoId)
  }
  files.delete(videoId)
}

/** Release every registered object URL (used on import/reset). */
export function releaseAll(): void {
  for (const id of [...urls.keys()]) {
    releaseVideo(id)
  }
}

/** True when the browser is likely to play this file type in a <video> tag. */
export function isSupportedVideoType(type: string, name: string): boolean {
  if (type.startsWith('video/')) return !type.startsWith('video/x-')
  return /\.(mp4|webm|ogv|m4v|mov)$/i.test(name)
}

/** Read the duration (seconds) of an object URL. Resolves null on failure/timeout. */
export function probeDuration(url: string, timeoutMs = 15000): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    let settled = false
    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      resolve(value)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    video.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null)
    })
    video.addEventListener('error', () => finish(null))
    video.src = url
  })
}
