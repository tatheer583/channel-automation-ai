import { useState } from 'react'
import { ExternalLink, Link2, Trash2, Video } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Badge, Button, Card, DemoNote, EmptyState, Field, PageHeader, cx } from '../components/ui'
import { relativeTime } from '../lib/format'
import type { Channel } from '../types'

function initialsOf(name: string): string {
  const base = name.replace(/^@/, '').trim()
  if (base === '') return '??'
  const words = base.split(/[\s._-]+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return base.slice(0, 2).toUpperCase()
}

function toneOf(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 997
  return hash % 4
}

export default function ChannelsPage() {
  const { state, addChannel, removeChannel, toast } = useApp()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = () => {
    const result = addChannel(url, name)
    if (!result.ok) {
      setError(result.error)
      toast('error', 'Channel not added', result.error ?? undefined)
      return
    }
    setError(null)
    setUrl('')
    setName('')
    toast('success', 'Channel added', 'Stored locally as a demo link — nothing was fetched.')
  }

  return (
    <div className="page">
      <PageHeader
        title="Channel Manager"
        description="Save links to channels you plan to automate. Links are validated locally and stored in this browser only."
      />

      <div className="channel-grid">
        <Card title="Add a channel" icon={<Link2 size={17} aria-hidden="true" />} flush>
          <form
            className="channel-form"
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit()
            }}
          >
            <Field
              label="Channel URL"
              htmlFor="channel-url"
              required
              hint="YouTube handles like @yourchannel, /channel/UC… links, or any website."
              error={error}
            >
              <input
                id="channel-url"
                className="input"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://youtube.com/@yourchannel"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </Field>
            <Field label="Display name" htmlFor="channel-name" hint="Optional — a name is suggested from the URL.">
              <input
                id="channel-name"
                className="input"
                autoComplete="off"
                placeholder="@my-studio"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <div className="channel-form__actions">
              <Button variant="primary" type="submit">
                <PlusIcon />
                Add channel
              </Button>
            </div>
          </form>
          <div className="card__footer-note">
            <DemoNote>No accounts, no API keys, no fetching — links are parsed locally.</DemoNote>
          </div>
        </Card>

        <Card
          title={`Saved channels (${state.channels.length})`}
          icon={<Video size={17} aria-hidden="true" />}
          subtitle="Demo channels are seeded; remove them any time."
          flush
        >
          {state.channels.length === 0 ? (
            <div className="card__body">
              <EmptyState
                icon={<Video size={26} aria-hidden="true" />}
                title="No channels yet"
                description="Add your first channel link with the form on the left."
              />
            </div>
          ) : (
            <ul className="channel-list">
              {state.channels.map((channel: Channel) => (
                <li key={channel.id} className="channel-row">
                  <span className={cx('avatar', `avatar--tone-${toneOf(channel.name)}`)} aria-hidden="true">
                    {initialsOf(channel.name)}
                  </span>
                  <div className="channel-row__main">
                    <span className="channel-row__name">
                      {channel.name}
                      {channel.kind === 'demo' && <Badge tone="accent">Demo</Badge>}
                    </span>
                    <span className="channel-row__meta">
                      {channel.url.replace(/^https?:\/\//, '')} · added {relativeTime(channel.addedAt)}
                    </span>
                  </div>
                  <div className="channel-row__actions">
                    <a
                      className="btn btn--ghost btn--sm"
                      href={channel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${channel.name} in a new tab`}
                    >
                      <ExternalLink size={15} aria-hidden="true" />
                      Visit
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="btn--danger-ghost"
                      onClick={() => {
                        removeChannel(channel.id)
                        toast('info', 'Channel removed', `${channel.name} was deleted from this browser.`)
                      }}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function PlusIcon() {
  // Small inline plus keeps the primary CTA self-contained.
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
