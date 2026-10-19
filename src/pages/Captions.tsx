import { useEffect, useState } from 'react'
import { Captions, LayoutTemplate, Plus, Save, Trash2, WandSparkles } from 'lucide-react'
import { useApp } from '../store/AppStore'
import {
  ASPECTS,
  CAPTION_PRESETS,
  FPS_OPTIONS,
  RESOLUTIONS,
} from '../lib/options'
import { Badge, Button, Card, DemoNote, Field, PageHeader, Segmented, Toggle, cx } from '../components/ui'
import { uid } from '../lib/format'
import { substitute } from '../lib/templates'
import type { CaptionPosition, TextTemplate } from '../types'

export default function CaptionsPage() {
  const { state, setCaptions, setFormat, toast } = useApp()
  const captions = state.captions
  const format = state.format

  const applyPreset = (presetId: string, label: string) => {
    const preset = CAPTION_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setCaptions({ ...preset.style, preset: presetId }, `Applied caption preset "${label}"`)
    toast('success', 'Preset applied', `${label} was saved locally.`)
  }

  const previewWidthClass =
    format.aspect === '16:9' ? 'cap-frame--wide' : format.aspect === '9:16' ? 'cap-frame--tall' : 'cap-frame--square'

  return (
    <div className="page">
      <PageHeader
        title="Captions & Templates"
        description="Design caption styles and pick output formats. Everything is configuration the UI stores locally for you."
        actions={<Badge tone="accent">Local template editor</Badge>}
      />

      <div className="captions-grid">
        <Card title="Live style preview" icon={<Captions size={17} aria-hidden="true" />} className="card--preview">
          <div
            className={cx('cap-frame', previewWidthClass)}
            data-position={captions.position}
            role="img"
            aria-label={`Caption preview: ${captions.position} position, ${captions.fontSize}px text`}
          >
            <span className="cap-frame__scene" aria-hidden="true" />
            <span
              className={cx('cap-frame__caption', !captions.bgEnabled && 'cap-frame__caption--naked')}
              style={{
                fontSize: `${captions.fontSize}px`,
                color: captions.fontColor,
                backgroundColor: captions.bgEnabled ? withOpacity(captions.bgColor, captions.bgOpacity) : 'transparent',
                borderRadius: captions.bgEnabled ? '6px' : '0',
                padding: captions.bgEnabled ? '3px 8px' : '0',
                fontWeight: captions.bgEnabled ? 700 : 600,
                textShadow: captions.bgEnabled ? 'none' : '0 1px 2px rgba(0,0,0,0.65)',
              }}
            >
              This is how captions will sit in your clips
            </span>
          </div>
          <DemoNote>Styling preview only — no video frames are rendered or analyzed in this demo.</DemoNote>
        </Card>

        <div className="captions-col">
          <Card title="Caption style" subtitle="Pick a preset, then fine-tune." icon={<WandSparkles size={17} aria-hidden="true" />}>
            <div className="preset-grid" role="group" aria-label="Caption presets">
              {CAPTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={cx('preset-chip', captions.preset === preset.id && 'is-active')}
                  onClick={() => applyPreset(preset.id, preset.label)}
                >
                  <strong>{preset.label}</strong>
                  <span className="preset-chip__swatches" aria-hidden="true">
                    <i style={{ background: preset.style.fontColor }} />
                    {preset.style.bgEnabled && <i style={{ background: preset.style.bgColor }} />}
                  </span>
                  <small>
                    {preset.style.position} · {preset.style.fontSize}px
                  </small>
                </button>
              ))}
            </div>

            <div className="caption-controls">
              <div className="field-row">
                <Field label={`Font size — ${captions.fontSize}px`} htmlFor="cap-size">
                  <input
                    id="cap-size"
                    className="input input--range"
                    type="range"
                    min={16}
                    max={52}
                    step={2}
                    value={captions.fontSize}
                    onChange={(e) =>
                      setCaptions({ fontSize: Number(e.target.value), preset: 'custom' })
                    }
                  />
                </Field>
                <Field label="Position">
                  <Segmented
                    ariaLabel="Caption position"
                    options={[
                      { value: 'top', label: 'Top' },
                      { value: 'center', label: 'Center' },
                      { value: 'bottom', label: 'Bottom' },
                    ] as { value: CaptionPosition; label: string }[]}
                    value={captions.position}
                    onChange={(position) => setCaptions({ position, preset: 'custom' })}
                  />
                </Field>
              </div>
              <div className="field-row">
                <Field label="Text color">
                  <input
                    type="color"
                    className="input input--color"
                    aria-label="Caption text color"
                    value={captions.fontColor}
                    onChange={(e) => setCaptions({ fontColor: e.target.value, preset: 'custom' })}
                  />
                </Field>
                <Field label="Background bubble">
                  <Toggle
                    checked={captions.bgEnabled}
                    onChange={(on) => setCaptions({ bgEnabled: on, preset: 'custom' }, on ? 'Caption bubble enabled' : 'Caption bubble hidden')}
                    label="Show bubble behind text"
                  />
                </Field>
              </div>
              {captions.bgEnabled && (
                <div className="field-row">
                  <Field label="Bubble color">
                    <input
                      type="color"
                      className="input input--color"
                      aria-label="Caption background color"
                      value={captions.bgColor}
                      onChange={(e) => setCaptions({ bgColor: e.target.value, preset: 'custom' })}
                    />
                  </Field>
                  <Field label={`Bubble opacity — ${captions.bgOpacity}%`} htmlFor="cap-opacity">
                    <input
                      id="cap-opacity"
                      className="input input--range"
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={captions.bgOpacity}
                      onChange={(e) => setCaptions({ bgOpacity: Number(e.target.value), preset: 'custom' })}
                    />
                  </Field>
                </div>
              )}
            </div>
          </Card>

          <Card
            title="Video format options"
            subtitle="Default profile used by the real in-browser render"
            icon={<LayoutTemplate size={17} aria-hidden="true" />}
          >
            <div className="field-row">
              <Field label="Aspect ratio">
                <Segmented
                  ariaLabel="Output aspect ratio"
                  options={ASPECTS.map((a) => ({ value: a.id, label: a.id, hint: undefined }))}
                  value={format.aspect}
                  onChange={(aspect) => setFormat({ aspect })}
                />
              </Field>
            </div>
            <div className="field-row">
              <Field label="Resolution">
                <select
                  className="input input--select"
                  aria-label="Output resolution"
                  value={format.resolution}
                  onChange={(e) => setFormat({ resolution: e.target.value as typeof format.resolution })}
                >
                  {RESOLUTIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Frame rate">
                <Segmented
                  ariaLabel="Output frame rate"
                  options={FPS_OPTIONS.map((f) => ({ value: f.id, label: String(f.id) }))}
                  value={format.fps}
                  onChange={(fps) => setFormat({ fps })}
                />
              </Field>
            </div>
            <DemoNote>The aspect drives Clip Studio's crop; resolution/fps remain the export profile.</DemoNote>
          </Card>
        </div>
      </div>

      <TemplatesCard />
    </div>
  )
}

