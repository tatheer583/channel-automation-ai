import { useRef, useState } from 'react'
import {
  Bell,
  BellRing,
  Captions,
  Clock,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Info,
  KeyRound,
  LogOut,
  Palette,
  Plus,
  Save,
  Share2,
  Trash2,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { ACCENTS, ASPECTS } from '../lib/options'
import { fetchHealth, type BackendHealth } from '../lib/backend'
import {
  Badge,
  Button,
  Card,
  DemoNote,
  Field,
  Modal,
  PageHeader,
  RelTime,
  Segmented,
  Toggle,
  cx,
} from '../components/ui'
import { formatBytes } from '../lib/format'

export default function SettingsPage() {
  const {
    state,
    setPrefs,
    exportData,
    importData,
    resetData,
    toast,
    connectYouTube,
    disconnectYouTube,
    addRule,
    removeRule,
    toggleRule,
  } = useApp()
  const prefs = state.prefs
  const importInputRef = useRef<HTMLInputElement>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [lastImport, setLastImport] = useState<string | null>(null)
  const [clientId, setClientId] = useState('')
  const [ytBusy, setYtBusy] = useState(false)
  const [ruleName, setRuleName] = useState('')
  const [ruleTime, setRuleTime] = useState('09:00')
  const [ruleError, setRuleError] = useState<string | null>(null)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )

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

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') {
      toast('error', 'Notifications unsupported', 'This browser cannot show Notification pop-ups.')
      return
    }
    const permission = await Notification.requestPermission()
    setNotifPermission(permission)
    if (permission === 'granted') {
      toast('success', 'Reminders allowed', 'Posting rules will ping you at their set time.')
    } else {
      toast('info', 'Reminders stay in-app', 'You will still see a toast, but no system banner.')
    }
  }

  const storageChars = JSON.stringify(state).length

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        description="Appearance, real YouTube publishing with your own OAuth client, reminders and rules, and local data management."
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

        <LocalServiceCard />

        <Card
          title="YouTube publishing (real)"
          subtitle="Your account. Your free OAuth client. No secrets in this app."
          icon={<Share2 size={17} aria-hidden="true" />}
        >
          {state.ytChannel ? (
            <div className="yt-connect">
              <p className="yt-chip yt-chip--connected">
                <Share2 size={16} aria-hidden="true" />
                <span>
                  Connected to <strong>{state.ytChannel.title}</strong>
                  <small className="muted"> · {state.ytChannel.customUrl}</small>
                </span>
              </p>
              <Button onClick={disconnectYouTube}>
                <LogOut size={15} aria-hidden="true" />
                Disconnect (token is discarded)
              </Button>
            </div>
          ) : (
            <>
              <Field
                label="Google OAuth Client ID"
                htmlFor="yt-client"
                hint="Ends in .apps.googleusercontent.com — created by you (free) at Google Cloud Console. This is not a secret; the app stores it locally only."
              >
                <input
                  id="yt-client"
                  className="input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="1234567890-abc123.apps.googleusercontent.com"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <div className="data-actions">
                <Button
                  variant="primary"
                  disabled={ytBusy || clientId.trim() === ''}
                  onClick={() => {
                    setYtBusy(true)
                    void connectYouTube(clientId).finally(() => setYtBusy(false))
                  }}
                >
                  <KeyRound size={15} aria-hidden="true" />
                  {ytBusy ? 'Waiting for Google…' : 'Connect YouTube'}
                </Button>
                <a
                  className="btn btn--ghost btn--sm"
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  Open Cloud Console
                </a>
              </div>
              <details className="how-to">
                <summary>Step-by-step: create your OAuth client (free, ~2 minutes)</summary>
                <ol>
                  <li>
                    At <strong>console.cloud.google.com</strong>, create/select a project → <em>APIs &amp; Services</em> →
                    enable the <strong>YouTube Data API v3</strong>.
                  </li>
                  <li>
                    <em>Credentials</em> → <em>Create credentials</em> → <strong>OAuth client ID</strong> →
                    Application type <strong>Web application</strong>.
                  </li>
                  <li>
                    Under <strong>Authorized JavaScript origins</strong> add BOTH (exact, no trailing path):
                    <code>https://tatheer583.github.io</code>
                    <code>http://localhost:5173</code>
                  </li>
                  <li>
                    Under <strong>Authorized redirect URIs</strong> add <code>https://developers.google.com/</code>
                    (harmless default used by some flows).
                  </li>
                  <li>Optional: configure the consent screen as “Testing” with your account as a test user.</li>
                  <li>Copy the Client ID and paste it above. Google never shares your token with this file.</li>
                </ol>
              </details>
              <DemoNote>
                The access token lives in this tab's memory only (~1 hour). Origin mismatch ⇒ `origin_mismatch` —
                re-check step 3 exactly.
              </DemoNote>
            </>
          )}
        </Card>

        <Card
          title={`Posting rules (${state.rules.length})`}
          subtitle="Local reminders now; the actual timing is enforced by YouTube's publishAt"
          icon={<Clock size={17} aria-hidden="true" />}
        >
          <form
            className="rule-form"
            onSubmit={(e) => {
              e.preventDefault()
              setRuleError(null)
              const result = addRule(ruleName, ruleTime)
              if (!result.ok) {
                setRuleError(result.error)
                return
              }
              setRuleName('')
              toast('success', 'Rule added', `${ruleName.trim()} rings daily at ${ruleTime}.`)
            }}
          >
            <div className="rule-form__fields">
              <Field label="Rule name" htmlFor="rule-name" required>
                <input
                  id="rule-name"
                  className="input"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="Daily morning reel"
                  autoComplete="off"
                />
              </Field>
              <Field label="Daily at (HH:MM)" htmlFor="rule-time" required>
                <input
                  id="rule-time"
                  className="input"
                  type="time"
                  value={ruleTime}
                  onChange={(e) => setRuleTime(e.target.value)}
                />
              </Field>
              <Button variant="primary" type="submit">
                <Plus size={15} aria-hidden="true" />
                Add rule
              </Button>
            </div>
            {ruleError && (
              <p className="field__msg" role="alert">
                {ruleError}
              </p>
            )}
          </form>
          {state.rules.length === 0 ? (
            <p className="muted">
              No rules yet. Example: “Morning reel” at 09:00 and “Evening reel” at 18:30 to post two a day.
            </p>
          ) : (
            <ul className="rule-list">
              {state.rules.map((rule) => (
                <li key={rule.id} className="rule-row">
                  <div className="rule-row__main">
                    <span className="rule-row__time num">{rule.time}</span>
                    <span className="rule-row__name">{rule.name}</span>
                    <span className="rule-row__meta muted">
                      {rule.lastFiredAt ? (
                        <>
                          last ring <RelTime at={rule.lastFiredAt} />
                        </>
                      ) : (
                        'not fired yet'
                      )}
                    </span>
                  </div>
                  <div className="rule-row__side">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      aria-label={`Toggle ${rule.name}`}
                      className={cx('toggle toggle--sm', rule.enabled && 'is-on')}
                      onClick={() => toggleRule(rule.id, !rule.enabled)}
                    >
                      <span className="toggle__knob" aria-hidden="true" />
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="btn--danger-ghost"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => {
                        removeRule(rule.id)
                        toast('info', 'Rule removed', `${rule.name} will not ring anymore.`)
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="reminders-row">
            <Toggle
              checked={prefs.reminders}
              onChange={(on) => setPrefs({ reminders: on }, on ? 'Reminders enabled' : 'Reminders disabled')}
              label="Enable in-app reminder engine"
              hint="Rules ring while this tab is open. Actual go-live: set publishAt in Publish dialog."
            />
            <Button onClick={() => void requestPermission()}>
              <Bell size={15} aria-hidden="true" />
              {notifPermission === 'granted' ? 'System notifications: on' : 'Allow system notifications'}
            </Button>
            {notifPermission === 'granted' && (
              <Badge tone="ok">
                <BellRing size={12} aria-hidden="true" /> granted
              </Badge>
            )}
            {notifPermission === 'denied' && <Badge tone="warn">blocked by browser</Badge>}
          </div>
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
          <DemoNote>Exports contain only the workspace data (no media files, no secrets).</DemoNote>
        </Card>

        <Card title="About ChannelAI" icon={<Info size={17} aria-hidden="true" />}>
          <ul className="about-list">
            <li>
              <Save size={15} aria-hidden="true" />
              <span>
                <strong>Version v0.4.0</strong> — MIT open-source · React + Vite · relative build paths for
                repository-based GitHub Pages.
              </span>
            </li>
            <li>
              <HardDrive size={15} aria-hidden="true" />
              <span>
                <strong>Real features:</strong> in-browser clip rendering/export, thumbnail capture, SRT/VTT
                captions, scheduled YouTube publishing (your OAuth client), browser reminders, and — with the
                optional local service — <strong>real speech-to-text</strong> on your own CPU.
              </span>
            </li>
            <li>
              <Badge tone="muted">Simulated</Badge>
              <span>
                <strong>Simulation only:</strong> the processing queue animation and demo analytics. YouTube
                downloading and social “auto-play” of third-party content are not part of any version.
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

// --------------------------------------------------- local AI service card ---

const WHISPER_MODELS = [
  { id: 'tiny', label: 'tiny', hint: 'fastest, least accurate (~75 MB)' },
  { id: 'base', label: 'base', hint: 'balanced, good for Urdu + English (~145 MB)' },
  { id: 'small', label: 'small', hint: 'most accurate, slow on 4 cores (~480 MB)' },
]

const LANGUAGES = [
  { value: 'auto', label: 'Auto' },
  { value: 'ur', label: 'Urdu' },
  { value: 'en', label: 'English' },
]

/**
 * Connection panel for the local FastAPI service that runs Whisper on this
 * machine. Everything here is real: the status line reports what the service
 * actually answered, never a guess.
 */
function LocalServiceCard() {
  const { state, setPrefs, toast } = useApp()
  const prefs = state.prefs
  const [url, setUrl] = useState(prefs.backendUrl)
  const [token, setToken] = useState(prefs.backendToken)
  const [model, setModel] = useState(prefs.whisperModel)
  const [language, setLanguage] = useState(prefs.transcribeLanguage)
  const [checking, setChecking] = useState(false)
  const [health, setHealth] = useState<BackendHealth | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    const cleanUrl = url.trim() || 'http://127.0.0.1:8000'
    setPrefs(
      {
        backendUrl: cleanUrl,
        backendToken: token.trim(),
        whisperModel: model,
        transcribeLanguage: language,
      },
      'Local AI service settings saved',
    )
    toast('success', 'Saved', 'Local AI service settings updated.')
  }

  const test = async () => {
    setChecking(true)
    setError(null)
    setHealth(null)
    try {
      const result = await fetchHealth({ url: url.trim(), token: token.trim() || undefined })
      setHealth(result)
      toast('success', 'Service reachable', `${result.service} v${result.version} is running.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the local service.')
      toast('error', 'Service not reachable', 'Start it with the command shown below.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <Card
      title="Local AI service (real transcription)"
      subtitle="Speech-to-text on your own CPU — no cloud, no credits"
      icon={<Cpu size={17} aria-hidden="true" />}
    >
      <Field
        label="Service address"
        htmlFor="backend-url"
        hint="The local FastAPI app from the backend/ folder. It runs on this computer only."
      >
        <input
          id="backend-url"
          className="input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://127.0.0.1:8000"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      <Field
        label="Local token (optional)"
        htmlFor="backend-token"
        hint="Only needed if you started the service with CHANNELAI_TOKEN set."
      >
        <input
          id="backend-token"
          className="input"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="(not set)"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      <Field label="Whisper model" hint="Downloaded once, then cached for offline use.">
        <select
          className="input input--select"
          aria-label="Whisper model size"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {WHISPER_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.hint}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Spoken language" hint="Auto works for mixed Urdu + English, but pinning a language is steadier.">
        <Segmented
          ariaLabel="Transcription language"
          options={LANGUAGES}
          value={language}
          onChange={setLanguage}
        />
      </Field>

      <div className="data-actions">
        <Button onClick={save}>
          <Save size={15} aria-hidden="true" />
          Save settings
        </Button>
        <Button variant="primary" disabled={checking} onClick={() => void test()}>
          <Database size={15} aria-hidden="true" />
          {checking ? 'Checking…' : 'Test connection'}
        </Button>
      </div>

      {health && (
        <ul className="about-list">
          <li>
            <Cpu size={15} aria-hidden="true" />
            <span>
              <strong>{health.service} v{health.version}</strong> — {health.device} / {health.compute_type} · FFmpeg{' '}
              {health.ffmpeg}
            </span>
          </li>
          <li>
            <Database size={15} aria-hidden="true" />
            <span>
              Model <strong>{health.default_model}</strong>{' '}
              {health.model_cached?.[health.default_model] ? 'is cached (offline ready)' : 'is not downloaded yet'}
              {health.model_loaded ? ' · currently loaded in RAM' : ''}
            </span>
          </li>
          <li>
            <FolderOpen size={15} aria-hidden="true" />
            <span>
              Temp files: <code>{health.work_dir}</code> · max upload {health.max_upload_mb} MB
            </span>
          </li>
        </ul>
      )}

      {error && (
        <p className="field__hint" role="alert">
          {error}
        </p>
      )}

      <details className="how-to">
        <summary>How to start the local service (Windows)</summary>
        <ol>
          <li>
            Open PowerShell in the project folder: <code>cd C:\Users\1\Projects\ChannelAI</code>
          </li>
          <li>
            Activate it: <code>.\backend\.venv\Scripts\Activate.ps1</code>
          </li>
          <li>
            Run it: <code>python -m uvicorn app:app --app-dir backend --port 8000</code>
          </li>
          <li>
            Keep that window open while you transcribe. Closing it stops the service (the app then says the
            service is offline instead of pretending to work).
          </li>
        </ol>
      </details>

      <DemoNote>
        This service runs on your machine only. It never uploads your media anywhere, and nothing you
        transcribe is sent to Google or any third party.
      </DemoNote>
    </Card>
  )
}
