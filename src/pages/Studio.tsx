import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  CirclePlay,
  Clock,
  Download,
  Film,
  Pencil,
  Plus,
  RefreshCw,
  Scissors,
  Share2,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import type { PublishResult } from '../store/AppStore'
import { navigate } from '../lib/router'
import { ASPECTS, YT_CATEGORIES } from '../lib/options'
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
  RelTime,
  StatusBadge,
  cx,
} from '../components/ui'
import { dateKey, formatBytes, formatClock } from '../lib/format'
import { substitute, templateVars } from '../lib/templates'
import type { AspectId, CaptionLine, ClipJob, TextTemplate } from '../types'

export default function StudioPage() {
  const { state, addClip, toast } = useApp()
  const videos = state.videos
  const [videoId, setVideoId] = useState('')
  const [start, setStart] = useState('0:00')
  const [end, setEnd] = useState('0:30')
  const [aspect, setAspect] = useState<AspectId>(state.prefs.defaultAspect)
  const [title, setTitle] = useState('')
  const [autoSplit, setAutoSplit] = useState(false)
  const [splitCount, setSplitCount] = useState(3)
  const [formError, setFormError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [publishClipId, setPublishClipId] = useState<string | null>(null)

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
    const startSec = parseClock(start)
    const endSec = parseClock(end)
    if (startSec == null) {
      setFormError('Start time must look like 0:30 or 1:02:03.')
      return
    }
    if (endSec == null) {
      setFormError('End time must look like 0:45 or 1:02:03.')
      return
    }
    if (endSec <= startSec) {
      setFormError('The end time must be after the start time.')
      return
    }
    if (selectedVideo.duration != null && endSec > selectedVideo.duration + 0.25) {
      setFormError(`End time is beyond the video length (${formatClock(selectedVideo.duration)}).`)
      return
    }
    if (autoSplit) {
      const n = Math.max(2, Math.min(6, Math.round(splitCount)))
      const total = endSec - startSec
      if (total < n * 3) {
        setFormError('The range is too short to split — each part needs at least 3 seconds.')
        return
      }
      const base = title.trim()
      const seg = total / n
      for (let i = 1; i <= n; i += 1) {
        const partStart = Math.round(startSec + (i - 1) * seg)
        const partEnd = i === n ? endSec : Math.round(startSec + i * seg)
        const partTitle = base
          ? `${base} · Part ${i}/${n}`
          : `${selectedVideo.name.replace(/\.[^.]+$/, '')} · Part ${i}/${n}`
        const result = addClip({
          videoId: selectedVideo.id,
          startText: `${partStart}`,
          endText: `${partEnd}`,
          aspect,
          title: partTitle,
        })
        if (!result.ok) {
          setFormError(`Part ${i}: ${result.error}`)
          return
        }
      }
      setTitle('')
      setSplitCount(3)
      toast('success', `${n} clips queued (simulated)`, 'Equal parts were cut from the same range.')
      return
    }
    const result = addClip({ videoId: selectedVideo.id, startText: start, endText: end, aspect, title })
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    setTitle('')
    toast('success', 'Clip queued (simulated)', 'The local timer walks it through the demo pipeline.')
  }

  const previewClip = state.clips.find((c) => c.id === previewId) ?? null
  const previewVideo = previewClip
    ? (state.videos.find((v) => v.id === previewClip.videoId) ?? null)
    : null
  const previewUrl = usePreviewVideoUrl(previewVideo?.id ?? null)
  const editingClip = state.clips.find((c) => c.id === editingId) ?? null
  const publishClip = state.clips.find((c) => c.id === publishClipId) ?? null

  return (
    <div className="page">
      <PageHeader
        title="Clip Studio"
        description="Plan clips, auto-split long ranges, render them for real in your browser, and publish to YouTube on schedule."
        actions={
          <>
            <Badge tone="ok">Real render & publish</Badge>
            <Badge tone="accent">Simulated queue</Badge>
          </>
        }
      />

      {videos.length === 0 ? (
        <Card flush>
          <div className="card__body">
            <EmptyState
              icon={<Film size={26} aria-hidden="true" />}
              title="No videos to clip yet"
              description="Add a local video in the Video Library first — attached files get real range previews and real renders."
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
              <div className={cx('split-row', autoSplit && 'is-active')}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSplit}
                  className={cx('toggle', autoSplit && 'is-on')}
                  onClick={() => setAutoSplit(!autoSplit)}
                >
                  <span className="toggle__knob" aria-hidden="true" />
                </button>
                <div className="toggle-row__text">
                  <span className="toggle-row__label">Auto-split into equal parts</span>
                  <small className="toggle-row__hint">One long section → 2–6 reel-sized clips in one go</small>
                </div>
                {autoSplit && (
                  <input
                    className="input split-row__count"
                    value={splitCount}
                    onChange={(e) => setSplitCount(Number(e.target.value.replace(/\D/g, '')) || 0)}
                    inputMode="numeric"
                    aria-label="Number of parts"
                    aria-describedby="split-help"
                    autoComplete="off"
                  />
                )}
              </div>
              {autoSplit && (
                <p className="field__hint" id="split-help">
                  Cuts [{start} → {end}] into {Math.round(splitCount) || 0} equal ranges; each becomes its own
                  queued clip.
                </p>
              )}
              {formError && (
                <p className="field__msg" role="alert">
                  {formError}
                </p>
              )}
              <div className="studio-form__actions">
                <Button variant="primary" type="submit">
                  {autoSplit ? 'Queue split plan (simulated)' : 'Queue clip (simulated)'}
                </Button>
                {selectedVideo?.duration != null && (
                  <span className="muted num">Source length: {formatClock(selectedVideo.duration)}</span>
                )}
              </div>
            </form>
          </Card>

          <QueueList
            onPreview={setPreviewId}
            onEdit={setEditingId}
            onPublish={setPublishClipId}
          />
        </div>
      )}

      {state.clips.length > 0 && videos.length === 0 && (
        <QueueList onPreview={setPreviewId} onEdit={setEditingId} onPublish={setPublishClipId} />
      )}

      <ExportsCard onPublish={setPublishClipId} />

      <PreviewModal clip={previewClip} url={previewUrl} onClose={() => setPreviewId(null)} />
      {editingClip && (
        <ClipEditorModal
          key={editingClip.id}
          clip={editingClip}
          onClose={() => setEditingId(null)}
          onPublish={setPublishClipId}
        />
      )}
      {publishClip && (
        <PublishModal key={publishClip.id} clip={publishClip} onClose={() => setPublishClipId(null)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- helpers ---

/** Permissive clock-text parser for the split form (mirrors addClip rules). */
function parseClock(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(trimmed)) return null
  const parts = trimmed.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0]
}

function usePreviewVideoUrl(videoId: string | null): string | null {
  const { videoUrl } = useApp()
  return videoId == null ? null : videoUrl(videoId)
}

// ----------------------------------------------------------- preview modal ---

function PreviewModal({
  clip,
  url,
  onClose,
}: {
  clip: ClipJob | null
  url: string | null
  onClose: () => void
}) {
  const { exportClip, renderState, cancelRender } = useApp()
  const busy = clip != null && renderState?.clipId === clip.id
  return (
    <Modal
      open={clip != null}
      title={clip ? `Preview — ${clip.title}` : ''}
      onClose={onClose}
      footer={
        clip ? (
          <div className="modal-actions">
            {busy ? (
              <div className="render-inline">
                <Progress value={renderState?.progress ?? 0} label="Real render progress" />
                <Button size="sm" onClick={() => cancelRender()}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="primary" onClick={() => void exportClip(clip.id)}>
                <Wand2 size={15} aria-hidden="true" />
                Render clip (real)
              </Button>
            )}
            <DemoNote>
              Playback is your local file; rendering really re-encodes it locally at {clip.aspect}.
            </DemoNote>
          </div>
        ) : undefined
      }
    >
      {clip &&
        (url ? (
          <video src={url} controls playsInline className="preview-player" />
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
  )
}

// ------------------------------------------------------------ queue list ----

function QueueList({
  onPreview,
  onEdit,
  onPublish,
}: {
  onPreview: (clipId: string) => void
  onEdit: (clipId: string) => void
  onPublish: (clipId: string) => void
}) {
  const { state, removeClip, clearDoneClips, videoUrl, toast, exportClip, cancelRender, renderState } = useApp()
  const activeClips = state.clips.filter((c) => c.status !== 'done')
  const doneClips = state.clips.filter((c) => c.status === 'done')
  const ordered = [...activeClips, ...doneClips]

  return (
    <Card
      title={`Clip queue (${state.clips.length})`}
      subtitle="Simulated queue · real render/export happens on demand below"
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
            description="Queue a clip to see the demo pipeline — then use Render (real) to make an actual file."
          />
        </div>
      ) : (
        <ul className="queue-list">
          {ordered.map((clip) => {
            const videoName = state.videos.find((v) => v.id === clip.videoId)?.name ?? 'Removed video'
            const attached = videoUrl(clip.videoId) != null
            const rendering = renderState?.clipId === clip.id
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
                    {(clip.captionLines?.length ?? 0) > 0 && <Badge tone="ok">captions</Badge>}
                  </span>
                  {rendering ? (
                    <div className="render-inline">
                      <Progress
                        value={renderState?.progress ?? 0}
                        label={`Real render progress for ${clip.title}`}
                      />
                      <Button size="sm" variant="ghost" onClick={() => cancelRender()}>
                        Cancel render
                      </Button>
                    </div>
                  ) : (
                    clip.status === 'processing' && (
                      <Progress value={clip.progress} label={`Simulated progress for ${clip.title}`} />
                    )
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
                      disabled={!attached || rendering}
                      title={attached ? 'Render this range into a real video file (in-browser)' : 'Attach the source file first'}
                      onClick={() => void exportClip(clip.id)}
                    >
                      <Wand2 size={14} aria-hidden="true" />
                      Render
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(clip.id)}>
                      <Pencil size={14} aria-hidden="true" />
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onPublish(clip.id)}>
                      <Share2 size={14} aria-hidden="true" />
                      Publish
                    </Button>
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

// ------------------------------------------------------------ exports card ---

function ExportsCard({ onPublish }: { onPublish: (clipId: string) => void }) {
  const { exports, downloadExport, removeExport, toast, state } = useApp()
  const rows = [...exports].sort((a, b) => b.createdAt - a.createdAt)
  return (
    <Card
      title={`Exports (${rows.length})`}
      subtitle="Real files rendered in your browser this session — free, no credits"
      icon={<Download size={17} aria-hidden="true" />}
      flush
    >
      {rows.length === 0 ? (
        <div className="card__body">
          <EmptyState
            icon={<Wand2 size={26} aria-hidden="true" />}
            title="No exports this session"
            description='Use "Render" on any clip — the real cropped video appears here as a downloadable file.'
          />
        </div>
      ) : (
        <ul className="export-list">
          {rows.map((entry) => {
            const clip = state.clips.find((c) => c.id === entry.clipId)
            return (
              <li key={entry.id} className="export-row">
                <span className="export-row__icon">
                  <Film size={16} aria-hidden="true" />
                </span>
                <div className="export-row__main">
                  <span className="export-row__name" title={entry.name}>
                    {entry.name}
                  </span>
                  <span className="export-row__meta num">
                    {formatBytes(entry.size)} · {entry.mime.split(';')[0]} · <RelTime at={entry.createdAt} />
                  </span>
                </div>
                <div className="export-row__actions">
                  <Badge tone="muted">{entry.aspect}</Badge>
                  <Button
                    size="sm"
                    onClick={() => {
                      downloadExport(entry.id)
                      toast('success', 'Download started', entry.name)
                    }}
                  >
                    <Download size={14} aria-hidden="true" />
                    Download
                  </Button>
                  {clip && (
                    <Button size="sm" variant="ghost" onClick={() => onPublish(clip.id)}>
                      <Share2 size={14} aria-hidden="true" />
                      Publish
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="btn--danger-ghost"
                    aria-label={`Remove ${entry.name}`}
                    onClick={() => {
                      removeExport(entry.id)
                      toast('info', 'Export removed', 'You can render again anytime — it stays free.')
                    }}
                  >
                    <X size={14} aria-hidden="true" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="card__body demo-note-wrap">
        <DemoNote>Rendered files live in memory for this session — re-render anytime, always free.</DemoNote>
      </div>
    </Card>
  )
}

// ------------------------------------------------------ clip editor modal ---

function ClipEditorModal({
  clip,
  onClose,
  onPublish,
}: {
  clip: ClipJob
  onClose: () => void
  onPublish: (clipId: string) => void
}) {
  const { state, addCaptionLine, updateCaptionLine, removeCaptionLine, exportCaptions } = useApp()
  const [nStart, setNStart] = useState('')
  const [nEnd, setNEnd] = useState('')
  const [nText, setNText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState<string>(state.textTemplates[0]?.id ?? '')

  const video = state.videos.find((v) => v.id === clip.videoId) ?? null
  const lines = clip.captionLines ?? []
  const template = state.textTemplates.find((t) => t.id === templateId) ?? state.textTemplates[0] ?? null

  const preview = useMemo(() => {
    if (!template) return null
    const vars = templateVars({
      clipTitle: clip.title,
      videoName: video?.name ?? 'the video',
      startText: formatClock(clip.start),
      endText: formatClock(clip.end),
      aspect: clip.aspect,
      date: dateKey(new Date()),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    })
    return {
      title: substitute(template.title, vars),
      description: substitute(template.description, vars),
      hashtags: substitute(template.hashtags, vars),
    }
  }, [clip, template, video])

  const addLine = () => {
    setError(null)
    const start = Number(nStart)
    const end = Number(nEnd)
    if (!Number.isFinite(start) || start < 0) {
      setError('Start needs a number of seconds ≥ 0.')
      return
    }
    if (!Number.isFinite(end) || end <= start) {
      setError('End must be a number of seconds after the start.')
      return
    }
    if (!nText.trim()) {
      setError('Write the caption text for this line.')
      return
    }
    const line: Omit<CaptionLine, 'id'> = { start, end, text: nText.trim().slice(0, 120) }
    addCaptionLine(clip.id, line)
    setNStart('')
    setNEnd('')
    setNText('')
  }

  return (
    <Modal
      open
      title={`Editing — ${clip.title}`}
      onClose={onClose}
      footer={
        <div className="modal-actions">
          <Button onClick={() => exportCaptions(clip.id, 'srt')}>Download SRT</Button>
          <Button onClick={() => exportCaptions(clip.id, 'vtt')}>Download VTT</Button>
          <Button variant="primary" onClick={() => { onClose(); onPublish(clip.id) }}>
            <UploadCloud size={15} aria-hidden="true" />
            Publish to YouTube…
          </Button>
        </div>
      }
    >
      <p className="muted editor-lede">
        {formatClock(clip.start)}–{formatClock(clip.end)} · {clip.aspect} · from{' '}
        {video?.name ?? 'a library video'}
      </p>

      <div className="editor-block">
        <h3 className="editor-block__title">Caption lines</h3>
        {lines.length === 0 ? (
          <p className="muted">
            No caption lines yet. Add timings (in seconds from the clip's first frame) and text — they export
            as real SRT/VTT and can auto-attach during publishing.
          </p>
        ) : (
          <ul className="caption-edit-list">
            {lines.map((line) => (
              <li key={line.id} className="caption-edit-row">
                <input
                  className="input caption-edit-row__num"
                  type="number"
                  step="0.1"
                  min={0}
                  value={line.start}
                  aria-label="Line start (seconds)"
                  onChange={(e) => updateCaptionLine(clip.id, line.id, { start: Number(e.target.value) })}
                />
                <input
                  className="input caption-edit-row__num"
                  type="number"
                  step="0.1"
                  min={0}
                  value={line.end}
                  aria-label="Line end (seconds)"
                  onChange={(e) => updateCaptionLine(clip.id, line.id, { end: Number(e.target.value) })}
                />
                <input
                  className="input"
                  value={line.text}
                  aria-label="Line text"
                  maxLength={120}
                  onChange={(e) => updateCaptionLine(clip.id, line.id, { text: e.target.value })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="btn--danger-ghost"
                  aria-label="Delete caption line"
                  onClick={() => removeCaptionLine(clip.id, line.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="caption-edit-row caption-edit-row--new">
          <input
            className="input caption-edit-row__num"
            type="number"
            step="0.1"
            min={0}
            placeholder="start"
            aria-label="New line start (seconds)"
            value={nStart}
            onChange={(e) => setNStart(e.target.value)}
          />
          <input
            className="input caption-edit-row__num"
            type="number"
            step="0.1"
            min={0}
            placeholder="end"
            aria-label="New line end (seconds)"
            value={nEnd}
            onChange={(e) => setNEnd(e.target.value)}
          />
          <input
            className="input"
            placeholder="Caption text"
            aria-label="New line text"
            maxLength={120}
            value={nText}
            onChange={(e) => setNText(e.target.value)}
          />
          <Button size="sm" variant="secondary" onClick={addLine}>
            <Plus size={14} aria-hidden="true" />
            Add
          </Button>
        </div>
        {error && (
          <p className="field__msg" role="alert">
            {error}
          </p>
        )}
      </div>

      {template && (
        <div className="editor-block">
          <h3 className="editor-block__title">Text template (used when publishing)</h3>
          <select
            className="input input--select"
            value={template.id}
            onChange={(e) => setTemplateId(e.target.value)}
            aria-label="Text template"
          >
            {state.textTemplates.map((t: TextTemplate) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {preview && (
            <div className="template-preview">
              <span className="template-preview__label">Title</span>
              <p className="template-preview__line">{preview.title}</p>
              <span className="template-preview__label">Description</span>
              <p className="template-preview__line template-preview__line--pre">{preview.description}</p>
              <span className="template-preview__label">Hashtags</span>
              <p className="template-preview__line">{preview.hashtags}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ------------------------------------------------------------ publish modal ---

function PublishModal({ clip, onClose }: { clip: ClipJob; onClose: () => void }) {
  const { state, exports, publishClip, cancelPublish, publishState, toast } = useApp()
  const video = state.videos.find((v) => v.id === clip.videoId) ?? null
  const clipExports = useMemo(
    () => exports.filter((e) => e.clipId === clip.id),
    [exports, clip.id],
  )
  const [exportId, setExportId] = useState<string | null>(clipExports[0]?.id ?? null)
  const [useSourceFile, setUseSourceFile] = useState(clipExports.length === 0)
  const tomorrow = dateKey(new Date(Date.now() + 86_400_000))
  const [title, setTitle] = useState(clip.title.slice(0, 100))
  const [description, setDescription] = useState(
    `Cut from "${videoName(clip, state.videos)}" at ${formatClock(clip.start)}–${formatClock(clip.end)}.\n\n#shorts`,
  )
  const [tagsText, setTagsText] = useState('#shorts #reels')
  const [privacy, setPrivacy] = useState<'public' | 'private' | 'unlisted'>('private')
  const [publishDate, setPublishDate] = useState(tomorrow)
  const [publishTime, setPublishTime] = useState('09:00')
  const [categoryId, setCategoryId] = useState('22')
  const [attachCaptions, setAttachCaptions] = useState((clip.captionLines?.length ?? 0) > 0)
  const [result, setResult] = useState<PublishResult | null>(null)

  const connected = state.ytChannel != null
  const configured = state.ytClientId.trim() !== ''
  const scheduled = privacy === 'private' && publishDate !== '' && publishTime !== ''
  const busy = publishState != null && publishState.clipId === clip.id
  const lineCount = clip.captionLines?.length ?? 0

  const prefillFromTemplate = () => {
    const template = state.textTemplates[0]
    if (!template) return
    const vars = templateVars({
      clipTitle: clip.title,
      videoName: video?.name ?? 'the video',
      startText: formatClock(clip.start),
      endText: formatClock(clip.end),
      aspect: clip.aspect,
      date: dateKey(new Date()),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    })
    setTitle(substitute(template.title, vars))
    setDescription(substitute(template.description, vars))
    setTagsText(substitute(template.hashtags, vars))
    toast('info', 'Template applied', `Used "${template.label}" for title, description and hashtags.`)
  }

  const submit = async () => {
    if (!title.trim()) {
      toast('error', 'Title required', 'YouTube requires a title for every upload.')
      return
    }
    const tags = tagsText.split(/[\s,]+/).filter(Boolean)
    const outcome = await publishClip({
      exportId: useSourceFile ? null : exportId,
      useSourceFile,
      clipId: clip.id,
      metadata: {
        title: title.trim(),
        description,
        tags,
        privacy,
        publishDate,
        publishTime,
        categoryId,
        attachCaptions,
      },
    })
    setResult(outcome)
    if (outcome.ok && outcome.link) {
      toast('success', 'Published to YouTube', outcome.link)
    } else if (!outcome.ok && outcome.error) {
      toast('error', 'Publish failed', outcome.error)
    }
  }

  const totalBytes = publishState?.clipId === clip.id ? publishState.totalBytes : 0
  const uploadedBytes = publishState?.clipId === clip.id ? publishState.uploadedBytes : 0
  const pct = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0

  return (
    <Modal
      open
      title={`Publish — ${clip.title}`}
      onClose={onClose}
      footer={
        busy ? (
          <div className="modal-actions">
            <Progress value={pct} label="Upload progress" />
            <Button onClick={() => cancelPublish()}>Cancel upload</Button>
            <span className="muted num">
              {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
              {publishState?.clipId === clip.id ? ` · ${publishState.label}` : ''}
            </span>
          </div>
        ) : (
          <div className="modal-actions">
            <Button onClick={prefillFromTemplate}>
              <Wand2 size={15} aria-hidden="true" />
              Apply template
            </Button>
            <Button variant="primary" onClick={() => void submit()}>
              <UploadCloud size={15} aria-hidden="true" />
              Upload now
            </Button>
          </div>
        )
      }
    >
      {!configured ? (
        <div className="yt-warn">
          <p>
            <Share2 size={16} aria-hidden="true" /> Connect your YouTube channel first:
            Settings → YouTube publishing → paste your own Google OAuth Client ID (free, 2 minutes — the page
            has a step-by-step guide).
          </p>
          <Button size="sm" onClick={() => { onClose(); navigate('/settings') }}>
            Open Settings
          </Button>
        </div>
      ) : connected ? (
        <p className="yt-chip">
          <Share2 size={16} aria-hidden="true" />
          Publishing to <strong>{state.ytChannel?.title}</strong> ({state.ytChannel?.customUrl})
        </p>
      ) : null}

      {clipExports.length === 0 && !useSourceFile && (
        <div className="yt-warn">
          <p>This clip has no session render yet. Render it (real) or upload the source file instead.</p>
          <Button size="sm" onClick={() => setUseSourceFile(true)}>
            Use source file
          </Button>
        </div>
      )}

      <Field label="Video file to upload" required>
        <div className="field-row field-row--inline">
          <label className="radio-row">
            <input
              type="radio"
              name="src"
              checked={useSourceFile}
              onChange={() => setUseSourceFile(true)}
              disabled
              aria-label="Source file"
            />
            <span>Source file{video ? ` — ${video.name}` : ''}</span>
          </label>
        </div>
        <select
          className="input input--select"
          value={useSourceFile ? '' : exportId ?? ''}
          disabled={useSourceFile || clipExports.length === 0}
          aria-label="Rendered export to upload"
          onChange={(e) => setExportId(e.target.value)}
        >
          <option value="" disabled>
            {clipExports.length === 0 ? 'No session renders yet' : 'Choose a rendered export…'}
          </option>
          {clipExports.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} · {formatBytes(entry.size)} · {entry.aspect}
            </option>
          ))}
        </select>
        {!useSourceFile && clipExports.length > 0 && (
          <p className="field__hint">
            Uploading the real rendered reel ({clipExports.find((e) => e.id === exportId)?.aspect ?? clip.aspect}).
          </p>
        )}
        {useSourceFile && (
          <p className="field__hint">Uploading the full source video as a normal YouTube video.</p>
        )}
      </Field>

      <Field label="Title" htmlFor="pub-title" required hint={`${title.length}/100`}>
        <input
          id="pub-title"
          className="input"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Reel title"
        />
      </Field>

      <Field label="Description" htmlFor="pub-desc">
        <textarea
          id="pub-desc"
          className="input input--area"
          rows={5}
          value={description}
          maxLength={4900}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <Field label="Hashtags / tags" htmlFor="pub-tags" hint="Shown in the description and used as upload tags.">
        <input
          id="pub-tags"
          className="input"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="#shorts #reels #daily"
        />
      </Field>

      <div className="field-row">
        <Field label="Privacy" required>
          <select
            className="input input--select"
            value={privacy}
            onChange={(e) => setPrivacy(e.target.value as typeof privacy)}
          >
            <option value="private">Private + scheduled publish</option>
            <option value="public">Public immediately</option>
            <option value="unlisted">Unlisted</option>
          </select>
        </Field>
        {privacy === 'private' && (
          <>
            <Field label="Publish date" htmlFor="pub-date" required>
              <input
                id="pub-date"
                className="input"
                type="date"
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
              />
            </Field>
            <Field label="Publish time" htmlFor="pub-time" required>
              <input
                id="pub-time"
                className="input"
                type="time"
                value={publishTime}
                onChange={(e) => setPublishTime(e.target.value)}
              />
            </Field>
          </>
        )}
      </div>
      {scheduled && (
        <p className="field__hint">
          Uploads as <strong>private</strong>; YouTube itself will flip it public at {publishDate}{' '}
          {publishTime} (your local time). You can close this website afterwards — the schedule lives on
          YouTube, not here.
        </p>
      )}

      <div className="field-row">
        <Field label="Category" required>
          <select
            className="input input--select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {YT_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
        </Field>
        {lineCount > 0 ? (
          <div className="toggle-row publish-captions">
            <button
              type="button"
              role="switch"
              aria-checked={attachCaptions}
              className={cx('toggle', attachCaptions && 'is-on')}
              onClick={() => setAttachCaptions(!attachCaptions)}
            >
              <span className="toggle__knob" aria-hidden="true" />
            </button>
            <div className="toggle-row__text">
              <span className="toggle-row__label">Attach caption track ({lineCount} lines)</span>
              <small className="toggle-row__hint">Your real VTT lines upload with the video</small>
            </div>
          </div>
        ) : (
          <Field label="Captions">
            <p className="muted">Add caption lines via Edit to auto-attach a VTT track.</p>
          </Field>
        )}
      </div>

      {result && !result.ok && result.error && (
        <p className="field__msg" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && result.link && (
        <div className="publish-ok">
          <CheckCircle2 size={16} aria-hidden="true" />
          <a href={result.link} target="_blank" rel="noreferrer">
            {result.link}
          </a>
          {scheduled && <span> · goes public at {publishDate} {publishTime}</span>}
        </div>
      )}

      <DemoNote>
        Uploads use your own Google account and the official YouTube API — nothing is stored by this app,
        and your access token never leaves this browser tab.
      </DemoNote>
    </Modal>
  )
}

function videoName(clip: ClipJob, videos: { id: string; name: string }[]): string {
  return videos.find((v) => v.id === clip.videoId)?.name ?? 'the video'
}
