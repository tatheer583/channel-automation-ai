/**
 * Client for the **ChannelAI local service** (backend/app.py).
 *
 * The service runs on your own machine and does what a browser cannot do
 * well: decode media with FFmpeg (bundled inside PyAV) and run a real
 * speech-recognition model (faster-whisper) on the CPU.
 *
 * It is NOT a public API. While the process is running, only browsers on
 * this machine can reach it. If it is not running, every call here fails
 * with a clear, honest message - the rest of the app keeps working.
 *
 * Nothing in this file stores secrets or uploads anything to the internet:
 * the uploaded media goes to http://127.0.0.1:8000 and stays on the disk.
 */

/** Where the service is listening. Configurable in Settings. */
export const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000'

export interface BackendConfig {
  /** Base URL of the service, e.g. http://127.0.0.1:8000 */
  url: string
  /** Optional local token (only needed when CHANNELAI_TOKEN is set). */
  token?: string
}

export interface BackendHealth {
  ok: boolean
  service: string
  version: string
  device: string
  compute_type: string
  default_model: string
  known_models: string[]
  model_loaded: boolean
  model_cached: Record<string, boolean>
  max_upload_mb: number
  token_required: boolean
  ffmpeg: string
  work_dir: string
}

export interface BackendJob {
  job_id: string
  filename: string
  status: 'queued' | 'working' | 'done' | 'error'
  stage: string
  message: string
  progress: number
  created_at: number
  updated_at: number
  result: TranscriptPayload | null
  error: string | null
}

export interface TranscriptCaption {
  id: string
  start: number
  end: number
  text: string
}

export interface TranscriptPayload {
  captions: TranscriptCaption[]
  segments: Array<{ start: number; end: number; text: string }>
  language: string | null
  duration: number
  model: string
  elapsed: number
  compute_type: string
  device: string
  caption_count: number
}

export interface TranscribeOptions {
  model?: string
  /** 'auto' | 'ur' | 'en' | ... */
  language?: string
  beamSize?: number
  maxChars?: number
  maxLines?: number
}

/** A failure with a message that is safe to show in the UI. */
export class BackendError extends Error {
  /** Machine-readable kind: 'offline' | 'token' | undefined. */
  readonly kind?: string
  /** Optional actionable advice shown under the message. */
  readonly advice?: string

  constructor(message: string, kind?: string, advice?: string) {
    super(message)
    this.name = 'BackendError'
    this.kind = kind
    this.advice = advice
  }
}

function baseUrl(config: BackendConfig): string {
  return (config.url || DEFAULT_BACKEND_URL).replace(/\/+$/, '')
}

function headers(config: BackendConfig): Record<string, string> {
  const result: Record<string, string> = {}
  if (config.token) result['X-ChannelAI-Token'] = config.token
  return result
}

/** True when the failure means "the service is not running". */
export function isOfflineError(error: unknown): boolean {
  return error instanceof BackendError && error.kind === 'offline'
}

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i

/**
 * The service is unreachable. There are two very different reasons and the
 * user needs to know which one it is:
 *
 *  1. The service is not running  -> start it.
 *  2. The browser blocked it       -> Chrome's Local Network Access rule
 *     stops a *public* https:// page (the GitHub Pages build) from reaching
 *     http://127.0.0.1 until the site is allowed to use the local network.
 */
function offlineMessage(config: BackendConfig): BackendError {
  const pageIsLocal = typeof window !== 'undefined' && LOOPBACK.test(window.location.origin)
  const serviceIsLocal = LOOPBACK.test(baseUrl(config))

  if (!pageIsLocal && serviceIsLocal) {
    return new BackendError(
      `The local AI service is not reachable at ${baseUrl(config)}.`,
      'offline',
      'Your browser blocked local-network access. Either open the app at http://localhost:5173 ' +
        '(run `npm run dev` in the project folder), or allow this site to access your local ' +
        'network when the browser asks.',
    )
  }
  return new BackendError(
    `The local AI service is not reachable at ${baseUrl(config)}.`,
    'offline',
    'Start it with: cd C:\\Users\\1\\Projects\\ChannelAI  then  .\\backend\\start.ps1',
  )
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    const detail = body?.detail ?? body?.error
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0]
      if (typeof first?.msg === 'string') return first.msg
    }
    return JSON.stringify(body).slice(0, 300)
  } catch {
    return `${response.status} ${response.statusText}`
  }
}

