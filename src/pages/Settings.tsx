import { useRef, useState } from 'react'
import {
  Captions,
  Database,
  Download,
  FolderOpen,
  HardDrive,
  Info,
  Palette,
  Save,
  Trash2,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { ACCENTS, ASPECTS } from '../lib/options'
import {
  Badge,
  Button,
  Card,
  DemoNote,
  Field,
  Modal,
  PageHeader,
  Segmented,
  Toggle,
} from '../components/ui'
import { formatBytes } from '../lib/format'

export default function SettingsPage() {
  const { state, setPrefs, exportData, importData, resetData, toast } = useApp()
  const prefs = state.prefs
  const importInputRef = useRef<HTMLInputElement>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [lastImport, setLastImport] = useState<string | null>(null)

  const runExport = () => {
    const blob = new Blob([exportData()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'channelai-workspace.json'
    anchor.click()
    URL.revokeObjectURL(url)
    toast('success', 'Workspace exported', 'channelai-workspace.json was saved to your downloads.')
  }

  const runImport = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const raw = await file.text()
    const result = importData(raw)
    setLastImport(result.ok ? file.name : null)
    if (result.ok) {
      toast('success', 'Workspace imported', `${file.name} replaced the current local data.`)
    } else {
      toast('error', 'Import failed', result.error ?? undefined)
    }
  }

  const storageChars = JSON.stringify(state).length

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        description="Interface preferences and local data management. Preferences persist in localStorage — no accounts."
      />

      <div className="settings-grid">
        <Card title="Appearance" icon={<Palette size={17} aria-hidden="true" />}>
          <Field label="Accent color" hint="Applied instantly across the app.">
            <Segmented
              ariaLabel="Accent color"
              options={ACCENTS.map((a) => ({ value: a.id, label: a.label, hint: undefined }))}
              value={prefs.accent}
              onChange={(accent) => setPrefs({ accent }, `Theme accent set to ${ACCENTS.find((a) => a.id === accent)?.label}`)}
            />
          </Field>
          <Field label="Density" hint="Compact tightens paddings and rows.">
            <Segmented
              ariaLabel="Layout density"
              options={[
                { value: 'cozy', label: 'Cozy' },
                { value: 'compact', label: 'Compact' },
              ]}
              value={prefs.density}
              onChange={(density) => setPrefs({ density }, `Layout density set to ${density === 'compact' ? 'Compact' : 'Cozy'}`)}
            />
          </Field>
          <Toggle
            checked={prefs.motionReduced}
            onChange={(on) => setPrefs({ motionReduced: on }, on ? 'Reduced motion enabled' : 'Reduced motion disabled')}
            label="Reduce motion"
            hint="Minimize animations and transitions."
          />
        </Card>

        <Card title="Defaults" icon={<Captions size={17} aria-hidden="true" />}>
          <Field label="Default aspect ratio for new clips" hint="Clip Studio opens with this selected.">
            <select
              className="input input--select"
              aria-label="Default aspect ratio"
              value={prefs.defaultAspect}
              onChange={(e) =>
                setPrefs({ defaultAspect: e.target.value as typeof prefs.defaultAspect }, 'Default clip aspect updated')
              }
            >
              {ASPECTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </Field>
          <DemoNote>
            Defaults only change what the UI preselects. Formats and captions live in their own pages and are saved as you edit.
          </DemoNote>
        </Card>

        <Card title="Data management" icon={<Database size={17} aria-hidden="true" />}>
          <div className="data-summary">
            <div>
              <span>{state.channels.length}</span>
              <small>channels</small>
            </div>
            <div>
              <span>{state.videos.length}</span>
              <small>videos</small>
            </div>
            <div>
              <span>{state.clips.length}</span>
              <small>clips</small>
            </div>
            <div>
              <span>{state.schedule.length}</span>
              <small>scheduled</small>
            </div>
          </div>
          <p className="muted num">≈ {formatBytes(storageChars)} in localStorage under “channel-ai:v1”.</p>
          <div className="data-actions">
            <Button onClick={runExport}>
              <Download size={15} aria-hidden="true" />
              Export as JSON
            </Button>
            <Button onClick={() => importInputRef.current?.click()}>
              <FolderOpen size={15} aria-hidden="true" />
              Import workspace
            </Button>
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              <Trash2 size={15} aria-hidden="true" />
              Reset demo data
            </Button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              void runImport(e.target.files)
              e.target.value = ''
            }}
          />
          {lastImport && (
            <p className="muted">
              Last import: <strong>{lastImport}</strong>
            </p>
          )}
          <DemoNote>Exports contain only the demo workspace (no media files, no secrets).</DemoNote>
        </Card>

        <Card title="About ChannelAI" icon={<Info size={17} aria-hidden="true" />}>
          <ul className="about-list">
            <li>
              <Save size={15} aria-hidden="true" />
              <span>
                <strong>Version v0.1.0</strong> — React + Vite · hash-routed · relative build paths for
                repository-based GitHub Pages.
              </span>
            </li>
            <li>
              <HardDrive size={15} aria-hidden="true" />
              <span>
                <strong>Local-first:</strong> every number, queue row and schedule lives in this browser.
                Clearing site data wipes it — export first if you care.
              </span>
            </li>
            <li>
              <Badge tone="muted">No backend</Badge>
              <span>
                <strong>Simulated:</strong> processing statuses and analytics are generated locally with fixed
                timers. No downloads, renders, caption AI or publishing happen in v0.1 — those require real
                integrations.
              </span>
            </li>
          </ul>
        </Card>
      </div>

      <Modal
        open={resetOpen}
        title="Reset demo data?"
        onClose={() => setResetOpen(false)}
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Keep my data</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetData()
                setResetOpen(false)
                toast('info', 'Workspace reset', 'Channels, videos, clips, schedule and settings returned to demo defaults.')
              }}
            >
              <Trash2 size={15} aria-hidden="true" />
              Reset everything
            </Button>
          </>
        }
      >
        <p>
          This clears every locally stored item — channels, videos, clip jobs, schedule entries, captions and
          preferences — and reseeds the demo workspace. Attached file previews will need re-attaching. This
          cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
