import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  CirclePlay,
  Clock,
  Film,
  Plus,
  RefreshCw,
  Scissors,
  Trash2,
  X,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { navigate } from '../lib/router'
import { ASPECTS } from '../lib/options'
import {
  Badge,
  Button,
  Card,
  DemoNote,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Progress,
  StatusBadge,
  cx,
} from '../components/ui'
import { formatClock } from '../lib/format'
import type { AspectId } from '../types'

export default function StudioPage() {
  const { state, addClip, toast } = useApp()
  const videos = state.videos
  const [videoId, setVideoId] = useState('')
  const [start, setStart] = useState('0:00')
  const [end, setEnd] = useState('0:30')
  const [aspect, setAspect] = useState<AspectId>(state.prefs.defaultAspect)
  const [title, setTitle] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const selectedVideo = useMemo(
    () => videos.find((v) => v.id === (videoId || undefined)) ?? videos[0] ?? null,
    [videos, videoId],
  )

  const submit = () => {
    setFormError(null)
    if (!selectedVideo) {
      setFormError('No video selected — upload one in the Video Library first.')
      return
    }
    const result = addClip({
      videoId: selectedVideo.id,
      startText: start,
      endText: end,
      aspect,
      title,
    })
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    setTitle('')
    toast('success', 'Clip queued (simulated)', 'The local timer walks it through the fake pipeline.')
  }

  const previewClip = state.clips.find((c) => c.id === previewId) ?? null
  const previewVideo = previewClip
    ? (state.videos.find((v) => v.id === previewClip.videoId) ?? null)
    : null
  const previewUrl = usePreviewVideoUrl(previewVideo?.id ?? null)

  return (
    <div className="page">
      <PageHeader
        title="Clip Studio"
        description="Plan clips from library videos with timestamps and aspect ratios. Processing runs on a visible local timer."
        actions={<Badge tone="accent">Simulated processing</Badge>}
      />

      {videos.length === 0 ? (
        <Card flush>
          <div className="card__body">
            <EmptyState
              icon={<Film size={26} aria-hidden="true" />}
              title="No videos to clip yet"
              description="Add a local video in the Video Library first — attached files get real range previews."
              action={
                <Button variant="primary" onClick={() => navigate('/library')}>
                  Go to Video Library
                </Button>
              }
            />
          </div>
        </Card>
      ) : (
        <div className="studio-grid">
          <Card title="New clip" icon={<Plus size={17} aria-hidden="true" />}>
            <form
              className="studio-form"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <Field label="Source video" htmlFor="clip-video" required>
                <select
                  id="clip-video"
                  className="input input--select"
                  value={selectedVideo?.id ?? ''}
                  onChange={(e) => {
                    setVideoId(e.target.value)
                    setFormError(null)
                  }}
                >
                  {videos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.duration != null ? ` · ${formatClock(v.duration)}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="field-row">
                <Field label="Start" htmlFor="clip-start" required hint="e.g. 0:15 or 1:02:03">
                  <input
                    id="clip-start"
                    className="input"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </Field>
                <Field label="End" htmlFor="clip-end" required hint="End must be after start">
                  <input
                    id="clip-end"
                    className="input"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </Field>
              </div>
              <Field label="Aspect ratio" required>
                <div className="aspect-list" role="radiogroup" aria-label="Aspect ratio">
                  {ASPECTS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={aspect === option.id}
                      className={cx('aspect-chip', aspect === option.id && 'is-active')}
                      onClick={() => setAspect(option.id)}
                    >
                      <strong>{option.id}</strong>
                      <small>{option.hint}</small>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Clip name" htmlFor="clip-title" hint="Optional — defaults to the video name plus the range.">
                <input
                  id="clip-title"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Cold-open hook"
                  autoComplete="off"
                />
              </Field>
              {formError && (
                <p className="field__msg" role="alert">
                  {formError}
                </p>
              )}
              <div className="studio-form__actions">
                <Button variant="primary" type="submit">
                  Queue clip (simulated)
                </Button>
                {selectedVideo?.duration != null && (
                  <span className="muted num">Source length: {formatClock(selectedVideo.duration)}</span>
                )}
              </div>
            </form>
          </Card>

          <QueueList onPreview={setPreviewId} />
        </div>
      )}

      {state.clips.length > 0 && videos.length === 0 && <QueueList onPreview={setPreviewId} />}

      <Modal
        open={previewClip != null}
        title={previewClip ? `Preview — ${previewClip.title}` : ''}
        onClose={() => setPreviewId(null)}
        footer={
          <DemoNote>
            Playback is your local file. A future integration would cut{' '}
            {previewClip ? `${formatClock(previewClip.start)}–${formatClock(previewClip.end)}` : 'the range'} at{' '}
            {previewClip?.aspect ?? ''} during a real render.
          </DemoNote>
        }
      >
        {previewClip &&
          (previewUrl ? (
            <video src={previewUrl} controls playsInline className="preview-player" />
          ) : (
            <EmptyState
              icon={<Film size={26} aria-hidden="true" />}
              title="Source file not attached"
              description="Re-attach the video in the Video Library to preview clip ranges."
              action={
                <Button variant="primary" onClick={() => navigate('/library')}>
                  Open Library
                </Button>
              }
            />
          ))}
      </Modal>
    </div>
  )
}

/**
 * Small hook so reading an attached object URL stays inside normal React
 * lifecycle (registry lookups live outside of context on purpose).
 */
function usePreviewVideoUrl(videoId: string | null): string | null {
  const { videoUrl } = useApp()
  return videoId == null ? null : videoUrl(videoId)
}

/**
 * The queue list is its own component: statuses and progress bars re-render
 * from the simulated ticker in the store.
 */
function QueueList({ onPreview }: { onPreview: (clipId: string) => void }) {
  const { state, removeClip, clearDoneClips, videoUrl, toast } = useApp()
  const activeClips = state.clips.filter((c) => c.status !== 'done')
  const doneClips = state.clips.filter((c) => c.status === 'done')
  const ordered = [...activeClips, ...doneClips]

  return (
    <Card
      title={`Clip queue (${state.clips.length})`}
      subtitle="Queued → Processing → Completed · simulated in-browser"
      icon={<Scissors size={17} aria-hidden="true" />}
      actions={
        doneClips.length > 0 ? (
          <Button
            size="sm"
            onClick={() => {
              clearDoneClips()
              toast('info', 'Completed clips cleared', 'Completed jobs were removed from the queue.')
            }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Clear completed ({doneClips.length})
          </Button>
        ) : undefined
      }
      flush
    >
      {ordered.length === 0 ? (
        <div className="card__body">
          <EmptyState
            icon={<Scissors size={26} aria-hidden="true" />}
            title="Queue is empty"
            description="Queue a simulated clip job to watch the timer-driven status flow."
          />
        </div>
      ) : (
        <ul className="queue-list">
          {ordered.map((clip) => {
            const videoName = state.videos.find((v) => v.id === clip.videoId)?.name ?? 'Removed video'
            const attached = videoUrl(clip.videoId) != null
            return (
              <li key={clip.id} className={cx('queue-row', clip.status === 'done' && 'is-done')}>
                <span className={cx('queue-row__status', `queue-row__status--${clip.status}`)}>
                  {clip.status === 'queued' && <Clock size={16} aria-hidden="true" />}
                  {clip.status === 'processing' && <span className="spin" aria-hidden="true">◔</span>}
                  {clip.status === 'done' && <CheckCircle2 size={16} aria-hidden="true" />}
                </span>
                <div className="queue-row__main">
                  <span className="queue-row__title" title={clip.title}>
                    {clip.title}
                  </span>
                  <span className="queue-row__meta">
                    {videoName} · {formatClock(clip.start)}–{formatClock(clip.end)}
                    <Badge tone="muted">{clip.aspect}</Badge>
                  </span>
                  {clip.status === 'processing' && (
                    <Progress value={clip.progress} label={`Simulated progress for ${clip.title}`} />
                  )}
                </div>
                <div className="queue-row__side">
                  <StatusBadge status={clip.status} />
                  <div className="queue-row__actions">
                    {attached && (
                      <Button size="sm" variant="ghost" onClick={() => onPreview(clip.id)}>
                        <CirclePlay size={14} aria-hidden="true" />
                        Preview
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="btn--danger-ghost"
                      onClick={() => {
                        removeClip(clip.id)
                        toast('info', 'Clip job removed', `"${clip.title}" (and any calendar posts for it) were deleted.`)
                      }}
                    >
                      {clip.status === 'done' ? <Trash2 size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                      {clip.status === 'done' ? 'Remove' : 'Cancel'}
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
