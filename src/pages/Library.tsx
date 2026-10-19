import { useEffect, useRef, useState } from 'react'
import { AudioLines, Camera, CirclePlay, Clock, Film, FolderOpen, ImageDown, Trash2, Upload } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Badge, Button, Card, DemoNote, EmptyState, Modal, PageHeader, Progress } from '../components/ui'
import { formatBytes, formatClock, relativeTime } from '../lib/format'
import { getAttachedFile, getAttachedUrl } from '../lib/videoStore'
import type { VideoAsset } from '../types'

type HoverState = boolean

function thumbUrl(video: VideoAsset): string | null {
  return getAttachedUrl(video.id)
}

export default function LibraryPage() {
  const { state, addVideoFile, attachFileToVideo, removeVideo, toast, captureThumb, downloadFrame } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)
  const attachTargetRef = useRef<string | null>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const [dragging, setDragging] = useState<HoverState>(false)
  const [attachTarget, setAttachTarget] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [transcribeId, setTranscribeId] = useState<string | null>(null)

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const result = await addVideoFile(file)
    if (!result.ok) {
      toast('error', 'Video not added', result.error ?? undefined)
      return
    }
    toast('success', 'Video added', 'Stored locally — duration is being read from the file.')
  }

  const handleAttachFiles = async (files: FileList | null) => {
    const videoId = attachTargetRef.current
    const file = files?.[0]
    if (!videoId || !file) return
    const result = await attachFileToVideo(videoId, file)
    if (!result.ok) {
      toast('error', 'File not attached', result.error ?? undefined)
      return
    }
    toast('success', 'File attached', 'Preview restored for this session.')
  }

  const pickAttach = (videoId: string) => {
    attachTargetRef.current = videoId
    setAttachTarget(videoId)
  }

  // Opening the hidden file input when the user picks "Attach file" on a card.
  useEffect(() => {
    if (attachTarget == null) return
    attachInputRef.current?.click()
  }, [attachTarget])

  const previewing = state.videos.find((v) => v.id === previewId) ?? null
  const previewUrl = previewing ? getAttachedUrl(previewing.id) : null
  const transcribing = state.videos.find((v) => v.id === transcribeId) ?? null

  return (
    <div className="page">
      <PageHeader
        title="Video Library"
        description="Local video uploads with real previews. Only details like name, size and duration are saved — files never leave your device."
      />

      <div className="library-grid">
        <Card title="Add a local video" icon={<Upload size={17} aria-hidden="true" />}>
          <div
            className={dragging ? 'dropzone is-drag' : 'dropzone'}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void handleFiles(e.dataTransfer.files)
            }}
          >
            <span className="dropzone__icon" aria-hidden="true">
              <Film size={26} />
            </span>
            <p className="dropzone__text">
              <strong>Drag a video here</strong> or
            </p>
            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse files
            </Button>
            <small className="dropzone__hint">MP4 · WebM · M4V · MOV · OGV — up to 512 MB (demo limit)</small>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                void handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
          <DemoNote>
            Uploads are previewed locally via the browser’s file API. Metadata stays in localStorage; the binary file itself is re-attached each session.
          </DemoNote>
        </Card>

        <Card
          title={`Library (${state.videos.length})`}
          subtitle="Sample rows carry metadata only — attach a file to preview them."
          flush
        >
          {state.videos.length === 0 ? (
            <div className="card__body">
              <EmptyState
                icon={<Film size={26} aria-hidden="true" />}
                title="No videos yet"
                description="Drop a supported local video above to try real previews and timestamp planning."
                action={
                  <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
                    Upload a video
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="video-grid">
              {state.videos.map((video) => {
                const url = thumbUrl(video)
                const attached = url != null
                return (
                  <li key={video.id} className="video-card">
                    <div className="vthumb">
                      {attached ? (
                        <button
                          type="button"
                          className="vthumb__btn"
                          onClick={() => setPreviewId(video.id)}
                          aria-label={`Preview ${video.name}`}
                        >
                          <video
                            src={url}
                            muted
                            playsInline
                            preload="metadata"
                            tabIndex={-1}
                          />
                          <span className="vthumb__play" aria-hidden="true">
                            <CirclePlay size={30} />
                          </span>
                        </button>
                      ) : video.thumb ? (
                        <span className="vthumb__img-wrap">
                          <img className="vthumb__img" src={video.thumb} alt={`Saved thumbnail for ${video.name}`} />
                          <span className="vthumb__play vthumb__play--dim" aria-hidden="true">
                            <Camera size={22} />
                          </span>
                        </span>
                      ) : (
                        <div className="vthumb__empty" aria-hidden="true" />
                      )}
                      {video.duration == null && attached && (
                        <span className="vthumb__meta">
                          <Clock size={11} aria-hidden="true" /> Reading duration…
                        </span>
                      )}
                      {attached && video.duration != null && (
                        <span className="vthumb__meta">{formatClock(video.duration)}</span>
                      )}
                    </div>
                    <div className="video-card__body">
                      <span className="video-card__name" title={video.name}>
                        {video.name}
                      </span>
                      <span className="video-card__chips">
                        {video.sample && <Badge tone="warn">Sample metadata</Badge>}
                        {attached ? <Badge tone="ok">File attached</Badge> : <Badge tone="muted">Not attached</Badge>}
                        {video.transcript && (
                          <Badge tone="ok">{video.transcript.captions.length} caption lines</Badge>
                        )}
                      </span>
                      <span className="video-card__meta">
                        {formatBytes(video.size)} · {video.type} · added {relativeTime(video.addedAt)}
                      </span>
                      <div className="video-card__actions">
                        {!attached && (
                          <Button size="sm" onClick={() => pickAttach(video.id)}>
                            <FolderOpen size={14} aria-hidden="true" />
                            Attach file
                          </Button>
                        )}
                        {attached && (
                          <Button size="sm" onClick={() => setPreviewId(video.id)}>
                            Preview
                          </Button>
                        )}
                        {attached && (
                          <Button size="sm" onClick={() => setTranscribeId(video.id)}>
                            <AudioLines size={14} aria-hidden="true" />
                            {video.transcript ? 'Re-transcribe' : 'Transcribe'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="btn--danger-ghost"
                          onClick={() => {
                            removeVideo(video.id)
                            toast('info', 'Video removed', `${video.name} and its clip jobs were deleted locally.`)
                          }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <input
            ref={attachInputRef}
            type="file"
            accept="video/*"
            className="sr-only"
            onChange={(e) => {
              void handleAttachFiles(e.target.files)
              e.target.value = ''
              setAttachTarget(null)
            }}
          />
        </Card>
      </div>

      <Modal
        open={previewing != null}
        title={previewing ? `Preview — ${previewing.name}` : ''}
        onClose={() => setPreviewId(null)}
        footer={
          previewing ? (
            <div className="modal-actions">
              <Button
                onClick={() => {
                  void captureThumb(previewing.id, previewVideoRef.current?.currentTime ?? 0)
                }}
              >
                <Camera size={15} aria-hidden="true" />
                Set as thumbnail
              </Button>
              <Button
                onClick={() => {
                  if (!previewing) return
                  void downloadFrame(
                    previewing.id,
                    previewVideoRef.current?.currentTime ?? 0,
                    `${previewing.name.replace(/\.[^.]+$/, '')} — frame`,
                  )
                }}
              >
                <ImageDown size={15} aria-hidden="true" />
                Save frame PNG
              </Button>
              <DemoNote>Frame capture writes only inside your browser — the stored thumbnail persists locally.</DemoNote>
            </div>
          ) : undefined
        }
      >
        {previewing &&
          (previewUrl ? (
            <video
              ref={previewVideoRef}
              src={previewUrl}
              controls
              playsInline
              className="preview-player"
            />
          ) : (
            <EmptyState
              icon={<Film size={26} aria-hidden="true" />}
              title="No file attached in this session"
              description="Object URLs can't be recovered after a page reload. Attach the file again from the library to restore the preview."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setPreviewId(null)
                    pickAttach(previewing.id)
                  }}
                >
                  <FolderOpen size={15} aria-hidden="true" />
                  Attach file
                </Button>
              }
            />
          ))}
      </Modal>

      {transcribing && (
        <TranscribeModal
          video={transcribing}
          onClose={() => {
            setTranscribeId(null)
          }}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------ transcription modal ---

type TranscribePhase = 'uploading' | 'processing' | 'done' | 'error'

/**
 * Runs a real transcription through the local AI service and shows honest
 * progress: the upload percentage first, then the service's own stage names.
 * Failures are displayed as-is - nothing is faked or smoothed over.
 */
function TranscribeModal({ video, onClose }: { video: VideoAsset; onClose: () => void }) {
  const { transcribeVideo, toast } = useApp()
  const [phase, setPhase] = useState<TranscribePhase>('uploading')
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('Starting')
  const [error, setError] = useState<string | null>(null)

  // The context value is rebuilt on every state change, so keep the latest
  // function in a ref instead of using it as an effect dependency.
  const runRef = useRef(transcribeVideo)
  useEffect(() => {
    runRef.current = transcribeVideo
  }, [transcribeVideo])

  const videoName = video.name

  useEffect(() => {
    let cancelled = false
    const file = getAttachedFile(video.id)
    if (!file) {
      setPhase('error')
      setError(
        'This file is no longer attached in this session. Attach it again from the library, then transcribe.',
      )
      return
    }

    setPhase('uploading')
    setStage('Uploading to the local service')

    void runRef
      .current(video.id, file, {
        onUpload: (fraction) => {
          if (cancelled) return
          setPhase('uploading')
          setProgress(Math.round(fraction * 100))
          setStage('Uploading to the local service')
        },
        onProgress: (fraction, label) => {
          if (cancelled) return
          setPhase('processing')
          setProgress(Math.max(3, Math.round(fraction * 100)))
          setStage(label)
        },
      })
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setPhase('done')
          setProgress(100)
          setStage('Done')
          toast('success', 'Transcript ready', `${videoName} was transcribed on your own CPU.`)
        } else {
          setPhase('error')
          setError(result.error ?? 'Transcription failed.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [video.id, videoName, toast])

  return (
    <Modal
      open
      title="Transcribing with the local AI service"
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <Button onClick={onClose}>{phase === 'done' ? 'Close' : 'Hide'}</Button>
        </div>
      }
    >
      <p className="muted">{video.name}</p>

      {phase !== 'error' && (
        <>
          <Progress value={progress} label={stage} />
          <p className="muted" style={{ marginTop: '0.6rem' }}>
            {stage} — {progress}%
          </p>
        </>
      )}

      {phase === 'error' && (
        <p role="alert" style={{ color: 'var(--danger, #f87171)' }}>
          {error}
        </p>
      )}

      {phase === 'done' && (
        <p>
          The transcript is stored on this video. Open <strong>Clip Studio</strong> to copy its lines into a clip
          and export SRT / VTT.
        </p>
      )}

      <DemoNote>
        Speech recognition runs on your own CPU through the local service (backend/app.py). The first run
        downloads the Whisper model once; after that it works offline.
      </DemoNote>
    </Modal>
  )
}
