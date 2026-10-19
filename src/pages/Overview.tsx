import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  BellRing,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clapperboard,
  Download,
  Film,
  Info,
  Plus,
  Scissors,
  Share2,
  Settings,
  Captions,
  TrendingUp,
  Video,
  Clock,
  WandSparkles,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { navigate } from '../lib/router'
import { Badge, Button, Card, DemoNote, Field, PageHeader, StatCard, cx } from '../components/ui'
import type { ActivityKind, AppState } from '../types'
import { dateKey, relativeTime } from '../lib/format'
import { buildCsv, downloadText } from '../lib/fileExport'

const KIND_ICON: Record<ActivityKind, typeof Info> = {
  channel: Video,
  library: Film,
  clip: Scissors,
  schedule: CalendarDays,
  captions: Captions,
  export: Download,
  settings: Settings,
  system: Info,
}

const START_ACTIONS = [
  {
    label: 'Add a channel',
    hint: 'Save links to channels you plan to work with',
    route: '/channels' as const,
    icon: <Video size={17} aria-hidden="true" />,
    isDone: (state: AppState) => state.channels.length > 0,
  },
  {
    label: 'Attach a real video file',
    hint: 'Your own footage enables previews, renders and thumbnails',
    route: '/library' as const,
    icon: <Film size={17} aria-hidden="true" />,
    isDone: (state: AppState) => state.videos.some((v) => !v.sample),
  },
  {
    label: 'Plan or auto-split clips',
    hint: 'Queue ranges in Clip Studio (or equal parts in one go)',
    route: '/studio' as const,
    icon: <Scissors size={17} aria-hidden="true" />,
    isDone: (state: AppState) => state.clips.length > 0,
  },
  {
    label: 'Render a real export',
    hint: 'Render a clip into a real downloadable video file',
    route: '/studio' as const,
    icon: <Download size={17} aria-hidden="true" />,
    isDone: (state: AppState) => state.clips.some((c) => c.status === 'done'),
  },
  {
    label: 'Write caption lines',
    hint: 'Timed lines that export as SRT/VTT and auto-attach on publish',
    route: '/studio' as const,
    icon: <Captions size={17} aria-hidden="true" />,
    isDone: (state: AppState) => state.clips.some((c) => (c.captionLines?.length ?? 0) > 0),
  },
  {
    label: 'Connect YouTube publishing',
    hint: 'Your own free OAuth client — Settings has the guide',
    route: '/settings' as const,
    icon: <Share2 size={17} aria-hidden="true" />,
    isDone: (state: AppState) => state.ytChannel != null,
  },
  {
    label: 'Schedule a post',
    hint: 'Pick a date and time on the calendar',
    route: '/calendar' as const,
    icon: <CalendarDays size={17} aria-hidden="true" />,
    isDone: (state: AppState) => state.schedule.length > 0,
  },
  {
    label: 'Set a daily posting rule',
    hint: 'Reminder at your hour; YouTube publishes on publishAt',
    route: '/settings' as const,
    icon: <Clock size={17} aria-hidden="true" />,
    isDone: (state: AppState) => state.rules.length > 0,
  },
]

