import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { navigate } from '../lib/router'
import { Badge, Button, Card, DemoNote, EmptyState, Field, Modal, PageHeader, cx } from '../components/ui'
import { dateKey, formatClock, sameDay } from '../lib/format'
import type { ScheduleEntry } from '../types'

const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface GridDay {
  key: string
  date: Date
  inMonth: boolean
}

export default function CalendarPage() {
  const { state, addSchedule, removeSchedule, toast } = useApp()
  const [cursor, setCursor] = useState(() => new Date())
  const [dayModal, setDayModal] = useState<Date | null>(null)
  const [clipId, setClipId] = useState('')
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const slotsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEntry[]>()
    for (const entry of state.schedule) {
      const list = map.get(entry.date) ?? []
      list.push(entry)
      list.sort((a, b) => a.time.localeCompare(b.time))
      map.set(entry.date, list)
    }
    return map
  }, [state.schedule])

  const today = new Date()

  const grid = useMemo((): GridDay[] => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // Monday-first
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: GridDay[] = []
    for (let i = 0; i < firstDow; i += 1) {
      cells.push({ key: `pad-${i}`, date: new Date(year, month, -firstDow + i + 1), inMonth: false })
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push({ key: `${dateKey(new Date(year, month, d))}`, date: new Date(year, month, d), inMonth: true })
    }
    while (cells.length % 7 !== 0) {
      const d = cells.length - firstDow - daysInMonth + 1
      cells.push({ key: `tail-${cells.length}`, date: new Date(year, month + 1, d), inMonth: false })
    }
    return cells
  }, [cursor])

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const shiftMonth = (delta: number) => {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1)
    setCursor(d)
  }

  const openDay = (date: Date) => {
    if (state.clips.length === 0) {
      toast(
        'info',
        'No clips to schedule yet',
        'Queue a clip in Clip Studio, then come back to place it on a day.',
      )
      return
    }
    setClipId('')
    setTime('09:00')
    setNote('')
    setFormError(null)
    setDayModal(date)
  }

  const saveEntry = () => {
    if (!dayModal) return
    if (clipId === '') {
      setFormError('Pick a clip to schedule.')
      return
    }
    const result = addSchedule(clipId, dateKey(dayModal), time, note)
    if (!result.ok) {
      setFormError(result.error)
      return
    }
    setDayModal(null)
    toast('success', 'Post scheduled (demo)', `Saved on ${dateKey(dayModal)}. Nothing is published anywhere.`)
  }

  const modalDateLabel = dayModal
    ? dayModal.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    : ''
  const modalClips = state.clips

  return (
    <div className="page">
      <PageHeader
        title="Content Calendar"
        description="Plan when demo clips would go out. If a real publishing integration existed, this is where it would be wired in."
        actions={<Badge tone="accent">Local schedule</Badge>}
      />

      <Card
        title={monthLabel}
        icon={<CalendarDays size={17} aria-hidden="true" />}
        actions={
          <div className="cal-nav">
            <Button size="sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={15} aria-hidden="true" />
            </Button>
            <Button size="sm" onClick={() => setCursor(new Date())}>
              Today
            </Button>
            <Button size="sm" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight size={15} aria-hidden="true" />
            </Button>
            <Button size="sm" variant="primary" onClick={() => openDay(today)}>
              <Plus size={15} aria-hidden="true" />
              Add post
            </Button>
          </div>
        }
        flush
      >
        <div className="cal" role="grid" aria-label={`Calendar for ${monthLabel}`}>
          <div className="cal__dow" aria-hidden="true">
            {DOW_SHORT.map((dow) => (
              <span key={dow}>{dow}</span>
            ))}
          </div>
          {grid.map((cell) => {
            const entries = slotsByDay.get(cell.key) ?? []
            const isToday = cell.inMonth && sameDay(cell.date, today)
            const isSelected = dayModal != null && sameDay(cell.date, dayModal)
            return (
              <div
                key={cell.key}
                className={cx(
                  'cal__cell',
                  !cell.inMonth && 'is-out',
                  isToday && 'is-today',
                  isSelected && 'is-selected',
                )}
                role="gridcell"
                aria-label={`${cell.key}${entries.length > 0 ? `, ${entries.length} scheduled post${entries.length > 1 ? 's' : ''}` : ''}`}
              >
                <span className="cal__num">{cell.date.getDate()}</span>
                {cell.inMonth && (
                  <button
                    type="button"
                    className="cal__add"
                    aria-label={`Add a post on ${cell.date.toLocaleDateString()}`}
                    onClick={() => openDay(cell.date)}
                  >
                    <Plus size={12} aria-hidden="true" />
                  </button>
                )}
                {entries.length > 0 && (
                  <div className="cal__pills">
                    {entries.slice(0, 2).map((entry) => {
                      const clip = state.clips.find((c) => c.id === entry.clipId)
                      return (
                        <span key={entry.id} className="cal-pill" title={`${entry.time || 'Unspecified'} — ${clip?.title ?? 'Removed clip'}${entry.note ? ` · ${entry.note}` : ''}`}>
                          {entry.time && <em>{entry.time}</em>}
                          <span className="cal-pill__title">{clip?.title ?? 'Removed clip'}</span>
                          <button
                            type="button"
                            className="cal-pill__x"
                            aria-label={`Remove the ${entry.time || ''} post from ${cell.date.toLocaleDateString()}`}
                            onClick={() => {
                              removeSchedule(entry.id)
                              toast('info', 'Post removed', 'The demo schedule entry was deleted.')
                            }}
                          >
                            <Trash2 size={11} aria-hidden="true" />
                          </button>
                        </span>
                      )
                    })}
                    {entries.length > 2 && <span className="cal-pill cal-pill--more">+{entries.length - 2} more</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="card__footer-note">
          <DemoNote>
            {state.schedule.length} scheduled post{state.schedule.length === 1 ? '' : 's'} · everything is local-only — nothing is uploaded or posted.
          </DemoNote>
        </div>
      </Card>

      <Modal
        open={dayModal != null}
        title={`Schedule a post — ${modalDateLabel}`}
        onClose={() => setDayModal(null)}
        footer={
          <>
            <Button onClick={() => setDayModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveEntry}>
              Add to schedule
            </Button>
          </>
        }
      >
        {modalClips.length === 0 ? (
          <EmptyState
            icon={<CalendarDays size={26} aria-hidden="true" />}
            title="No clips available"
            description="Queue a clip job in Clip Studio first — scheduled posts always reference a clip."
            action={
              <Button variant="primary" onClick={() => navigate('/studio')}>
                Open Clip Studio
              </Button>
            }
          />
        ) : (
          <>
            <Field label="Clip" htmlFor="cal-clip" required error={formError}>
              <select
                id="cal-clip"
                className="input input--select"
                value={clipId}
                onChange={(e) => {
                  setClipId(e.target.value)
                  setFormError(null)
                }}
              >
                <option value="">Choose a clip…</option>
                {modalClips.map((clip) => (
                  <option key={clip.id} value={clip.id}>
                    {clip.title} · {formatClock(clip.start)}–{formatClock(clip.end)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Time" htmlFor="cal-time" hint="24h format, local time.">
              <input
                id="cal-time"
                type="time"
                className="input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
            <Field label="Note" htmlFor="cal-note" hint="e.g. ‘Header slot’ — shown as a tooltip on the day.">
              <input
                id="cal-note"
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Caption slot"
                autoComplete="off"
              />
            </Field>
          </>
        )}
      </Modal>
    </div>
  )
}
