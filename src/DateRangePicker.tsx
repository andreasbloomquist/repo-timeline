import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ALL_TIME, type DateRange } from './dateRange'

const PRESETS = [
  { key: '7D', label: 'Last 7 days', days: 7 },
  { key: '30D', label: 'Last 30 days', days: 30 },
  { key: '90D', label: 'Last 90 days', days: 90 },
  { key: '1Y', label: 'Last year', days: 365 },
] as const

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getTime() === b.getTime()
}

function presetRange(days: number): DateRange {
  const today = startOfDay(new Date())
  return { from: addDays(today, -(days - 1)), to: today }
}

function activePreset(range: DateRange) {
  return PRESETS.find(p => {
    const preset = presetRange(p.days)
    return sameDay(range.from, preset.from) && sameDay(range.to, preset.to)
  })
}

function formatShort(date: Date, withYear: boolean): string {
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}${withYear ? ` ’${String(date.getFullYear()).slice(2)}` : ''}`
}

function formatNumeric(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${date.getFullYear()}`
}

function triggerLabel(range: DateRange): string {
  if (!range.from && !range.to) return 'All time'
  const preset = activePreset(range)
  if (preset) return preset.label
  const { from, to } = range
  if (from && to) {
    const thisYear = new Date().getFullYear()
    const showYear = from.getFullYear() !== thisYear || to.getFullYear() !== thisYear
    if (sameDay(from, to)) return formatShort(from, showYear)
    return `${formatShort(from, showYear)} – ${formatShort(to, showYear)}`
  }
  return from ? `Since ${formatShort(from, true)}` : `Until ${formatShort(to!, true)}`
}

// Monday-first grid for the month containing `month`; null cells are padding
function monthGrid(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const leading = (first.getDay() + 6) % 7
  const cells: (Date | null)[] = Array.from({ length: leading }, () => null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), d))
  }
  return cells
}