/** Ask the service what it can do. Throws BackendError when it is offline. */
export async function fetchHealth(
  config: BackendConfig,
  signal?: AbortSignal,
): Promise<BackendHealth> {
  let response: Response
  try {
    response = await fetch(`${baseUrl(config)}/api/health`, {
      headers: headers(config),
      signal,
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw offlineMessage(config)
  }
  if (response.status === 401) {
    throw new BackendError('The service rejected the local token.', 'token')
  }
  if (!response.ok) {
    throw new BackendError(`Service health check failed: ${await readError(response)}`)
  }
  return (await response.json()) as BackendHealth
}

/**
 * Upload a media file and start a transcription job.
 * Uses XMLHttpRequest so we can report real upload progress.
 */
export function startTranscription(
  config: BackendConfig,
  file: File,
  options: TranscribeOptions = {},
  onUploadProgress?: (fraction: number) => void,
): Promise<{ job_id: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file, file.name)
    form.append('model', options.model ?? '')
    form.append('language', options.language ?? 'auto')
    form.append('beam_size', String(options.beamSize ?? 1))
    form.append('max_chars', String(options.maxChars ?? 42))
    form.append('max_lines', String(options.maxLines ?? 2))

    const request = new XMLHttpRequest()
    request.open('POST', `${baseUrl(config)}/api/transcribe`)
    for (const [key, value] of Object.entries(headers(config))) {
      request.setRequestHeader(key, value)
    }

    request.upload.onprogress = (event) => {
      if (event.lengthComputable && onUploadProgress) {
        onUploadProgress(event.loaded / event.total)
      }
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        try {
          resolve(JSON.parse(request.responseText) as { job_id: string })
        } catch {
          reject(new BackendError('The service returned an unreadable response.'))
        }
        return
      }
      let detail = `${request.status}`
      try {
        const body = JSON.parse(request.responseText)
        detail = typeof body?.detail === 'string' ? body.detail : detail
      } catch {
        // keep the status code
      }
      reject(new BackendError(`Upload failed: ${detail}`))
    }
    request.onerror = () => reject(offlineMessage(config))
    request.ontimeout = () => reject(offlineMessage(config))
    request.send(form)
  })
}

/** Poll a running job once. */
export async function pollJob(
  config: BackendConfig,
  jobId: string,
  signal?: AbortSignal,
): Promise<BackendJob> {
  let response: Response
  try {
    response = await fetch(`${baseUrl(config)}/api/jobs/${jobId}`, {
      headers: headers(config),
      signal,
    })
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    throw offlineMessage(config)
  }
  if (!response.ok) {
    throw new BackendError(`Could not read job status: ${await readError(response)}`)
  }
  return (await response.json()) as BackendJob
}

export interface TranscribeCallbacks {
  /** 0-1 while the file is being uploaded. */
  onUpload?: (fraction: number) => void
  /** 0-1 while the service is decoding / transcribing. */
  onProgress?: (fraction: number, stage: string) => void
  signal?: AbortSignal
}

/**
 * Full flow: upload -> poll until finished -> return the transcript.
 * Rejects with BackendError on any real failure.
 */
export async function transcribe(
  config: BackendConfig,
  file: File,
  options: TranscribeOptions = {},
  callbacks: TranscribeCallbacks = {},
): Promise<TranscriptPayload> {
  const { job_id } = await startTranscription(config, file, options, callbacks.onUpload)

  const pollEveryMs = 600
  while (true) {
    if (callbacks.signal?.aborted) {
      throw new DOMException('Transcription cancelled', 'AbortError')
    }
    const job = await pollJob(config, job_id, callbacks.signal)
    if (job.status === 'done' && job.result) {
      return job.result
    }
    if (job.status === 'error') {
      throw new BackendError(job.error || job.message || 'Transcription failed.')
    }
    callbacks.onProgress?.(job.progress, job.stage || job.message || 'Working')
    await new Promise((resolve) => setTimeout(resolve, pollEveryMs))
  }
}

/** Ask the service to release the Whisper model from RAM. */
export async function releaseModel(config: BackendConfig): Promise<void> {
  try {
    await fetch(`${baseUrl(config)}/api/shutdown`, { method: 'POST', headers: headers(config) })
  } catch {
    // Not fatal - the model is released when the process exits anyway.
  }
}