export default function OverviewPage() {
  const { state, addStat, removeStat, toast } = useApp()

  const doneClips = state.clips.filter((c) => c.status === 'done').length
  const activeClips = state.clips.length - doneClips
  const todayKey = dateKey(new Date())
  const dueToday = state.schedule.filter((s) => s.date === todayKey)

  // ---- performance tracker form state ---------------------------------------
  const [statClipId, setStatClipId] = useState('')
  const [statLabel, setStatLabel] = useState('YouTube Shorts')
  const [statViews, setStatViews] = useState('')
  const [statLikes, setStatLikes] = useState('')
  const [statComments, setStatComments] = useState('')

  const statRows = useMemo(
    () =>
      [...state.stats]
        .sort((a, b) => b.date.localeCompare(a.date) || b.views - a.views)
        .map((stat) => {
          const clip = state.clips.find((c) => c.id === stat.clipId)
          return { ...stat, clipTitle: clip?.title ?? 'Removed clip' }
        }),
    [state.stats, state.clips],
  )
  const totalViews = state.stats.reduce((sum, s) => sum + s.views, 0)

  const submitStat = () => {
    const clipId = statClipId || state.clips[0]?.id || ''
    const views = Number(statViews)
    const likes = Number(statLikes)
    const comments = Number(statComments)
    if (!clipId) {
      toast('error', 'No clips exist yet', 'Queue a clip first, then log how it performs.')
      return
    }
    if (!Number.isFinite(views) || views < 0) {
      toast('error', 'Views invalid', 'Enter a non-negative number of views.')
      return
    }
    if (!Number.isFinite(likes) || likes < 0 || !Number.isFinite(comments) || comments < 0) {
      toast('error', 'Counts invalid', 'Enter non-negative numbers for likes and comments.')
      return
    }
    addStat(clipId, statLabel, views, likes, comments)
    setStatViews('')
    setStatLikes('')
    setStatComments('')
    toast('success', 'Performance logged', `${views.toLocaleString()} views recorded in your local tracker.`)
  }

  const exportStatsCsv = () => {
    if (statRows.length === 0) {
      toast('info', 'Nothing to export', 'Log at least one performance entry first.')
      return
    }
    const csv = buildCsv(
      ['date', 'clip', 'label', 'views', 'likes', 'comments'],
      statRows.map((row) => [row.date, row.clipTitle, row.label, row.views, row.likes, row.comments]),
    )
    downloadText(csv, 'channelai-performance.csv', 'text/csv')
    toast('success', 'CSV downloaded', `${statRows.length} performance rows exported.`)
  }

  /** Demo analytics: clips created in the last 7 local days. */
  const week = useMemo(() => {
    const now = new Date()
    const days: { key: string; label: string; count: number }[] = []
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      days.push({
        key: dateKey(date),
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        count: 0,
      })
    }
    const index = new Map(days.map((day) => [day.key, day]))
    for (const clip of state.clips) {
      const key = dateKey(new Date(clip.createdAt))
      const bucket = index.get(key)
      if (bucket) bucket.count += 1
    }
    return days
  }, [state.clips])

  const peak = Math.max(1, ...week.map((day) => day.count))

  return (
    <div className="page">
      <PageHeader
        title="Overview"
        description="A local-first workspace for planning, rendering and automatically publishing channel content."
        actions={
          <Badge tone="accent">
            <WandSparkles size={13} aria-hidden="true" /> {state.clips.length > 0 && state.videos.some((v) => !v.sample) ? 'Workspace' : 'Simulated demo'}
          </Badge>
        }
      />

      {dueToday.length > 0 && (
        <Card className="due-banner" icon={<BellRing size={17} aria-hidden="true" />} title={`Due today — ${dueToday.length} post${dueToday.length === 1 ? '' : 's'}`}>
          <div className="due-banner__row">
            <ul className="due-banner__list">
              {dueToday.slice(0, 3).map((entry) => (
                <li key={entry.id}>
                  {state.clips.find((c) => c.id === entry.clipId)?.title ?? 'Removed clip'} · {entry.time || 'time TBD'}
                </li>
              ))}
            </ul>
            <div className="due-banner__actions">
              <Button size="sm" onClick={() => navigate('/calendar')}>
                Open calendar
              </Button>
              <Button size="sm" variant="primary" onClick={() => navigate('/studio')}>
                Publish in Studio
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="stat-grid" role="list" aria-label="Workspace statistics">
        <div role="listitem">
          <StatCard
            icon={<Video size={20} aria-hidden="true" />}
            label="Channels"
            value={state.channels.length}
            hint={`${state.channels.filter((c) => c.kind === 'demo').length} demo links`}
          />
        </div>
        <div role="listitem">
          <StatCard
            icon={<Film size={20} aria-hidden="true" />}
            label="Videos"
            value={state.videos.length}
            hint="Metadata stored locally"
          />
        </div>
        <div role="listitem">
          <StatCard
            icon={<Scissors size={20} aria-hidden="true" />}
            label="Clip jobs"
            value={state.clips.length}
            hint={`${doneClips} completed · ${activeClips} in simulation`}
          />
        </div>
        <div role="listitem">
          <StatCard
            icon={<CalendarDays size={20} aria-hidden="true" />}
            label="Scheduled"
            value={state.schedule.length}
            hint="Posts on the demo calendar"
          />
        </div>
      </div>

      <div className="overview-grid">
        <Card
          title="Demo activity"
          subtitle="Clips created in the last 7 days — simulated analytics"
          icon={<Clapperboard size={17} aria-hidden="true" />}
          className="card--chart"
        >
          <div className="chart" aria-label="Demo chart: clips created per day">
            {week.map((day) => (
              <div key={day.key} className="chart__col">
                <div className="chart__track">
                  <div
                    className="chart__bar"
                    style={{ height: `${Math.max(4, (day.count / peak) * 100)}%` }}
                    title={`${day.label}: ${day.count} clip${day.count === 1 ? '' : 's'}`}
                  />
                </div>
                <span className="chart__label">{day.label}</span>
                <span className="chart__value">{day.count}</span>
              </div>
            ))}
          </div>
          <DemoNote>These totals come from the demo workspace in this browser only — nothing is analyzed remotely.</DemoNote>
        </Card>

        <Card
          title="Get started"
          subtitle={`${START_ACTIONS.filter((action) => action.isDone(state)).length} of ${START_ACTIONS.length} done`}
          icon={<BadgeCheck size={17} aria-hidden="true" />}
        >
          <ul className="quick-list">
            {START_ACTIONS.map((action) => {
              const done = action.isDone(state)
              return (
                <li key={action.route + action.label}>
                  <button type="button" className="quick-row" onClick={() => navigate(action.route)}>
                    <span className={cx('quick-row__icon', done && 'quick-row__icon--done')}>
                      {done ? <CheckCircle2 size={17} aria-hidden="true" /> : action.icon}
                    </span>
                    <span className="quick-row__text">
                      <strong>{action.label}</strong>
                      <small>{done ? 'Completed ✓' : action.hint}</small>
                    </span>
                    <span className="quick-row__arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card
          title="Performance tracker"
          subtitle={`Manual cross-platform stats · ${totalViews.toLocaleString()} total views`}
          icon={<TrendingUp size={17} aria-hidden="true" />}
        >
          <form
            className="stat-form"
            onSubmit={(e) => {
              e.preventDefault()
              submitStat()
            }}
          >
            <div className="stat-form__grid">
              <Field label="Clip" htmlFor="stat-clip" required>
                <select
                  id="stat-clip"
                  className="input input--select"
                  value={statClipId || state.clips[0]?.id || ''}
                  onChange={(e) => setStatClipId(e.target.value)}
                >
                  {state.clips.map((clip) => (
                    <option key={clip.id} value={clip.id}>
                      {clip.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Platform / label" htmlFor="stat-label">
                <input
                  id="stat-label"
                  className="input"
                  value={statLabel}
                  onChange={(e) => setStatLabel(e.target.value)}
                  placeholder="YouTube Shorts"
                />
              </Field>
              <Field label="Views" htmlFor="stat-views" required>
                <input
                  id="stat-views"
                  className="input"
                  inputMode="numeric"
                  value={statViews}
                  onChange={(e) => setStatViews(e.target.value.replace(/\D/g, ''))}
                  placeholder="12400"
                  autoComplete="off"
                />
              </Field>
              <Field label="Likes" htmlFor="stat-likes">
                <input
                  id="stat-likes"
                  className="input"
                  inputMode="numeric"
                  value={statLikes}
                  onChange={(e) => setStatLikes(e.target.value.replace(/\D/g, ''))}
                  placeholder="862"
                  autoComplete="off"
                />
              </Field>
              <Field label="Comments" htmlFor="stat-comments">
                <input
                  id="stat-comments"
                  className="input"
                  inputMode="numeric"
                  value={statComments}
                  onChange={(e) => setStatComments(e.target.value.replace(/\D/g, ''))}
                  placeholder="47"
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="stat-form__actions">
              <Button variant="primary" type="submit">
                <Plus size={15} aria-hidden="true" />
                Log performance
              </Button>
              <Button onClick={exportStatsCsv}>
                <Download size={15} aria-hidden="true" />
                Export CSV
              </Button>
            </div>
          </form>
          {statRows.length === 0 ? (
            <p className="muted">
              No numbers logged yet — you type them in yourself; nothing is scraped from any platform.
            </p>
          ) : (
            <table className="stat-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Clip</th>
                  <th scope="col">Label</th>
                  <th scope="col" className="num">
                    Views
                  </th>
                  <th scope="col" className="num">
                    Likes
                  </th>
                  <th scope="col" className="num">
                    Comm.
                  </th>
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {statRows.map((row) => (
                  <tr key={row.id}>
                    <td className="num">{row.date}</td>
                    <td title={row.clipTitle}>{row.clipTitle}</td>
                    <td>{row.label}</td>
                    <td className="num">{row.views.toLocaleString()}</td>
                    <td className="num">{row.likes.toLocaleString()}</td>
                    <td className="num">{row.comments.toLocaleString()}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="btn--danger-ghost"
                        aria-label="Remove row"
                        onClick={() => {
                          removeStat(row.id)
                          toast('info', 'Row removed', 'Performance entries are local-only.')
                        }}
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <DemoNote>
            These stats are typed by you (YouTube hides ROI until creator studio). The CSV keeps them yours.
          </DemoNote>
        </Card>

        <Card
          title="Recent activity"
          icon={<Info size={17} aria-hidden="true" />}
          subtitle="Newest first · kept in localStorage"
        >
          {state.activity.length === 0 ? (
            <p className="muted">No activity yet — add a channel or upload a video to get started.</p>
          ) : (
            <ul className="activity-list">
              {state.activity.slice(0, 8).map((item) => {
                const Icon = KIND_ICON[item.kind] ?? Info
                return (
                  <li key={item.id} className="activity-row">
                    <span className={cx('activity-row__icon', `activity-row__icon--${item.kind}`)}>
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <p className="activity-row__text">{item.message}</p>
                    <time className="activity-row__time">{relativeTime(item.at)}</time>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card
          title="What works today"
          subtitle="…and what needs a future integration"
          icon={<CircleAlert size={17} aria-hidden="true" />}
        >
          <ul className="scope-list">
            <li>
              <BadgeCheck size={15} aria-hidden="true" />
              <strong>Real:</strong> in-browser clip rendering/export, thumbnail capture, SRT/VTT captions,
              title/hashtag templates, scheduled YouTube publishing (your OAuth client), browser reminders and
              a manual performance tracker with CSV.
            </li>
            <li className="scope-list__future">
              <CircleAlert size={15} aria-hidden="true" />
              <strong>Not included:</strong> downloading third-party YouTube videos (YouTube ToS), remote video
              analysis, AI caption speech recognition. The processing queue demo stays clearly simulated.
            </li>
          </ul>
          <DemoNote>Every “processing” indicator in ChannelAI is a visible simulation with a fixed local timer.</DemoNote>
        </Card>
      </div>
    </div>
  )
}
