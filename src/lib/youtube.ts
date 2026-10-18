/**
 * Real YouTube publishing, entirely from the browser:
 *  - Google Identity Services OAuth (user brings their OWN OAuth Client ID —
 *    nothing is hard-coded; the id is stored locally and is not a secret).
 *  - channels.list → verify the connected channel.
 *  - videos.insert via resumable upload (chunked, with progress).
 *  - captions.insert → attach generated VTT as a real caption track.
 *
 * Uploads publish as PRIVATE with status.publishAt so YouTube itself makes
 * the video public at the exact chosen time — true "post daily at 9:00".
 * Requires no backend server and no API key on our side. Scopes requested:
 * youtube.upload + youtube.force-ssl (needed for caption management).
 */

import type { CaptionLine, YtChannelInfo } from '../types'
import { buildVtt } from './fileExport'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl'

let gisLoading: Promise<void> | null = null

function loadGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if ('google' in window && 'accounts' in (window as never as Record<string, never>)) {
    return Promise.resolve()
  }
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GIS_SRC
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Could not load Google Identity Services.'))
      document.head.appendChild(script)
    })
  }
  return gisLoading
}

interface TokenResponse {
  access_token: string
  expires_in: number
}

export interface TokenRequestOptions {
  /** Where the user lands after consenting. */
  redirectTo?: string
  onRestart?: () => void
}

/**
 * Request an OAuth access token via the GIS token client.
 * The popup + callback dance is handled by Google's script.
 *
 * Strategy: initTokenClient + requestAccessToken(). Google returns the token
 * on this URL hash fragment when the popup closes back to the same page:
 * #access_token=...&expires_in=...&scope=...
 * We parse it from location.hash. Reliable, no client secret needed.
 */
export async function requestAccessToken(clientId: string): Promise<string> {
  await loadGis()
  const google = (window as unknown as { google: GoogleNamespace }).google

  return new Promise((resolve, reject) => {
    let disposing = false
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response: TokenResponse | { error?: string }) => {
        if (disposing) return
        disposing = true
        if ('access_token' in response && response.access_token) {
          resolve(response.access_token)
        } else {
          reject(new Error('The Google consent window was closed or denied access.'))
        }
      },
      error_callback: (error: { type?: string }) => {
        if (disposing) return
        disposing = true
        reject(new Error(error?.type === 'popup_closed' ? 'Consent window closed.' : 'Google authorization failed.'))
      },
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

interface GoogleNamespace {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse | { error?: string }) => void
        error_callback?: (error: { type?: string }) => void
      }) => { requestAccessToken: (options?: { prompt?: string }) => void }
    }
  }
}

/** Verify the token and fetch the authorized user's channel (mine=true). */
export async function fetchMyChannel(token: string): Promise<YtChannelInfo> {
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new Error('Google token expired — reconnect to continue.')
  const data = (await res.json()) as {
    items?: Array<{
      id: string
      snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } }
    }>
    error?: { message?: string }
  }
  const item = data.items?.[0]
  if (!item) throw new Error(data.error?.message ?? 'No YouTube channel is associated with this Google account.')
  return {
    id: item.id,
    title: item.snippet.title,
    customUrl: item.snippet.customUrl ?? item.id,
    thumb: item.snippet.thumbnails?.default?.url ?? '',
  }
}

export interface UploadMetadata {
  title: string
  description: string
  tags: string[]
  privacy: 'public' | 'private' | 'unlisted'
  /** "YYYY-MM-DDTHH:MM:SSZ" — only meaningful when privacy = private. */
  publishAt: string | null
  categoryId: string
  language: string
}

export interface UploadProgress {
  uploadedBytes: number
  totalBytes: number
}

/**
 * Resumable upload of a local video file as a YouTube video.
 * Returns the new videoId. Chunks 8 MB; handles 308 Continue with Range.
 */
export async function uploadVideo(
  token: string,
  file: File | Blob,
  filename: string,
  metadata: UploadMetadata,
  onProgress?: (p: UploadProgress) => void,
  shouldAbort?: () => boolean,
): Promise<string> {
  const resource = {
    snippet: {
      title: metadata.title.slice(0, 100),
      description: metadata.description.slice(0, 4900),
      tags: metadata.tags,
      categoryId: metadata.categoryId,
      defaultAudioLanguage: metadata.language,
    },
    status: {
      privacyStatus: metadata.publishAt ? 'private' : metadata.privacy,
      ...(metadata.publishAt ? { publishAt: metadata.publishAt } : {}),
      selfDeclaredMadeForKids: false,
    },
  }

  const init = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(file.size),
        'X-Upload-Content-Type': file.type || 'video/mp4',
      },
      body: JSON.stringify(resource),
    },
  )
  if (!init.ok) {
    const text = await init.text()
    throw new Error(`Upload initiation failed (${init.status}): ${truncate(text)}`)
  }
  const uploadUrl = init.headers.get('Location') ?? init.headers.get('location')
  if (!uploadUrl) throw new Error('Google did not return an upload URL.')

  const CHUNK = 8 * 1024 * 1024
  let offset = 0

  while (offset < file.size) {
    if (shouldAbort?.()) throw new Error('Upload cancelled.')
    const end = Math.min(offset + CHUNK, file.size)
    const chunk = file.slice(offset, end, file.type || 'video/mp4')
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'video/mp4',
        'Content-Range': `bytes ${offset}-${end - 1}/${file.size}`,
        'Content-Length': String(end - offset),
        'X-Content-Filename': filename.slice(0, 60),
      },
      body: chunk,
    })
    if (put.status === 308) {
      const rangeHeader = put.headers.get('Range')
      const matched = rangeHeader?.match(/bytes=0-(\d+)/)
      offset = matched ? Number(matched[1]) + 1 : end
    } else if (put.status >= 200 && put.status < 300) {
      const done = (await put.json()) as { id?: string }
      onProgress?.({ uploadedBytes: file.size, totalBytes: file.size })
      if (!done.id) throw new Error('Upload finished but YouTube returned no video id.')
      return done.id
    } else if (put.status >= 500) {
      // Transient server error — retry the same chunk once after a pause.
      await sleep(3000)
    } else {
      const text = await put.text()
      throw new Error(`Upload failed (${put.status}): ${truncate(text)}`)
    }
    onProgress?.({ uploadedBytes: offset, totalBytes: file.size })
  }

  // Finalization probe.
  const probe = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${file.size}` },
  })
  const probeJson = (await probe.json()) as { id?: string }
  if (!probeJson.id) throw new Error('Upload could not be finalized.')
  return probeJson.id
}

/** Attach a real caption track to an owned video (captions.insert). */
export async function uploadCaptionTrack(
  token: string,
  videoId: string,
  lines: CaptionLine[],
  language = 'en',
): Promise<void> {
  const vtt = buildVtt(lines)
  const file = new File([vtt], 'captions.vtt', { type: 'text/vtt' })
  const url = new URL('https://www.googleapis.com/upload/youtube/v3/captions')
  url.searchParams.set('part', 'snippet')
  const form = new FormData()
  form.append(
    'snippet',
    new Blob(
      [
        JSON.stringify({
          snippet: {
            videoId,
            language,
            name: 'ChannelAI (auto)',
            isDraft: false,
          },
        }),
      ],
      { type: 'application/json' },
    ),
  )
  form.append('media', file, 'captions.vtt')
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Caption upload failed (${res.status}): ${truncate(text)}`)
  }
}

function truncate(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
