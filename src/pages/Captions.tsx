import { Captions, LayoutTemplate, WandSparkles } from 'lucide-react'
import { useApp } from '../store/AppStore'
import {
  ASPECTS,
  CAPTION_PRESETS,
  FPS_OPTIONS,
  RESOLUTIONS,
} from '../lib/options'
import { Badge, Card, DemoNote, Field, PageHeader, Segmented, Toggle, cx } from '../components/ui'
import type { CaptionPosition } from '../types'

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
            subtitle="Stored as the default export profile for future integrations"
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
            <DemoNote>Format settings describe what a real export would use later; nothing renders here.</DemoNote>
          </Card>
        </div>
      </div>
    </div>
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
