/** Formatting, parsing and validation helpers. */

/** Random id with a fallback for non-secure contexts. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 1234567 → "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = -1
  do {
    value /= 1024
    unit += 1
  } while (value >= 1024 && unit < units.length - 1)
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`
}

/** Seconds → "1:02:03" or "10:12"; null → "—". */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * Parse "90", "1:30", "01:30" or "1:02:03" into seconds.
 * Returns null for malformed input, negative values, or empty parts.
 */
export function parseTimestamp(input: string): number | null {
  const text = input.trim()
  if (text === '' || !/^\d{1,3}(:\d{1,2}){0,2}$/.test(text)) return null
  const parts = text.split(':').map((part) => Number(part))
  for (const part of parts) {
    if (Number.isNaN(part)) return null
  }
  let seconds = 0
  if (parts.length === 3) {
    seconds += parts[0] * 3600 + parts[1] * 60 + parts[2]
  } else if (parts.length === 2) {
    seconds += parts[0] * 60 + parts[1]
  } else {
    seconds = parts[0]
  }
  return seconds
}

/** epoch ms → relative "Just now", "12m ago", "3h ago", "5d ago", or a date. */
export function relativeTime(at: number, now = Date.now()): string {
  const diff = now - at
  if (diff < 45_000) return 'Just now'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: new Date(at).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric',
  })
}

/** Local date key, YYYY-MM-DD. */
export function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse YYYY-MM-DD as a LOCAL date (avoids UTC off-by-one). */
export function dateFromKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2]) - 1
  const d = Number(match[3])
  const date = new Date(y, m, d)
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m ||
    date.getDate() !== d
  ) {
    return null
  }
  return date
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export interface ChannelUrlInfo {
  url: string
  /** Suggested display name. */
  name: string
  /** Human label of the source, e.g. "YouTube (demo)". */
  source: string
}

/**
 * Extract a YouTube video id from common URL shapes
 * (watch?v=, youtu.be/, shorts/, embed/). Returns null otherwise.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  if (/^[\w-]{11}$/.test(text)) return text
  const patterns: RegExp[] = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?(.*&)?v=([\w-]{11})/i,
    /^https?:\/\/(www\.)?youtu\.be\/([\w-]{11})/i,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/([\w-]{11})/i,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/([\w-]{11})/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match) return match[match.length - 1]
  }
  return null
}

export interface ChannelUrlResult {
  error: string | null
  info: ChannelUrlInfo | null
}

/**
 * Validate a channel URL and suggest a display name.
 * This performs ZERO network requests — the URL is only parsed locally.
 */
export function analyzeChannelUrl(raw: string): ChannelUrlResult {
  const text = raw.trim()
  if (text === '') return { error: 'Enter a channel URL.', info: null }
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { error: 'That does not look like a valid URL.', info: null }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { error: 'Only http(s) URLs are supported.', info: null }
  }
  if (!url.hostname.includes('.')) {
    return { error: 'Enter a full URL, e.g. https://youtube.com/@yourchannel.', info: null }
  }

  const path = url.pathname.replace(/\/+$/, '')
  if (/(^|\.)youtube\.com$/i.test(url.hostname) || /^youtu\.be$/i.test(url.hostname)) {
    const handle = path.match(/^\/@([\w.-]{2,40})$/)
    if (handle) {
      return {
        error: null,
        info: {
          url: url.toString(),
          name: `@${handle[1]}`,
          source: 'YouTube (demo)',
        },
      }
    }
    const channelId = path.match(/^\/channel\/(UC[\w-]{10,32})$/)
    if (channelId) {
      return {
        error: null,
        info: {
          url: url.toString(),
          name: channelId[1],
          source: 'YouTube (demo)',
        },
      }
    }
    const legacy = path.match(/^\/(?:c|user)\/([\w.-]{2,40})$/)
    if (legacy) {
      return {
        error: null,
        info: {
          url: url.toString(),
          name: legacy[1],
          source: 'YouTube (demo)',
        },
      }
    }
    const slug = path === '' || path === '/' ? url.hostname : path.split('/')[1] || url.hostname
    return {
      error: null,
      info: { url: url.toString(), name: slug, source: 'YouTube (demo)' },
    }
  }

  const label = url.hostname.replace(/^www\./i, '')
  return {
    error: null,
    info: { url: url.toString(), name: label, source: `${label} (demo)` },
  }
}