const Chevron = ({ direction }: { direction: 'down' | 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points={direction === 'down' ? '6 9 12 15 18 9' : direction === 'left' ? '15 6 9 12 15 18' : '9 6 15 12 9 18'} />
  </svg>
)

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (range: DateRange) => void }) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => startOfDay(new Date()))
  // Anchor of a custom range: set on press, completed by release (drag) or a second click
  const [draftStart, setDraftStart] = useState<Date | null>(null)
  const [hovered, setHovered] = useState<Date | null>(null)
  const [pressing, setPressing] = useState(false)
  // True when the current press is the second click of a click-click selection
  const finishOnRelease = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const close = () => {
    setOpen(false)
    setDraftStart(null)
    setHovered(null)
    setPressing(false)
  }

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const toggleOpen = () => {
    if (open) {
      close()
      return
    }
    setViewMonth(value.to ?? startOfDay(new Date()))
    setOpen(true)
  }

  const apply = (range: DateRange) => {
    onChange(range)
    close()
  }

  const applySpan = (a: Date, b: Date) => apply(a <= b ? { from: a, to: b } : { from: b, to: a })

  // Keyboard path (Enter/Space): first activation anchors, second completes
  const pickDay = (day: Date) => {
    if (!draftStart) {
      setDraftStart(day)
      return
    }
    applySpan(draftStart, day)
  }

  // Selectable day under the pointer; works for touch too, where events stay on the pressed cell
  const dayAt = (x: number, y: number): Date | null => {
    const cell = document.elementFromPoint(x, y)?.closest<HTMLButtonElement>('[data-day]')
    return cell && !cell.disabled ? new Date(Number(cell.dataset.day)) : null
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const day = dayAt(e.clientX, e.clientY)
    if (!day) return
    e.preventDefault()
    finishOnRelease.current = !!draftStart
    if (!draftStart) setDraftStart(day)
    setHovered(day)
    setPressing(true)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const day = dayAt(e.clientX, e.clientY)
    if (day && !sameDay(day, hovered)) setHovered(day)
  }

  // Release may land outside the grid, so listen on the document while pressed
  useEffect(() => {
    if (!pressing) return
    const handleRelease = () => {
      setPressing(false)
      if (!draftStart || !hovered) return
      // A press and release on the anchor is a plain click: wait for the second one
      if (finishOnRelease.current || !sameDay(hovered, draftStart)) applySpan(draftStart, hovered)
    }
    document.addEventListener('pointerup', handleRelease)
    document.addEventListener('pointercancel', handleRelease)
    return () => {
      document.removeEventListener('pointerup', handleRelease)
      document.removeEventListener('pointercancel', handleRelease)
    }
  })

  const today = startOfDay(new Date())
  const preset = activePreset(value)
  const isAllTime = !value.from && !value.to

  // While picking, preview the span between the first click and the hovered day
  const [spanFrom, spanTo] = draftStart
    ? (hovered && hovered < draftStart ? [hovered, draftStart] : [draftStart, hovered ?? draftStart])
    : [value.from, value.to]

  const atCurrentMonth = viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() === today.getMonth()
  const shiftMonth = (delta: number) =>
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1))

  return (
    <div className="date-range" ref={rootRef}>
      <button
        type="button"
        className={`date-range-trigger${isAllTime ? '' : ' is-set'}`}
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Date range: ${triggerLabel(value)}`}
      >
        <span className="date-range-trigger-label">{triggerLabel(value)}</span>
        <Chevron direction="down" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="date-range-panel"
            role="dialog"
            aria-label="Choose date range"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="date-range-presets">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  className={`date-range-preset${preset?.key === p.key ? ' is-active' : ''}`}
                  onClick={() => apply(presetRange(p.days))}
                  aria-label={p.label}
                >
                  {p.key}
                </button>
              ))}
              <button
                type="button"
                className={`date-range-preset${isAllTime ? ' is-active' : ''}`}
                onClick={() => apply(ALL_TIME)}
              >
                All
              </button>
            </div>

            <div className="date-range-month">
              <span className="date-range-month-label">
                {MONTHS[viewMonth.getMonth()]} <span className="date-range-year">{viewMonth.getFullYear()}</span>
              </span>
              <div className="date-range-nav">
                <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                  <Chevron direction="left" />
                </button>
                <button type="button" onClick={() => shiftMonth(1)} disabled={atCurrentMonth} aria-label="Next month">
                  <Chevron direction="right" />
                </button>
              </div>
            </div>

            <div
              className={`date-range-grid${pressing ? ' is-dragging' : ''}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerLeave={() => { if (!pressing) setHovered(null) }}
            >
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="date-range-weekday" aria-hidden="true">{d}</span>
              ))}
              {monthGrid(viewMonth).map((day, i) => {
                if (!day) return <span key={`pad-${i}`} />
                const isFuture = day > today
                const isStart = sameDay(day, spanFrom)
                const isEnd = sameDay(day, spanTo)
                const inSpan = !!spanFrom && !!spanTo && day > spanFrom && day < spanTo
                const classes = [
                  'date-range-day',
                  inSpan && 'in-span',
                  (isStart || isEnd) && 'is-edge',
                  isStart && spanTo && !isEnd && 'span-start',
                  isEnd && spanFrom && !isStart && 'span-end',
                  sameDay(day, today) && 'is-today',
                ].filter(Boolean).join(' ')
                return (
                  <button
                    key={day.getTime()}
                    type="button"
                    className={classes}
                    data-day={day.getTime()}
                    disabled={isFuture}
                    // Pointer presses are handled on the grid; detail 0 means keyboard activation
                    onClick={(e) => { if (e.detail === 0) pickDay(day) }}
                    aria-label={formatNumeric(day)}
                    aria-pressed={isStart || isEnd}
                  >
                    <span>{day.getDate()}</span>
                  </button>
                )
              })}
            </div>

            <div className="date-range-readout" aria-live="polite">
              {draftStart ? (
                <>
                  <span>{formatNumeric(draftStart)}</span>
                  <span className="date-range-readout-sep">→</span>
                  <span className="date-range-readout-hint">Select end</span>
                </>
              ) : value.from || value.to ? (
                <>
                  <span>{value.from ? formatNumeric(value.from) : '—'}</span>
                  <span className="date-range-readout-sep">→</span>
                  <span>{value.to ? formatNumeric(value.to) : 'Today'}</span>
                </>
              ) : (
                <span className="date-range-readout-hint">Select start date</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