// ------------------------------------------------------- template editor ---

const SAMPLE_VARS: Record<string, string> = {
  clip: 'Cold Open · Part 1',
  video: 'Studio Session — Episode 04.mp4',
  videoTag: 'studiosession',
  range: '0:00–0:30',
  aspect: '9:16',
  date: '2026-10-19',
  time: '09:00',
}

function TemplatesCard() {
  const { state, setTemplates, toast } = useApp()
  const [drafts, setDrafts] = useState<TextTemplate[]>(() => state.textTemplates.map((t) => ({ ...t })))

  // Re-sync drafts after import/reset/reset-data replaces the templates array.
  useEffect(() => {
    setDrafts(state.textTemplates.map((t) => ({ ...t })))
  }, [state.textTemplates])

  const update = (id: string, patch: Partial<TextTemplate>) => {
    setDrafts((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  const save = () => {
    const invalid = drafts.find((t) => !t.label.trim() || !t.title.trim())
    if (invalid) {
      toast('error', 'Template incomplete', 'Every template needs a label and a title line.')
      return
    }
    setTemplates(
      drafts.map((t) => ({ ...t, label: t.label.trim(), title: t.title.trim() })),
      'Text templates saved',
    )
    toast('success', 'Templates saved', 'Clip Studio will prefill these when publishing.')
  }

  return (
    <Card
      title="Title / description / hashtag templates"
      subtitle="Variables: {{clip}} {{video}} {{videoTag}} {{range}} {{aspect}} {{date}} {{time}} — applied from Clip Studio"
      icon={<LayoutTemplate size={17} aria-hidden="true" />}
      actions={
        <div className="card__actions-inline">
          <Button
            size="sm"
            onClick={() =>
              setDrafts((list) => [
                ...list,
                { id: uid(), label: 'New template', title: '{{clip}}', description: 'From {{video}} · {{range}}\n\n#shorts', hashtags: '#shorts #reels' },
              ])
            }
          >
            <Plus size={14} aria-hidden="true" />
            Add template
          </Button>
          <Button size="sm" variant="primary" onClick={save}>
            <Save size={14} aria-hidden="true" />
            Save templates
          </Button>
        </div>
      }
    >
      {drafts.length === 0 && (
        <p className="muted">No templates yet — add one to prefill YouTube metadata automatically.</p>
      )}
      <ul className="template-list">
        {drafts.map((template) => (
          <li key={template.id} className="template-row">
            <div className="template-row__head">
              <input
                className="input template-row__label"
                value={template.label}
                aria-label="Template label"
                maxLength={40}
                onChange={(e) => update(template.id, { label: e.target.value })}
              />
              <Button
                size="sm"
                variant="ghost"
                className="btn--danger-ghost"
                aria-label={`Delete template ${template.label}`}
                onClick={() => {
                  setDrafts((list) => list.filter((t) => t.id !== template.id))
                  toast('info', 'Template removed from draft', 'Save to keep this change.')
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
              </Button>
            </div>
            <Field label="Title" htmlFor={`tt-${template.id}-title`}>
              <input
                id={`tt-${template.id}-title`}
                className="input"
                value={template.title}
                maxLength={100}
                onChange={(e) => update(template.id, { title: e.target.value })}
              />
            </Field>
            <Field label="Description" htmlFor={`tt-${template.id}-desc`}>
              <textarea
                id={`tt-${template.id}-desc`}
                className="input input--area"
                rows={3}
                value={template.description}
                maxLength={1200}
                onChange={(e) => update(template.id, { description: e.target.value })}
              />
            </Field>
            <Field label="Hashtags" htmlFor={`tt-${template.id}-tags`}>
              <input
                id={`tt-${template.id}-tags`}
                className="input"
                value={template.hashtags}
                onChange={(e) => update(template.id, { hashtags: e.target.value })}
              />
            </Field>
            <p className="template-row__preview muted num" aria-label="Sample substitution preview">
              ▸ {substitute(template.title, SAMPLE_VARS)} — {substitute(template.hashtags, SAMPLE_VARS)}
            </p>
          </li>
        ))}
      </ul>
      <DemoNote>
        Everything here is plain text — substitution runs locally with no AI service. Edits stay drafts until
        you press Save templates.
      </DemoNote>
    </Card>
  )
}

/** '#rrggbb' + opacity% → rgba string for the preview bubble. */
function withOpacity(hex: string, opacityPercent: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean
        .split('')
        .map((c) => c + c)
        .join('')
    : clean
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${(opacityPercent / 100).toFixed(2)})`
}
