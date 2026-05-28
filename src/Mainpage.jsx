import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAppData } from './context/AppDataProvider'
import { useAppDialog } from './context/AppDialogProvider'
import { TierMedal } from './components/TierMedal'
import { loadTotalXp, tierProgress } from './conquest/xpTier'

const AUTH_KEY = 'authUser'
const BRAND = 'var(--brand-blue)'

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null')
  } catch {
    return null
  }
}

function parseYmd(dateString) {
  const [y, m, d] = dateString.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toYmd(date) {
  const y = date.getFullYear()
  const mo = `${date.getMonth() + 1}`.padStart(2, '0')
  const da = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function startOfSundayWeek(d) {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  const day = x.getDay()
  x.setDate(x.getDate() - day)
  return x
}

function addDays(date, n) {
  const x = new Date(date)
  x.setDate(x.getDate() + n)
  return x
}

function calculateDday(deadline) {
  const now = new Date()
  const diff = parseYmd(deadline).getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export default function MainPage() {
  const user = getAuthUser()
  const navigate = useNavigate()
  const { contests, globalScrapCounts, setBookmarked } = useAppData()
  const { showConfirm } = useAppDialog()
  const [weekTab, setWeekTab] = useState('all')
  const [xpRev, setXpRev] = useState(0)

  const userId = user?.id ?? null

  useEffect(() => {
    const bump = (e) => {
      if (userId != null && e?.detail?.userId != null && String(e.detail.userId) !== String(userId)) return
      setXpRev((n) => n + 1)
    }
    window.addEventListener('conquest-xp-changed', bump)
    return () => window.removeEventListener('conquest-xp-changed', bump)
  }, [userId])

  const conquestHud = useMemo(() => {
    const total = userId != null ? loadTotalXp(userId) : 0
    const { tier, segPct, next } = tierProgress(total)
    const hi = next ? next.minXp : null
    const xpLabel =
      hi == null
        ? `${total.toLocaleString('ko-KR')} XP (플래티넘)`
        : `${total.toLocaleString('ko-KR')} / ${hi.toLocaleString('ko-KR')} XP`
    return { tier, segPct: Math.round(segPct * 10) / 10, xpLabel }
  }, [xpRev, userId])

  const weekStart = startOfSundayWeek(new Date())
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const aiPicks = useMemo(
    () =>
      contests.filter(
        (c) => c.tags.some((t) => /인공지능|AI|머신|딥러닝/i.test(t) || t.toLowerCase() === 'ai'),
      ),
    [contests],
  )
  const aiShowTwo = aiPicks.slice(0, 2)

  const imminent = useMemo(() => {
    return [...contests]
      .filter((c) => calculateDday(c.deadline) >= 0)
      .sort((a, b) => parseYmd(a.deadline).getTime() - parseYmd(b.deadline).getTime())[0]
  }, [contests])

  const scrapRanked = useMemo(() => {
    const counts = globalScrapCounts
    return [...contests]
      .map((c) => ({ c, n: counts[String(c.id)] ?? 0 }))
      .sort((a, b) => b.n - a.n || parseYmd(a.c.deadline).getTime() - parseYmd(b.c.deadline).getTime())
      .slice(0, 5)
      .map((x) => ({ ...x.c, scrapCount: x.n }))
  }, [contests, globalScrapCounts])

  if (!user) return <Navigate to="/" replace />

  const mineActive = weekTab === 'mine'

  return (
    <div className="min-h-0 flex-1 bg-white pb-8">
      <div className="space-y-3 px-4 pb-24 pt-3">
        <button
          type="button"
          onClick={() => navigate('/contests')}
          className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-[13px] font-medium text-zinc-700 active:bg-zinc-100"
        >
          <span className="text-zinc-400" aria-hidden>
            ⌕
          </span>
          <span className="text-zinc-400">검색어를 입력하세요</span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/conquest')}
          className="flex w-full items-stretch gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm active:bg-zinc-50"
        >
          <TierMedal tier={conquestHud.tier} size="lg" showLabel={false} />
          <div className="min-w-0 grow">
            <p className="text-sm font-bold text-zinc-900">{conquestHud.tier.label}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${conquestHud.segPct}%`, backgroundColor: BRAND }}
              />
            </div>
            <p className="mt-1.5 text-[10px] font-medium text-zinc-500">{conquestHud.xpLabel}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/calendar')}
          className="relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 px-3 pb-2 pt-2 text-left shadow-sm active:bg-zinc-100"
        >
          <div className="flex items-start justify-between gap-2 pr-1">
            <span className="text-sm font-semibold text-zinc-800">주간 캘린더</span>
            <div className="flex shrink-0 items-center gap-1 text-[10px] font-semibold">
              <span
                role="button"
                tabIndex={0}
                className={weekTab === 'all' ? 'text-[color:var(--brand-blue)]' : 'text-zinc-400'}
                onClick={(e) => {
                  e.stopPropagation()
                  setWeekTab('all')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setWeekTab('all')
                  }
                }}
              >
                전체
              </span>
              <span className="text-zinc-300">|</span>
              <span
                role="button"
                tabIndex={0}
                className={weekTab === 'mine' ? 'text-[color:var(--brand-blue)]' : 'text-zinc-400'}
                onClick={(e) => {
                  e.stopPropagation()
                  setWeekTab('mine')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setWeekTab('mine')
                  }
                }}
              >
                My
              </span>
            </div>
          </div>
          <div className="pointer-events-none mt-1 grid grid-cols-7 gap-0.5 px-0">
            {weekDays.map((day) => {
              const iso = toYmd(day)
              let hasStart = false
              let hasEnd = false
              let hasRes = false
              contests.forEach((c) => {
                const show = mineActive ? c.bookmarked : true
                if (!show) return
                if (c.startDate === iso) hasStart = true
                if (c.endDate === iso) hasEnd = true
                if (c.resultDate === iso) hasRes = true
              })
              const isToday =
                day.getFullYear() === new Date().getFullYear() &&
                day.getMonth() === new Date().getMonth() &&
                day.getDate() === new Date().getDate()
              return (
                <div key={iso} className="flex flex-col items-center py-0.5">
                  <span className="text-[9px] text-zinc-400">{['일', '월', '화', '수', '목', '금', '토'][day.getDay()]}</span>
                  <span className={`text-[11px] font-bold ${isToday ? 'text-[color:var(--brand-blue)]' : 'text-zinc-700'}`}>
                    {day.getDate()}
                  </span>
                  <span className="mt-0.5 flex gap-px">
                    {hasStart && <i className="block h-1 w-1 rounded-full bg-emerald-500" />}
                    {hasEnd && <i className="block h-1 w-1 rounded-full bg-[color:var(--brand-blue)]" />}
                    {hasRes && <i className="block h-1 w-1 rounded-full bg-amber-400" />}
                  </span>
                </div>
              )
            })}
          </div>
        </button>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-zinc-900">AI 기반 맞춤 추천 공모전</h2>
            <button
              type="button"
              onClick={() => navigate('/ai-recommend')}
              className="text-xs font-semibold text-[color:var(--brand-blue)]"
            >
              더보기
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(aiShowTwo.length ? aiShowTwo : contests.slice(0, 2)).map((c) => (
              <ContestMiniCard
                key={c.id}
                contest={c}
                onOpen={() => navigate(`/contests/${c.id}`)}
                onToggleScrap={async (e) => {
                  e.stopPropagation()
                  if (!c.bookmarked) {
                    setBookmarked(c.id, true)
                    return
                  }
                  const ok = await showConfirm({
                    message: '스크랩을 해제하시겠습니까?',
                    confirmLabel: '네',
                    cancelLabel: '아니요',
                  })
                  if (ok) setBookmarked(c.id, false)
                }}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-1.5 text-[15px] font-bold text-zinc-900">마감 임박 D-Day</h2>
          {imminent ? (
            <button
              type="button"
              onClick={() => navigate(`/contests/${imminent.id}`)}
              className="relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm active:opacity-95"
            >
              <span className="absolute right-2 top-2 z-10 rounded-md bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-600">
                D-{calculateDday(imminent.deadline)}
              </span>
              <img src={imminent.poster} alt="" className="h-32 w-full object-cover" />
              <div className="p-2.5">
                <p className="line-clamp-2 text-sm font-bold text-zinc-900">{imminent.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{imminent.organizer}</p>
              </div>
            </button>
          ) : (
            <p className="text-sm text-zinc-500">마감 임박 공모전이 없습니다.</p>
          )}
        </section>

        <section>
          <h2 className="mb-1.5 text-[15px] font-bold text-zinc-900">인기 스크랩 공모전 순위</h2>
          {scrapRanked.length === 0 ? (
            <p className="text-sm text-zinc-500">아직 순위 데이터가 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {scrapRanked.map((c, idx) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/contests/${c.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-left active:bg-zinc-100"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-[color:var(--brand-blue)]">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">{c.title}</span>
                  <span className="shrink-0 text-[11px] font-semibold text-zinc-500">{c.scrapCount}명</span>
                  <span className="shrink-0 text-xs font-semibold text-zinc-400">D-{calculateDday(c.deadline)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ContestMiniCard({ contest, onOpen, onToggleScrap }) {
  const dday = calculateDday(contest.deadline)
  const scrapped = Boolean(contest.bookmarked)
  const scrapBtnClass = scrapped
    ? 'shrink-0 flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)] text-sm text-white shadow-sm active:scale-[0.96]'
    : 'shrink-0 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm text-zinc-400 shadow-sm active:scale-[0.96] active:bg-zinc-50'
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-md">
      <button type="button" onClick={onOpen} className="flex flex-col text-left active:opacity-95">
        <img src={contest.poster} alt="" className="aspect-square w-full object-cover" />
        <div className="p-2">
          <p className="line-clamp-2 text-[11px] font-bold text-zinc-900">{contest.title}</p>
        </div>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-2 py-1.5">
        <p className="text-[10px] font-semibold text-[color:var(--brand-blue)]">
          D-{dday >= 0 ? dday : '종료'}
        </p>
        <button type="button" onClick={(e) => onToggleScrap(e)} className={scrapBtnClass} aria-label={scrapped ? '스크랩 해제' : '스크랩'}>
          {scrapped ? '★' : '☆'}
        </button>
      </div>
    </div>
  )
}
