import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { TierMedal } from './components/TierMedal'
import { patchUserXp } from './api/patchUserXp'
import { loadTotalXp, saveTotalXp, tierProgress } from './conquest/xpTier'

const AUTH_KEY = 'authUser'
const QUEST_BAG_KEY = 'conquest_quest_persist_by_user_v1'
const LEGACY_QUEST_KEY = 'conquest_quest_persist_v1'

function readQuestBag() {
  try {
    const bag = JSON.parse(localStorage.getItem(QUEST_BAG_KEY) ?? '{}')
    return bag && typeof bag === 'object' ? bag : {}
  } catch {
    return {}
  }
}

function writeQuestBag(bag) {
  localStorage.setItem(QUEST_BAG_KEY, JSON.stringify(bag))
}

const QUEST_PRIMARY = '#3B82F6'
const COMPLETE_GREEN = '#10B981'
const PROGRESS_GREY = '#E5E7EB'
const BTN_GREY_FG = '#9CA3AF'
const DETAIL_QUEST_DAILY_CLAIM_CAP = 5

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null')
  } catch {
    return null
  }
}

function pad2(n) {
  return `${n}`.padStart(2, '0')
}

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** ISO 월요일 시작 주 키 */
function weekMondayYmd() {
  const x = new Date()
  x.setHours(12, 0, 0, 0)
  const day = x.getDay()
  const monOffset = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + monOffset)
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`
}

function emptyPersist(today, wk) {
  return {
    claimedIds: {},
    dailyDay: today,
    weeklyKey: wk,
    detail: { prog: 0, completionsToday: 0 },
    daily: {
      'd-ai': 0,
      'd-scrap': 0,
      'd-cmt': 0,
    },
    weekly: {
      'w-streak3': 0,
      'w-streak7': 0,
      'w-share': 0,
      'w-scrap3': 0,
      'w-team': 0,
    },
    lifetime: {
      scrap: 0,
      teamPost: 0,
      teamCmt: 0,
      apply: 0,
    },
    achieveProg: {},
  }
}

function hydratePersistBlob(o, today, wk) {
  if (!o || typeof o !== 'object') return emptyPersist(today, wk)
  let next = {
      claimedIds: o.claimedIds && typeof o.claimedIds === 'object' ? { ...o.claimedIds } : {},
      dailyDay: o.dailyDay || today,
      weeklyKey: o.weeklyKey || wk,
      detail: o.detail && typeof o.detail === 'object' ? o.detail : { prog: 0, completionsToday: 0 },
      daily: { ...emptyPersist(today, wk).daily, ...(typeof o.daily === 'object' ? o.daily : {}) },
      weekly: { ...emptyPersist(today, wk).weekly, ...(typeof o.weekly === 'object' ? o.weekly : {}) },
      lifetime: {
        ...emptyPersist(today, wk).lifetime,
        ...(typeof o.lifetime === 'object' ? o.lifetime : {}),
      },
      achieveProg: typeof o.achieveProg === 'object' ? o.achieveProg : {},
    }
  const dailyIds = ['d-att', 'd-ai', 'd-detail', 'd-scrap', 'd-cmt']
  if (next.dailyDay !== today) {
    next = {
      ...next,
      dailyDay: today,
      detail: { prog: 0, completionsToday: 0 },
      daily: {
        'd-ai': 0,
        'd-scrap': 0,
        'd-cmt': 0,
      },
    }
    const cl = { ...next.claimedIds }
    for (const id of dailyIds) delete cl[id]
    next.claimedIds = cl
  }
  if (next.weeklyKey !== wk) {
    const cl = { ...next.claimedIds }
    for (const id of ['w-streak3', 'w-streak7', 'w-share', 'w-scrap3', 'w-team']) delete cl[id]
    next = { ...next, weeklyKey: wk }
    next.claimedIds = cl
  }
  return next
}

function loadPersist(userId) {
  const today = todayYmd()
  const wk = weekMondayYmd()
  if (!userId) return emptyPersist(today, wk)

  try {
    const uid = String(userId)
    const bag = readQuestBag()
    let raw = bag[uid]

    if (raw == null) {
      const legacyRaw = localStorage.getItem(LEGACY_QUEST_KEY)
      if (legacyRaw) {
        raw = JSON.parse(legacyRaw)
        bag[uid] = raw
        writeQuestBag(bag)
        localStorage.removeItem(LEGACY_QUEST_KEY)
      }
    }

    const next = hydratePersistBlob(raw ?? null, today, wk)

    bag[uid] = next
    writeQuestBag(bag)
    return next
  } catch {
    return emptyPersist(today, wk)
  }
}

function savePersist(userId, p) {
  if (!userId) return
  const uid = String(userId)
  const bag = readQuestBag()
  bag[uid] = p
  writeQuestBag(bag)
}

function formatXp(n) {
  return n.toLocaleString('ko-KR')
}

const ACHIEVE_SECTIONS = [
  {
    key: 'onboard',
    label: '온보딩 및 첫걸음',
    items: [
      {
        id: 'ach-started',
        code: '',
        icon: '🌱',
        title: '시작이 반',
        xp: 50,
        desc: '가입 후 프로필(학과·보유 스킬·관심사) 작성 완료',
        max: 1,
      },
      {
        id: 'ach-first-scrap',
        code: '',
        icon: '⭐',
        title: '첫 번째 별',
        xp: 100,
        desc: '공모전 첫 스크랩 완료',
        max: 1,
      },
      {
        id: 'ach-notify',
        code: '',
        icon: '🔔',
        title: '알림 설정',
        xp: 20,
        desc: 'AI 추천·마감 알림 설정 최초 1회',
        max: 1,
      },
      {
        id: 'ach-first-tier',
        code: '',
        icon: '🎖️',
        title: '승급의 기쁨',
        xp: 200,
        desc: '최초 티어 승급(예: 브론즈→실버)',
        max: 1,
      },
    ],
  },
  {
    key: 'team',
    label: '팀 빌딩 및 활동 심화',
    items: [
      { id: 'ach-team-leader', icon: '📣', title: '모집의 리더', xp: 100, desc: '팀 모집 게시판 첫 게시글', max: 1 },
      { id: 'ach-team-debut', icon: '💬', title: '커뮤니티 데뷔', xp: 100, desc: '팀 모집 게시판 첫 댓글', max: 1 },
      { id: 'ach-tip', icon: '📎', title: '숨은 공로자', xp: 150, desc: '플랫폼에 없는 외부 공모전 정보 제보', max: 1 },
      {
        id: 'ach-board',
        icon: '🏔️',
        title: '리더보더',
        xp: 500,
        desc: '주간 리더보드 상위 100위 진입',
        max: 1,
      },
    ],
  },
  {
    key: 'finish',
    label: '완주 및 고도화',
    items: [
      { id: 'ach-first-apply', icon: '🎯', title: '첫 번째 도전', xp: 300, desc: '첫 공모전 접수·접수 인증 완료', max: 1 },
      { id: 'ach-dday', icon: '⏰', title: '데드라인 세이버', xp: 150, desc: '실제 마감일 당일 제출 인증 완료', max: 1 },
      { id: 'ach-hunter', icon: '🏹', title: '공모전 사냥꾼', xp: 2000, desc: '한 학기 안에 3회 이상 최종 완료', max: 1 },
      {
        id: 'ach-glory',
        icon: '🏆',
        title: '영광의 순간',
        xp: 1000,
        desc: '처음 입상·수상 결과 인증',
        max: 1,
      },
    ],
  },
]

const MS_SCRAP = [
  { id: 'ms-scrap-10', need: 10, xp: 500, icon: '📌', titleSuffix: '(누적 10회)' },
  { id: 'ms-scrap-50', need: 50, xp: 2000, icon: '📌', titleSuffix: '(누적 50회)' },
  { id: 'ms-scrap-100', need: 100, xp: 5000, icon: '📌', titleSuffix: '(누적 100회)' },
]

const MS_POST = [
  { id: 'ms-post-10', need: 10, xp: 500, icon: '✏️', titleSuffix: '(누적 10회)' },
  { id: 'ms-post-50', need: 50, xp: 2000, icon: '✏️', titleSuffix: '(누적 50회)' },
  { id: 'ms-post-100', need: 100, xp: 5000, icon: '✏️', titleSuffix: '(누적 100회)' },
]

const MS_CMT = [
  { id: 'ms-cmt-10', need: 10, xp: 500, icon: '💭', titleSuffix: '(누적 10회)' },
  { id: 'ms-cmt-50', need: 50, xp: 2000, icon: '💭', titleSuffix: '(누적 50회)' },
  { id: 'ms-cmt-100', need: 100, xp: 5000, icon: '💭', titleSuffix: '(누적 100회)' },
]

const MS_APP = [
  { id: 'ms-app-10', need: 10, xp: 3000, icon: '📝', titleSuffix: '(누적 10회)' },
  { id: 'ms-app-50', need: 50, xp: 15000, icon: '📝', titleSuffix: '(누적 50회)' },
  { id: 'ms-app-100', need: 100, xp: 50000, icon: '📝', titleSuffix: '(누적 100회)' },
]

function XpBadge({ xp }) {
  return (
    <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold" style={{ color: QUEST_PRIMARY }}>
      +{formatXp(xp)} XP
    </span>
  )
}

function pct(cur, max) {
  if (max <= 0) return 0
  return Math.min(100, (cur / max) * 100)
}

/** 일일 · 주간 공통 카드 */
function QuestRepeatableCard({
  icon,
  title,
  xp,
  desc,
  cur,
  max,
  state,
  claiming,
  onClaim,
}) {
  const barPct = pct(cur, max)
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-2xl" aria-hidden>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[15px] font-bold leading-tight text-zinc-900">{title}</p>
            <XpBadge xp={xp} />
          </div>
          <p className="mt-1 text-xs leading-snug text-zinc-500">{desc}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${state === 'claimable' || state === 'complete' ? Math.max(barPct, 100) : barPct}%`,
                    background:
                      state === 'progress'
                        ? PROGRESS_GREY
                        : state === 'claimable'
                          ? QUEST_PRIMARY
                          : COMPLETE_GREEN,
                  }}
                />
              </div>
              <p
                className={`mt-1 text-[11px] ${state === 'claimable' ? 'font-semibold' : ''}`}
                style={{ color: state === 'claimable' ? QUEST_PRIMARY : BTN_GREY_FG }}
              >
                {cur} / {max} 진행
              </p>
            </div>
            {state === 'progress' && (
              <button
                type="button"
                disabled
                className="min-h-9 shrink-0 rounded-xl px-4 text-xs font-bold"
                style={{ backgroundColor: PROGRESS_GREY, color: BTN_GREY_FG }}
              >
                수령
              </button>
            )}
            {state === 'claimable' && (
              <button
                type="button"
                disabled={claiming}
                onClick={onClaim}
                className="min-h-9 shrink-0 rounded-xl px-4 text-xs font-bold text-white shadow-sm active:opacity-90 disabled:opacity-55"
                style={{ backgroundColor: QUEST_PRIMARY }}
              >
                {claiming ? '처리중…' : 'XP 수령'}
              </button>
            )}
            {state === 'complete' && (
              <div className="flex shrink-0 items-center gap-1 text-xs font-bold" style={{ color: COMPLETE_GREEN }}>
                <span aria-hidden>
                  ✅
                </span>
                완료
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

/** 업적: 달성 시 XP 수령 1회 → 완료 */
function AchievementCard({
  icon,
  code,
  title,
  xp,
  desc,
  state,
  cur,
  max,
  claiming,
  onClaim,
}) {
  const barPct = pct(cur, max)
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-2xl" aria-hidden>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[15px] font-bold leading-tight text-zinc-900">
              {code ? <span className="mr-1.5 font-mono text-[10px] text-zinc-400">{code}</span> : null}
              {title}
            </p>
            <XpBadge xp={xp} />
          </div>
          <p className="mt-1 text-xs leading-snug text-zinc-500">{desc}</p>

          {(state !== 'complete' || max > 1) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${state === 'claimable' || state === 'complete' ? Math.max(barPct, 100) : barPct}%`,
                      background:
                        state === 'progress' ? PROGRESS_GREY : state === 'claimable' ? QUEST_PRIMARY : COMPLETE_GREEN,
                    }}
                  />
                </div>
                <p
                  className={`mt-1 text-[11px] ${state === 'claimable' ? 'font-semibold' : ''}`}
                  style={{ color: state === 'claimable' ? QUEST_PRIMARY : BTN_GREY_FG }}
                >
                  {max > 1 ? `${cur} / ${max} 진행` : state === 'complete' ? '달성함' : '미달성'}
                </p>
              </div>
              {state === 'progress' && (
                <button
                  type="button"
                  disabled
                  className="min-h-9 shrink-0 rounded-xl px-4 text-xs font-bold"
                  style={{ backgroundColor: PROGRESS_GREY, color: BTN_GREY_FG }}
                >
                  수령
                </button>
              )}
              {state === 'claimable' && (
                <button
                  type="button"
                  disabled={claiming}
                  onClick={onClaim}
                  className="min-h-9 shrink-0 rounded-xl px-4 text-xs font-bold text-white shadow-sm active:opacity-90 disabled:opacity-55"
                  style={{ backgroundColor: QUEST_PRIMARY }}
                >
                  {claiming ? '처리중…' : 'XP 수령'}
                </button>
              )}
            </div>
          )}

          {state === 'complete' ? (
            <p className="mt-4 text-sm font-semibold" style={{ color: COMPLETE_GREEN }}>
              ✅ 완료
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export default function ConQuestPage() {
  const user = getAuthUser()
  const userId = user?.id ?? null
  const navigate = useNavigate()
  const [tab, setTab] = useState('daily')
  const [persist, setPersist] = useState(() => loadPersist(user?.id ?? null))
  const [totalXp, setTotalXp] = useState(() => loadTotalXp(user?.id ?? null))
  const [claimBusy, setClaimBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [statusShake, setStatusShake] = useState(false)
  const claimCooldownUntil = useRef(0)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (userId == null) return undefined
    const onXp = (e) => {
      if (e?.detail?.userId != null && String(e.detail.userId) !== String(userId)) return
      setTotalXp(loadTotalXp(userId))
    }
    window.addEventListener('conquest-xp-changed', onXp)
    setPersist(loadPersist(userId))
    setTotalXp(loadTotalXp(userId))
    return () => window.removeEventListener('conquest-xp-changed', onXp)
  }, [userId])

  const syncPersist = useCallback(
    (updater) => {
      if (userId == null) return
      setPersist((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        savePersist(userId, next)
        return next
      })
    },
    [userId],
  )

  const showError = useCallback((msg) => {
    setToast(msg)
    setStatusShake(true)
    window.setTimeout(() => setStatusShake(false), 500)
  }, [])

  const assertClaimSlot = useCallback(() => {
    const now = Date.now()
    if (now < claimCooldownUntil.current) return false
    claimCooldownUntil.current = now + 1200
    return true
  }, [])

  const applyClaim = useCallback(
    async ({ id, deltaXp, onSuccess }) => {
      if (userId == null) return
      if (!assertClaimSlot()) return
      setClaimBusy(true)
      const prevXp = loadTotalXp(userId)
      try {
        await patchUserXp({ deltaXp, reason: id })
        const nextTotal = prevXp + deltaXp
        saveTotalXp(userId, nextTotal)
        setTotalXp(nextTotal)
        onSuccess?.()
      } catch (e) {
        claimCooldownUntil.current = 0
        showError(e?.message ? `보상 처리에 실패했습니다.\n${e.message}` : '보상 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      } finally {
        setClaimBusy(false)
      }
    },
    [assertClaimSlot, showError, userId],
  )

  const tierUi = useMemo(() => tierProgress(totalXp), [totalXp])

  if (!user) return <Navigate to="/" replace />

  const tabs = [
    { id: 'daily', label: '일일 퀘스트' },
    { id: 'weekly', label: '주간 퀘스트' },
    { id: 'achieve', label: '업적' },
  ]

  const markClaimed = (id) => {
    syncPersist((p) => ({ ...p, claimedIds: { ...p.claimedIds, [id]: true } }))
  }

  /** --- 일일 퀘스트 --- */
  const dAttDone = Boolean(persist.claimedIds['d-att'])
  const dAiCur = persist.daily['d-ai'] ?? 0
  const dScrapCur = persist.daily['d-scrap'] ?? 0
  const dCmtCur = persist.daily['d-cmt'] ?? 0
  const dDetailProg = persist.detail?.prog ?? 0
  const dDetailClaims = persist.detail?.completionsToday ?? 0
  const detailQuotaDone = dDetailClaims >= DETAIL_QUEST_DAILY_CLAIM_CAP

  const dailyCards = [
    {
      key: 'd-att',
      icon: '✅',
      title: '오늘의 출석',
      xp: 10,
      desc: '서비스 로그인 완료',
      cur: 1,
      max: 1,
      state: dAttDone ? 'complete' : 'claimable',
      onClaim: () =>
        applyClaim({
          id: 'd-att',
          deltaXp: 10,
          onSuccess: () => markClaimed('d-att'),
        }),
    },
    {
      key: 'd-ai',
      icon: '🤖',
      title: 'AI 추천 탐색',
      xp: 10,
      desc: '오늘의 AI 추천 공모전 상세 페이지 둘러보기',
      cur: dAiCur,
      max: 1,
      state: persist.claimedIds['d-ai'] ? 'complete' : dAiCur >= 1 ? 'claimable' : 'progress',
      onClaim: () =>
        applyClaim({
          id: 'd-ai',
          deltaXp: 10,
          onSuccess: () => markClaimed('d-ai'),
        }),
    },
    {
      key: 'd-detail',
      icon: '📖',
      title: '정보 수집가',
      xp: 6,
      desc: `공모전 상세 페이지 3회 조회 후 보상 (${DETAIL_QUEST_DAILY_CLAIM_CAP}회/일 한도)`,
      cur: detailQuotaDone ? 3 : dDetailProg,
      max: 3,
      state:
        detailQuotaDone || persist.claimedIds['d-detail']
          ? 'complete'
          : dDetailProg >= 3
            ? 'claimable'
            : 'progress',
      onClaim: () =>
        applyClaim({
          id: 'd-detail',
          deltaXp: 6,
          onSuccess: () => {
            syncPersist((p) => {
              const completionsToday = (p.detail?.completionsToday ?? 0) + 1
              const nextDetail = {
                prog: 0,
                completionsToday,
              }
              const nextClaimed =
                completionsToday >= DETAIL_QUEST_DAILY_CLAIM_CAP ? { ...p.claimedIds, 'd-detail': true } : p.claimedIds
              return { ...p, detail: nextDetail, claimedIds: nextClaimed }
            })
          },
        }),
    },
    {
      key: 'd-scrap',
      icon: '📌',
      title: '관심 등록',
      xp: 5,
      desc: '공모전 1회 스크랩',
      cur: dScrapCur,
      max: 1,
      state: persist.claimedIds['d-scrap'] ? 'complete' : dScrapCur >= 1 ? 'claimable' : 'progress',
      onClaim: () =>
        applyClaim({
          id: 'd-scrap',
          deltaXp: 5,
          onSuccess: () => markClaimed('d-scrap'),
        }),
    },
    {
      key: 'd-cmt',
      icon: '💬',
      title: '커뮤니티 소통',
      xp: 20,
      desc: '커뮤니티에 댓글 1개 작성',
      cur: dCmtCur,
      max: 1,
      state: persist.claimedIds['d-cmt'] ? 'complete' : dCmtCur >= 1 ? 'claimable' : 'progress',
      onClaim: () =>
        applyClaim({
          id: 'd-cmt',
          deltaXp: 20,
          onSuccess: () => markClaimed('d-cmt'),
        }),
    },
  ]

  /** 주간 퀘스트 */
  const weeklyDefs = [
    {
      key: 'w-streak3',
      icon: '📅',
      title: '성실한 도전',
      xp: 50,
      desc: '3일 연속 출석하기',
      cur: persist.weekly['w-streak3'] ?? 0,
      max: 3,
    },
    {
      key: 'w-streak7',
      icon: '🏅',
      title: '완전 정복',
      xp: 100,
      desc: '일주일(7일) 모두 출석하기',
      cur: persist.weekly['w-streak7'] ?? 0,
      max: 7,
    },
    {
      key: 'w-share',
      icon: '🔗',
      title: '정보 공유',
      xp: 30,
      desc: '공모전 링크를 친구에게 1회 공유하기',
      cur: persist.weekly['w-share'] ?? 0,
      max: 1,
    },
    {
      key: 'w-scrap3',
      icon: '⭐',
      title: '적극적 스크랩',
      xp: 100,
      desc: '한 주간 공모전 3개 이상 스크랩하기',
      cur: persist.weekly['w-scrap3'] ?? 0,
      max: 3,
    },
    {
      key: 'w-team',
      icon: '🤝',
      title: '팀 빌딩 참여',
      xp: 100,
      desc: '팀원 모집 게시판에 글 또는 댓글 작성하기',
      cur: persist.weekly['w-team'] ?? 0,
      max: 1,
    },
  ]

  /** 업적 프로그레스 매핑(데모) */
  const achieveCur = useMemo(() => {
    const m = {}
    const baseProg = persist.achieveProg || {}
    m['ach-started'] = baseProg['ach-started'] ?? 0
    m['ach-first-scrap'] = baseProg['ach-first-scrap'] ?? 0
    m['ach-notify'] = baseProg['ach-notify'] ?? 0
    m['ach-first-tier'] = baseProg['ach-first-tier'] ?? (totalXp >= 500 ? 1 : 0)
    m['ach-team-leader'] = baseProg['ach-team-leader'] ?? 0
    m['ach-team-debut'] = baseProg['ach-team-debut'] ?? 0
    m['ach-tip'] = baseProg['ach-tip'] ?? 0
    m['ach-board'] = baseProg['ach-board'] ?? 0
    m['ach-first-apply'] = baseProg['ach-first-apply'] ?? 0
    m['ach-dday'] = baseProg['ach-dday'] ?? 0
    m['ach-hunter'] = baseProg['ach-hunter'] ?? 0
    m['ach-glory'] = baseProg['ach-glory'] ?? 0
    return m
  }, [persist.achieveProg, totalXp])

  const xpHi = tierUi.next ? tierUi.next.minXp : null

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50 pb-12">
        {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[120] mx-auto flex w-full max-w-[412px] justify-center px-4"
          role="status"
        >
          <div className="whitespace-pre-line rounded-2xl border border-red-100 bg-white px-4 py-3 text-center text-[13px] font-semibold text-red-600 shadow-xl">
            {toast}
          </div>
        </div>
      ) : null}

      <div className="px-4 pt-6 text-center">
        <button
          type="button"
          onClick={() => navigate('/main')}
          className="text-[26px] font-extrabold tracking-tight active:opacity-80"
          style={{ color: QUEST_PRIMARY }}
        >
          ConQuest
        </button>
        <p className="mt-1 text-[11px] text-zinc-500">일일 · 주간 퀘스트 · 업적 · 마일스톤</p>
      </div>

      <section
        className={`mx-4 mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-transform ${statusShake ? 'conquest-shake-x' : ''}`}
      >
        <div className="flex items-start gap-4">
          <TierMedal tier={tierUi.tier} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-zinc-900">{tierUi.tier.label}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${tierUi.segPct}%`,
                  backgroundColor: QUEST_PRIMARY,
                }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] font-medium text-zinc-500">
              <span>
                <span className="font-semibold text-zinc-800">{formatXp(totalXp)} XP</span>
                {xpHi != null ? <span>{` · 구간 목표 ${formatXp(xpHi)} XP`}</span> : <span className="text-emerald-600"> · 최고 티어</span>}
              </span>
              <span>{tierUi.next ? `다음 티어까지 ${formatXp(tierUi.needForNext)} XP` : '—'}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-10 mt-6 bg-zinc-50 px-4">
        <div className="-mx-1 flex border-b border-zinc-200">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`relative flex-1 px-2 py-3 text-sm font-bold transition-colors ${
                tab === id ? '' : 'text-zinc-500 hover:text-zinc-700'
              }`}
              style={tab === id ? { color: QUEST_PRIMARY } : undefined}
              onClick={() => setTab(id)}
            >
              <span>{label}</span>
              {tab === id ? (
                <span className="absolute bottom-0 left-3 right-3 h-[3px] rounded-t" style={{ backgroundColor: QUEST_PRIMARY }} />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4 px-4">
        {tab === 'daily' &&
          dailyCards.map((q) => {
            if (q.key === 'd-detail') {
              const st =
                detailQuotaDone || persist.claimedIds['d-detail']
                  ? 'complete'
                  : dDetailProg >= 3
                    ? 'claimable'
                    : 'progress'
              return (
                <QuestRepeatableCard
                  key={q.key}
                  icon={q.icon}
                  title={q.title}
                  xp={q.xp}
                  desc={`${q.desc}\n오늘 보상 수령 ${dDetailClaims} / ${DETAIL_QUEST_DAILY_CLAIM_CAP}회`}
                  cur={detailQuotaDone ? 3 : dDetailProg}
                  max={3}
                  state={st}
                  claiming={claimBusy}
                  onClaim={q.onClaim}
                />
              )
            }
            return (
              <QuestRepeatableCard
                key={q.key}
                icon={q.icon}
                title={q.title}
                xp={q.xp}
                desc={q.desc}
                cur={q.cur}
                max={q.max}
                state={q.state === 'progress' ? 'progress' : q.state === 'claimable' ? 'claimable' : 'complete'}
                claiming={claimBusy}
                onClaim={q.onClaim}
              />
            )
          })}

        {tab === 'weekly' &&
          weeklyDefs.map((w) => {
            const claimed = Boolean(persist.claimedIds[w.key])
            const eligible = !claimed && (w.cur >= w.max)
            const state = claimed ? 'complete' : eligible ? 'claimable' : 'progress'
            return (
              <QuestRepeatableCard
                key={w.key}
                icon={w.icon}
                title={w.title}
                xp={w.xp}
                desc={w.desc}
                cur={Math.min(w.cur, w.max)}
                max={w.max}
                state={state}
                claiming={claimBusy}
                onClaim={() =>
                  applyClaim({
                    id: w.key,
                    deltaXp: w.xp,
                    onSuccess: () => markClaimed(w.key),
                  })
                }
              />
            )
          })}

        {tab === 'achieve' && (
          <>
            {ACHIEVE_SECTIONS.map((sec) => (
              <div key={sec.key} className="space-y-3">
                <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-zinc-400">{sec.label}</h3>
                {sec.items.map((it) => {
                  const cur = achieveCur[it.id] ?? 0
                  const claimed = Boolean(persist.claimedIds[it.id])
                  const eligible = cur >= it.max && !claimed
                  const state = claimed ? 'complete' : eligible ? 'claimable' : 'progress'
                  return (
                    <AchievementCard
                      key={it.id}
                      icon={it.icon}
                      code={it.code}
                      title={it.title}
                      xp={it.xp}
                      desc={it.desc}
                      cur={cur}
                      max={it.max}
                      state={state}
                      claiming={claimBusy}
                      onClaim={() =>
                        applyClaim({
                          id: it.id,
                          deltaXp: it.xp,
                          onSuccess: () => markClaimed(it.id),
                        })
                      }
                    />
                  )
                })}
              </div>
            ))}

            <div className="my-8 border-t border-zinc-200 pt-6">
              <h3 className="mb-3 text-[12px] font-extrabold text-zinc-800">누적 달성 보상 (마일스톤)</h3>
              <p className="mb-4 text-[11px] leading-relaxed text-zinc-500">
                반복 활동에 따라 10회 / 50회 / 100회 구간별로 추가 XP가 지급됩니다 (수령 시 서버 PATCH).
              </p>
              {[
                { label: '공모전 스크랩 누적', count: persist.lifetime.scrap, defs: MS_SCRAP },
                { label: '팀 모집 글쓰기 누적', count: persist.lifetime.teamPost, defs: MS_POST },
                { label: '팀 모집 댓글 누적', count: persist.lifetime.teamCmt, defs: MS_CMT },
                { label: '공모전 지원 누적', count: persist.lifetime.apply, defs: MS_APP },
              ].map((block) => (
                <div key={block.label} className="mb-8 space-y-3 last:mb-2">
                  <h4 className="text-[11px] font-bold text-zinc-500">{block.label}</h4>
                  {block.defs.map((m) => {
                    const cur = block.count
                    const max = m.need
                    const claimed = Boolean(persist.claimedIds[m.id])
                    const eligible = !claimed && cur >= max
                    const state = claimed ? 'complete' : eligible ? 'claimable' : 'progress'
                    return (
                      <QuestRepeatableCard
                        key={m.id}
                        icon={m.icon}
                        title={`${block.label.replace(' 누적', '')} ${m.titleSuffix}`}
                        xp={m.xp}
                        desc={`현재 ${formatXp(cur)}회 · 보상 단계`}
                        cur={Math.min(cur, max)}
                        max={max}
                        state={state}
                        claiming={claimBusy}
                        onClaim={() =>
                          applyClaim({
                            id: m.id,
                            deltaXp: m.xp,
                            onSuccess: () => markClaimed(m.id),
                          })
                        }
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
