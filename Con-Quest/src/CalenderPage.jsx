import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from './context/AppDataProvider'
import { useAppDialog } from './context/AppDialogProvider'

const BRIGHT_BLUE = '#3B6CFF'
const WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function toDateOnly(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toYmd(d) {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isSameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const { contests, setBookmarked } = useAppData()
  const { showConfirm } = useAppDialog()

  const [tab, setTab] = useState('all')
  const [monthDate, setMonthDate] = useState(new Date(2026, 3, 1))
  const [filterDay, setFilterDay] = useState(null)

  const displayedContests = useMemo(() => {
    let list = tab === 'mine' ? contests.filter((c) => c.bookmarked) : [...contests]
    if (filterDay) {
      const iso = filterDay
      list = list.filter((c) => c.startDate === iso || c.endDate === iso)
    }
    return list
  }, [contests, tab, filterDay])

  const calendarDays = useMemo(() => {
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
    const gridStart = new Date(monthStart)
    gridStart.setDate(monthStart.getDate() - monthStart.getDay())
    const gridEnd = new Date(monthEnd)
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()))

    const days = []
    const current = new Date(gridStart)
    while (current <= gridEnd) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return days
  }, [monthDate])

  const weekRows = useMemo(() => {
    const rows = []
    for (let i = 0; i < calendarDays.length; i += 7) rows.push(calendarDays.slice(i, i + 7))
    return rows
  }, [calendarDays])

  const deadlineHeavyWeek = useMemo(() => {
    const map = new Map()
    const base = tab === 'mine' ? contests.filter((c) => c.bookmarked) : contests
    weekRows.forEach((week, index) => {
      const deadlineCount = base.reduce((sum, contest) => {
        const deadline = toDateOnly(contest.endDate)
        const inWeek = week.some((day) => isSameDay(day, deadline))
        return sum + (inWeek ? 1 : 0)
      }, 0)
      map.set(index, deadlineCount >= 2)
    })
    return map
  }, [contests, tab, weekRows])

  const ddaySorted = useMemo(() => {
    const now = new Date()
    return [...displayedContests].sort((a, b) => {
      const left = toDateOnly(a.endDate).getTime() - now.getTime()
      const right = toDateOnly(b.endDate).getTime() - now.getTime()
      return left - right
    })
  }, [displayedContests])

  const shiftMonth = (step) => {
    setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + step, 1))
  }

  const onDayClick = (day) => {
    const iso = toYmd(day)
    if (filterDay === iso) {
      setFilterDay(null)
      return
    }
    setFilterDay(iso)
  }

  const toggleBookmark = async (id, marked) => {
    if (marked) {
      const ok = await showConfirm({ message: '스크랩을 해제할까요?' })
      if (!ok) return
      setBookmarked(id, false)
    } else {
      setBookmarked(id, true)
    }
  }

  const getDayEvents = (day) => {
    const pool = tab === 'mine' ? contests.filter((c) => c.bookmarked) : contests
    const starts = pool.some((contest) => isSameDay(day, toDateOnly(contest.startDate)))
    const ends = pool.some((contest) => isSameDay(day, toDateOnly(contest.endDate)))
    return { starts, ends }
  }

  return (
    <div className="mx-auto flex h-auto min-h-[100dvh] w-full max-w-[412px] flex-col overflow-hidden bg-white">
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-5">
        <header className="border-b border-zinc-100 pb-2">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="min-h-10 rounded-xl px-2 text-xl font-bold text-zinc-700 active:scale-[0.96]"
            >
              {'<'}
            </button>
            <p className="text-lg font-bold text-zinc-900">
              {monthDate.getFullYear()}년 {monthDate.getMonth() + 1}월
            </p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="min-h-10 rounded-xl px-2 text-xl font-bold text-zinc-700 active:scale-[0.96]"
            >
              {'>'}
            </button>
          </div>

          <div className="flex">
            <button
              type="button"
              onClick={() => setTab('all')}
              className={`relative min-h-10 flex-1 text-sm font-semibold ${
                tab === 'all' ? 'text-[color:var(--blue)]' : 'text-zinc-500'
              }`}
              style={{ '--blue': BRIGHT_BLUE }}
            >
              전체 캘린더
              {tab === 'all' && (
                <span className="absolute bottom-0 left-1/2 h-[2px] w-16 -translate-x-1/2 rounded-full bg-[color:var(--blue)]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('mine')}
              className={`relative min-h-10 flex-1 text-sm font-semibold ${
                tab === 'mine' ? 'text-[color:var(--blue)]' : 'text-zinc-500'
              }`}
              style={{ '--blue': BRIGHT_BLUE }}
            >
              마이 캘린더
              {tab === 'mine' && (
                <span className="absolute bottom-0 left-1/2 h-[2px] w-16 -translate-x-1/2 rounded-full bg-[color:var(--blue)]" />
              )}
            </button>
          </div>
          {filterDay ? (
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-zinc-600">선택: {filterDay}</p>
              <button
                type="button"
                onClick={() => setFilterDay(null)}
                className="text-xs font-bold text-[color:var(--brand-blue)]"
              >
                전체보기
              </button>
            </div>
          ) : null}
        </header>

        <div className="mt-2 rounded-2xl border border-zinc-100 bg-zinc-50/40 p-1.5">
          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] font-semibold text-zinc-500">
            {WEEK_LABELS.map((label) => (
              <div key={label} className="py-0.5">
                {label}
              </div>
            ))}
          </div>

          <div className="space-y-0.5">
            {weekRows.map((week, weekIndex) => (
              <div
                key={week[0].toISOString()}
                className={`grid grid-cols-7 gap-0.5 rounded-lg p-0.5 ${
                  deadlineHeavyWeek.get(weekIndex) ? 'bg-red-50' : ''
                }`}
              >
                {week.map((day) => {
                  const inCurrentMonth = day.getMonth() === monthDate.getMonth()
                  const { starts, ends } = getDayEvents(day)
                  const iso = toYmd(day)
                  const sel = filterDay === iso
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => onDayClick(day)}
                      className={`min-h-[48px] rounded-md px-0.5 py-1 text-center ${
                        sel ? 'ring-2 ring-[color:var(--brand-blue)] ring-offset-1' : 'bg-white/80'
                      }`}
                    >
                      <p className={`text-[11px] font-semibold ${inCurrentMonth ? 'text-zinc-800' : 'text-zinc-300'}`}>
                        {day.getDate()}
                      </p>
                      <div className="mt-0.5 flex items-center justify-center gap-0.5">
                        {starts && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                        {ends && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRIGHT_BLUE }} />}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pb-2">
          <div className="space-y-2">
            {ddaySorted.map((contest) => {
              const dday = Math.ceil(
                (toDateOnly(contest.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
              )
              return (
                <article key={contest.id} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-md">
                  <button
                    type="button"
                    className="flex w-full gap-3 text-left"
                    onClick={() => navigate(`/contests/${contest.id}`)}
                  >
                    <img
                      src={contest.poster}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-zinc-900">{contest.title}</p>
                      <p className="mt-1 text-xs text-zinc-600">{contest.organizer}</p>
                      <p className="mt-1 text-xs font-semibold" style={{ color: BRIGHT_BLUE }}>
                        {dday >= 0 ? `D-${dday}` : `마감 ${Math.abs(dday)}일 지남`}
                      </p>
                    </div>
                  </button>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => toggleBookmark(contest.id, contest.bookmarked)}
                      className="h-8 w-8 rounded-md text-lg active:scale-[0.95]"
                      aria-label="북마크 토글"
                    >
                      {contest.bookmarked ? '★' : '☆'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
