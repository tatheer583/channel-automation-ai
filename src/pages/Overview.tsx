import { useMemo } from 'react'
import {
  BadgeCheck,
  CalendarDays,
  CircleAlert,
  Clapperboard,
  Film,
  Info,
  Scissors,
  Settings,
  Captions,
  Video,
  WandSparkles,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { navigate } from '../lib/router'
import { Badge, Card, DemoNote, PageHeader, StatCard, cx } from '../components/ui'
import type { ActivityKind } from '../types'
import { dateKey, relativeTime } from '../lib/format'

const KIND_ICON: Record<ActivityKind, typeof Info> = {
  channel: Video,
  library: Film,
  clip: Scissors,
  schedule: CalendarDays,
  captions: Captions,
  settings: Settings,
  system: Info,
}

const START_ACTIONS = [
  {
    label: 'Add a channel',
    hint: 'Save links to channels you plan to work with',
    route: '/channels' as const,
    icon: <Video size={17} aria-hidden="true" />,
  },
  {
    label: 'Upload a video',
    hint: 'Attach a local file for real preview',
    route: '/library' as const,
    icon: <Film size={17} aria-hidden="true" />,
  },
  {
    label: 'Plan a clip',
    hint: 'Queue synthetic clip jobs in Clip Studio',
    route: '/studio' as const,
    icon: <Scissors size={17} aria-hidden="true" />,
  },
]

export default function OverviewPage() {
  const { state } = useApp()

  const doneClips = state.clips.filter((c) => c.status === 'done').length
  const activeClips = state.clips.length - doneClips

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
        description="A local-first workspace for planning channel content. Numbers below reflect the demo data in this browser."
        actions={
          <Badge tone="accent">
            <WandSparkles size={13} aria-hidden="true" /> Simulated demo
          </Badge>
        }
      />

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

        <Card title="Quick actions" icon={<BadgeCheck size={17} aria-hidden="true" />}>
          <ul className="quick-list">
            {START_ACTIONS.map((action) => (
              <li key={action.route}>
                <button type="button" className="quick-row" onClick={() => navigate(action.route)}>
                  <span className="quick-row__icon">{action.icon}</span>
                  <span className="quick-row__text">
                    <strong>{action.label}</strong>
                    <small>{action.hint}</small>
                  </span>
                  <span className="quick-row__arrow" aria-hidden="true">
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
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
              Channel links, local video previews, simulated clip queue, caption templates, calendar scheduling
            </li>
            <li className="scope-list__future">
              <CircleAlert size={15} aria-hidden="true" />
              Downloading YouTube videos, remote video analysis, AI caption generation, exporting/publishing — all disabled until real integrations exist
            </li>
          </ul>
          <DemoNote>Every “processing” indicator in ChannelAI is a visible simulation with a fixed local timer.</DemoNote>
        </Card>
      </div>
    </div>
  )
}
