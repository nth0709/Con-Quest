import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import CalendarPage from './CalenderPage'
import ContestPage from './ContestPage'
import MainPage from './Mainpage'
import CommunityPage from './CommunityPage'
import PostDetailPage from './PostDetailPage'
import AIAnalysisPage from './AIAnalysisPage'
import ConQuestPage from './ConQuestPage'
import AIRecommendPage from './AIRecommendPage'
import DummyPage from './DummyPage'
import BottomNavigation from './components/BottomNavigation'
import PersonalizedNotificationWidget from './components/PersonalizedNotificationWidget'
import { loginRequest, signupRequest } from './api/auth'
import { clearAccessToken, hasApiBase, saveAccessToken } from './api/client'
import { saveTotalXp } from './conquest/xpTier'
import { notifyAuthChanged } from './utils/authNotify'
import { isAiProfileIncomplete } from './utils/aiProfileCompleteness'
import { useAppDialog } from './context/AppDialogProvider'
import { ALL_MAJORS, MAJOR_GROUPS } from './constants/majors'
import { INTEREST_CATEGORIES, JOB_FIELDS, SKILLS as TAG_SKILLS, TOOLS as TAG_TOOLS } from './constants/tagsDB'

const BRAND_BLUE = '#3B6CFF'

/** 회원가입 전공 검색 옵션 (중복 학과명 제거) */
const SIGNUP_MAJOR_OPTIONS = [...new Set(ALL_MAJORS)]

function normalizeSearchText(text) {
  return (text ?? '').toLowerCase().replace(/\s+/g, '')
}

/** 계열·중분류명으로 검색어 연관 매칭 */
function buildMajorSynonymMap() {
  const map = {}
  for (const g of MAJOR_GROUPS) {
    for (const s of g.subcategories) {
      for (const m of s.majors) {
        const key = normalizeSearchText(m)
        if (!map[key]) map[key] = []
        const extras = [g.name, s.name]
        for (const part of s.name.split(/[(/,]/)) {
          const t = part.replace(/\)/g, '').trim()
          if (t) extras.push(t)
        }
        for (const w of extras) {
          if (w && normalizeSearchText(w) !== key) map[key].push(w)
        }
      }
    }
  }
  return map
}

const MAJOR_SYNONYMS_FOR_SEARCH = buildMajorSynonymMap()

const JOB_FIELD_NAMES = JOB_FIELDS.map((f) => f.name)

function buildJobFieldSynonymMap() {
  const map = {}
  for (const f of JOB_FIELDS) {
    const key = normalizeSearchText(f.name)
    if (!map[key]) map[key] = []
    for (const kw of f.keywords) {
      if (kw && normalizeSearchText(kw) !== key) map[key].push(kw)
    }
  }
  return map
}

const JOB_FIELD_SYNONYMS = buildJobFieldSynonymMap()

const CAREER_YEARS = ['1~3년', '4~6년', '7~10년', '10년 이상']
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

const DRAFT_KEY = 'signupDraft'
const USERS_KEY = 'users'
const AUTH_KEY = 'authUser'

function getUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]')
}

function getAuthUser() {
  return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null')
}

function saveAuthUser(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
  notifyAuthChanged()
}

function saveUser(user, accessToken) {
  const users = getUsers()
  const nextUsers = [...users.filter((item) => item.id !== user.id), user]
  localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers))
  if (accessToken) saveAccessToken(accessToken)
  if (typeof user?.xp === 'number') saveTotalXp(user.id, user.xp)
  saveAuthUser(user)
}

function shouldFallbackToLocal(error) {
  const message = String(error?.message ?? '')
  return (
    message === 'API_BASE_MISSING' ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('Load failed')
  )
}

function getSignupDraft() {
  return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')
}

function clearSignupDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

function useKeyboardAware() {
  useEffect(() => {
    const onFocusIn = (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
    }
    const syncInset = () => {
      const viewport = window.visualViewport
      if (!viewport) return
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      document.documentElement.style.setProperty('--kb-inset', `${inset}px`)
    }
    window.addEventListener('focusin', onFocusIn)
    window.visualViewport?.addEventListener('resize', syncInset)
    syncInset()
    return () => {
      window.removeEventListener('focusin', onFocusIn)
      window.visualViewport?.removeEventListener('resize', syncInset)
    }
  }, [])
}

function AppFrame({ children }) {
  return (
    <div className="relative mx-auto flex h-auto min-h-[100dvh] w-full max-w-[412px] flex-col overflow-hidden bg-white text-zinc-900 shadow-[0_8px_28px_rgba(15,23,42,0.08)]">
      {children}
    </div>
  )
}

function PageTransition({ children }) {
  const location = useLocation()
  return <div key={location.pathname} className="animate-page-in">{children}</div>
}

function PrimaryButton({ className = '', children, ...props }) {
  return (
    <button
      {...props}
      className={`min-h-11 w-full rounded-xl bg-[var(--brand-blue)] px-4 py-3 text-base font-semibold text-white active:scale-[0.985] active:brightness-95 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

function SecondaryButton({ className = '', children, ...props }) {
  return (
    <button
      {...props}
      className={`min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base font-semibold text-zinc-700 active:scale-[0.985] active:bg-zinc-100 ${className}`}
    >
      {children}
    </button>
  )
}

function InputField({ label, ...props }) {
  return (
    <label className="block rounded-2xl border border-zinc-200 bg-white p-3">
      <span className="mb-2 block text-sm font-semibold text-zinc-700">{label}</span>
      <input
        {...props}
        className="min-h-11 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none focus:border-[var(--brand-blue)]"
      />
    </label>
  )
}

function ChipGroup({ label, options, selected, onToggle }) {
  return (
    <section className="rounded-2xl border border-zinc-200 p-3">
      <p className="mb-2 text-sm font-semibold text-zinc-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((item) => {
          const active = selected.includes(item)
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold active:scale-[0.98] ${
                active ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-300 text-zinc-700'
              }`}
            >
              {item}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function SearchableSelect({ label, options, value, onChange, placeholder, synonyms, onConfirm, footer }) {
  const normalize = (text) => text.toLowerCase().replace(/\s+/g, '')
  const candidates = useMemo(() => {
    const q = normalize(value ?? '')
    return options
      .map((item) => {
        const itemKey = normalize(item)
        const direct = itemKey.includes(q)
        const synonymHit = (synonyms?.[itemKey] ?? []).some((word) => normalize(word).includes(q))
        return { item, score: direct ? 2 : synonymHit ? 1 : 0 }
      })
      .filter((entry) => (q ? entry.score > 0 : true))
      .sort((a, b) => b.score - a.score || a.item.localeCompare(b.item, 'ko'))
      .slice(0, 12)
      .map((entry) => entry.item)
  }, [options, synonyms, value])

  return (
    <section className="rounded-2xl border border-zinc-200 p-3">
      <p className="mb-2 text-sm font-semibold text-zinc-700">{label}</p>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onConfirm?.(value)
          }
        }}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-xl border border-zinc-200 px-3 text-base outline-none focus:border-[var(--brand-blue)]"
      />
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {candidates.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                onChange(item)
                onConfirm?.(item)
              }}
              className="min-h-11 rounded-full border border-[var(--brand-blue)]/35 bg-[var(--brand-blue)]/10 px-4 text-sm font-semibold text-[var(--brand-blue)] active:scale-[0.98]"
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  )
}

/** 계열 → 중분류 → 학과 (회원가입 전용, 앱 내부 패널) */
function MajorFinderPanel({ open, onClose, onPick }) {
  const [group, setGroup] = useState(null)
  const [sub, setSub] = useState(null)

  useEffect(() => {
    if (!open) {
      setGroup(null)
      setSub(null)
    }
  }, [open])

  if (!open) return null

  const title = !group ? '계열 선택' : !sub ? '세부 분야 선택' : '학과 선택'

  const goBack = () => {
    if (sub) setSub(null)
    else if (group) setGroup(null)
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        className="min-h-0 flex-1 bg-zinc-900/35 backdrop-blur-[1px]"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="flex max-h-[min(88dvh,640px)] shrink-0 flex-col rounded-t-2xl border border-b-0 border-zinc-200 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-2 py-3">
          {group ? (
            <button
              type="button"
              onClick={goBack}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-zinc-700 active:bg-zinc-100"
            >
              뒤로
            </button>
          ) : (
            <span className="w-[52px]" aria-hidden />
          )}
          <p className="flex-1 text-center text-sm font-semibold text-zinc-800">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg px-3 text-sm font-semibold text-zinc-500 active:bg-zinc-100"
          >
            닫기
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          {!group &&
            MAJOR_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGroup(g)}
                className="mb-2 flex min-h-12 w-full items-center rounded-xl border border-zinc-200 px-4 text-left text-sm font-semibold text-zinc-800 active:scale-[0.99] active:bg-zinc-50"
              >
                {g.name}
              </button>
            ))}
          {group && !sub &&
            group.subcategories.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSub(s)}
                className="mb-2 flex min-h-12 w-full items-center rounded-xl border border-zinc-200 px-4 text-left text-sm font-semibold text-zinc-800 active:scale-[0.99] active:bg-zinc-50"
              >
                {s.name}
              </button>
            ))}
          {group &&
            sub &&
            sub.majors.map((m, idx) => (
              <button
                key={`${sub.id}-${idx}-${m}`}
                type="button"
                onClick={() => {
                  onPick(m)
                  onClose()
                }}
                className="mb-2 flex min-h-12 w-full items-center rounded-xl border border-zinc-200 px-4 text-left text-sm font-semibold text-zinc-800 active:scale-[0.99] active:bg-[var(--brand-blue)]/10"
              >
                {m}
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}

/** 희망/현재 직무 — JOB_FIELDS 목록에서 선택 */
function JobFinderPanel({ open, title, onClose, onPick }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query)
    if (!q) return JOB_FIELD_NAMES
    return JOB_FIELD_NAMES.filter((name) => {
      const nk = normalizeSearchText(name)
      if (nk.includes(q)) return true
      const syns = JOB_FIELD_SYNONYMS[nk] ?? []
      return syns.some((w) => normalizeSearchText(w).includes(q))
    })
  }, [query])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-[42] flex flex-col justify-end">
      <button
        type="button"
        className="min-h-0 flex-1 bg-zinc-900/35 backdrop-blur-[1px]"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="flex max-h-[min(88dvh,640px)] shrink-0 flex-col rounded-t-2xl border border-b-0 border-zinc-200 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-2 py-3">
          <span className="w-[52px]" aria-hidden />
          <p className="flex-1 text-center text-sm font-semibold text-zinc-800">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg px-3 text-sm font-semibold text-zinc-500 active:bg-zinc-100"
          >
            닫기
          </button>
        </div>
        <div className="shrink-0 px-3 pb-2 pt-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="직무명·키워드 검색"
            className="min-h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[var(--brand-blue)]"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onPick(name)
                onClose()
              }}
              className="mb-2 flex min-h-12 w-full items-center rounded-xl border border-zinc-200 px-4 text-left text-sm font-semibold text-zinc-800 active:scale-[0.99] active:bg-[var(--brand-blue)]/10"
            >
              {name}
            </button>
          ))}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">검색 결과가 없습니다.</p>}
        </div>
      </div>
    </div>
  )
}

const TAG_INLINE_VISIBLE = 6
const TAG_INLINE_COLLAPSE_AFTER = 4

/** 관심 카테고리 / 스킬 / 툴 — 한 줄 흐름으로 선택 시 왼쪽(앞쪽)으로 모이게 정렬 + 더보기 */
function TagPickerWithMore({ label, options, selected, onToggle, onOpenMore, allowNone = false }) {
  const collapseInline = selected.length >= TAG_INLINE_COLLAPSE_AFTER

  const selectedOrdered = useMemo(() => {
    const optIdx = (name) => (name === '없음' ? -1 : options.indexOf(name))
    const valid = selected.filter((s) => s === '없음' || options.includes(s))
    return [...valid].sort((a, b) => {
      if (allowNone && a === '없음') return -1
      if (allowNone && b === '없음') return 1
      return optIdx(a) - optIdx(b)
    })
  }, [allowNone, options, selected])

  const suggestionChips = useMemo(() => {
    if (collapseInline) return []
    const out = []
    const unsel = options.filter((o) => !selected.includes(o))
    if (allowNone && selected.length === 0) {
      out.push('없음')
    }
    for (const o of unsel) {
      if (out.length >= TAG_INLINE_VISIBLE) break
      out.push(o)
    }
    return out
  }, [allowNone, collapseInline, options, selected])

  return (
    <section className="rounded-2xl border border-zinc-200 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-700">{label}</p>
        <button
          type="button"
          onClick={onOpenMore}
          className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-[var(--brand-blue)] active:bg-[var(--brand-blue)]/10"
        >
          더보기
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedOrdered.map((item) => (
          <button
            key={`s-${item}`}
            type="button"
            onClick={() => onToggle(item)}
            className="min-h-9 max-w-full rounded-full border border-[var(--brand-blue)] bg-[var(--brand-blue)] px-3 py-1.5 text-left text-xs font-semibold leading-snug text-white shadow-sm active:scale-[0.98]"
          >
            {item}
          </button>
        ))}
        {!collapseInline &&
          suggestionChips.map((item) => (
            <button
              key={`g-${item}`}
              type="button"
              onClick={() => onToggle(item)}
              className="min-h-9 max-w-full rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-left text-xs font-semibold leading-snug text-zinc-700 active:scale-[0.98] active:bg-zinc-50"
            >
              {item}
            </button>
          ))}
      </div>
      {collapseInline && (
        <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">더보기를 눌러 추가 선택해 주세요.</p>
      )}
    </section>
  )
}

function TagMultiPickSheet({ open, title, options, selected, onToggle, onClose }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query)
    if (!q) return options
    return options.filter((o) => normalizeSearchText(o).includes(q))
  }, [options, query])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-[45] flex flex-col justify-end">
      <button
        type="button"
        className="min-h-0 flex-1 bg-zinc-900/35 backdrop-blur-[1px]"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="flex max-h-[min(90dvh,680px)] shrink-0 flex-col rounded-t-2xl border border-b-0 border-zinc-200 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-2 py-3">
          <span className="w-[52px]" aria-hidden />
          <p className="flex-1 text-center text-sm font-semibold text-zinc-800">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-lg px-3 text-sm font-semibold text-zinc-500 active:bg-zinc-100"
          >
            닫기
          </button>
        </div>
        <div className="shrink-0 px-3 pb-2 pt-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="태그 검색"
            className="min-h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[var(--brand-blue)]"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-2">
          <div className="flex flex-wrap gap-2">
            {filtered.map((item) => {
              const active = selected.includes(item)
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onToggle(item)}
                  className={`min-h-9 max-w-full rounded-full border px-3 py-1.5 text-left text-xs font-semibold leading-snug active:scale-[0.98] ${
                    active
                      ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white'
                      : 'border-zinc-300 bg-white text-zinc-700 active:bg-zinc-50'
                  }`}
                >
                  {item}
                </button>
              )
            })}
          </div>
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">검색 결과가 없습니다.</p>}
        </div>
        <div className="shrink-0 border-t border-zinc-100 px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <PrimaryButton type="button" onClick={onClose}>
            완료
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

function LandingPage() {
  const navigate = useNavigate()
  return (
    <AppFrame>
      <PageTransition>
        <div className="flex h-auto min-h-[100dvh] flex-col px-5 pb-6 pt-20">
          <h1 className="text-center text-5xl font-extrabold tracking-tight text-[var(--brand-blue)]">ConQuest</h1>
          <div className="mt-auto space-y-3">
            <PrimaryButton onClick={() => navigate('/signup')}>ConQuest 시작하기</PrimaryButton>
            <SecondaryButton onClick={() => navigate('/login')}>이미 계정이 있으신가요?</SecondaryButton>
          </div>
        </div>
      </PageTransition>
    </AppFrame>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const { showAlert } = useAppDialog()
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')

  const login = async () => {
    if (hasApiBase()) {
      try {
        const result = await loginRequest({ id: userId, password })
        saveUser(result.user, result.accessToken)
        navigate('/main')
        return
      } catch (error) {
        if (!shouldFallbackToLocal(error)) {
          await showAlert({ message: error.message || '로그인에 실패했습니다.' })
          return
        }
      }
    }

    const users = getUsers()
    const matched = users.find((item) => item.id === userId && item.password === password)
    if (!matched) {
      await showAlert({ message: '아이디 또는 비밀번호가 틀렸습니다.' })
      return
    }
    saveAuthUser(matched)
    navigate('/main')
  }

  const goToStartClearDraft = () => {
    clearSignupDraft()
    navigate('/', { replace: true })
  }

  return (
    <AppFrame>
      <PageTransition>
        <div className="flex h-auto min-h-[100dvh] flex-col px-5 pb-6 pt-8">
          <p className="text-3xl font-extrabold text-[var(--brand-blue)]">ConQuest</p>
          <div className="mt-14 space-y-3">
            <InputField label="아이디" placeholder="아이디를 입력하세요" value={userId} onChange={(e) => setUserId(e.target.value)} />
            <InputField
              label="비밀번호"
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="mt-auto space-y-3">
            <PrimaryButton onClick={login}>로그인</PrimaryButton>
            <button
              type="button"
              className="min-h-11 w-full text-sm font-semibold text-zinc-500 active:scale-[0.985]"
              onClick={goToStartClearDraft}
            >
              시작 화면으로 돌아가기
            </button>
          </div>
        </div>
      </PageTransition>
    </AppFrame>
  )
}

function SignupPage() {
  const navigate = useNavigate()
  const { showAlert } = useAppDialog()
  const draft = getSignupDraft()

  const [name, setName] = useState(draft.name ?? '')
  const [nameConfirmed, setNameConfirmed] = useState(draft.nameConfirmed ?? false)
  const [nickname, setNickname] = useState(draft.nickname ?? '')
  const [job, setJob] = useState(draft.job ?? '')
  const [major, setMajor] = useState(draft.major ?? '')
  const [minor, setMinor] = useState(draft.minor ?? '')
  const [grade, setGrade] = useState(draft.grade ?? '')
  const [studentStatus, setStudentStatus] = useState(draft.studentStatus ?? '')
  const [desiredRole, setDesiredRole] = useState(draft.desiredRole ?? '')
  const [desiredRoleConfirmed, setDesiredRoleConfirmed] = useState(draft.desiredRoleConfirmed ?? false)
  const [currentRole, setCurrentRole] = useState(draft.currentRole ?? '')
  const [currentRoleConfirmed, setCurrentRoleConfirmed] = useState(draft.currentRoleConfirmed ?? false)
  const [careerYear, setCareerYear] = useState(draft.careerYear ?? '')
  const [categories, setCategories] = useState(draft.categories ?? [])
  const [skills, setSkills] = useState(draft.skills ?? [])
  const [tools, setTools] = useState(draft.tools ?? [])
  const [showGeneralForm, setShowGeneralForm] = useState(draft.showGeneralForm ?? false)
  const [authStepCompleted, setAuthStepCompleted] = useState(draft.authStepCompleted ?? false)
  const [generalInfo, setGeneralInfo] = useState({
    id: draft.id ?? '',
    password: draft.password ?? '',
    passwordCheck: draft.passwordCheck ?? '',
  })
  const [passwordError, setPasswordError] = useState('')
  const [nickDupChecked, setNickDupChecked] = useState(draft.nickDupChecked ?? false)
  const [idDupChecked, setIdDupChecked] = useState(draft.idDupChecked ?? false)
  /** 'major' | 'minor' | null — 전공 찾기 패널 대상 */
  const [majorFinderTarget, setMajorFinderTarget] = useState(null)
  /** 'desired' | 'current' | null — 직무 찾기 */
  const [jobFinderTarget, setJobFinderTarget] = useState(null)
  /** 'categories' | 'skills' | 'tools' | null — 태그 더보기 시트 */
  const [tagSheet, setTagSheet] = useState(null)

  const scrollRef = useRef(null)
  const jobRef = useRef(null)
  const nickRef = useRef(null)
  const studentStep2Ref = useRef(null)
  const studentStep3Ref = useRef(null)
  const prepStepRef = useRef(null)
  const workerStepRef = useRef(null)
  const commonStepRef = useRef(null)
  const generalFormRef = useRef(null)

  const studentStep1Done = major.trim().length > 0 && minor.trim().length > 0
  const studentStep2Done = studentStep1Done && grade && studentStatus
  const prepStepDone = desiredRoleConfirmed
  const workerStepDone = currentRole.trim().length > 0 && currentRoleConfirmed && careerYear.length > 0
  const commonStepReady =
    (job === '대학생/대학원생' && studentStep2Done) ||
    (job === '취업준비생' && prepStepDone) ||
    (job === '직장인/일반' && workerStepDone)
  const commonStepDone = commonStepReady && categories.length > 0 && skills.length > 0 && tools.length > 0
  const readyForProfileSubmit = authStepCompleted && job.length > 0 && commonStepDone

  const smoothScrollTo = (node) => {
    if (!node || !scrollRef.current) return
    requestAnimationFrame(() => {
      const root = scrollRef.current
      if (!root) return
      const n = node.getBoundingClientRect()
      const r = root.getBoundingClientRect()
      const nextTop = root.scrollTop + (n.top - r.top) - 16
      root.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
    })
  }

  useEffect(() => {
    if (nameConfirmed) smoothScrollTo(nickRef.current)
  }, [nameConfirmed])

  useEffect(() => {
    if (nickDupChecked && nickname.trim().length > 0) smoothScrollTo(generalFormRef.current)
  }, [nickDupChecked, nickname])

  useEffect(() => {
    if (studentStep1Done) smoothScrollTo(studentStep2Ref.current)
  }, [studentStep1Done])

  useEffect(() => {
    if (studentStep2Done) smoothScrollTo(studentStep3Ref.current)
  }, [studentStep2Done])

  useEffect(() => {
    if (prepStepDone) smoothScrollTo(commonStepRef.current)
  }, [prepStepDone])

  useEffect(() => {
    if (workerStepDone) smoothScrollTo(commonStepRef.current)
  }, [workerStepDone])

  useEffect(() => {
    if (authStepCompleted) smoothScrollTo(jobRef.current)
  }, [authStepCompleted])

  useEffect(() => {
    if (showGeneralForm) smoothScrollTo(generalFormRef.current)
  }, [showGeneralForm])

  useEffect(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        name,
        nameConfirmed,
        nickname,
        job,
        major,
        minor,
        grade,
        studentStatus,
        desiredRole,
        desiredRoleConfirmed,
        currentRole,
        currentRoleConfirmed,
        careerYear,
        categories,
        skills,
        tools,
        showGeneralForm,
        authStepCompleted,
        nickDupChecked,
        idDupChecked,
        id: generalInfo.id,
        password: generalInfo.password,
        passwordCheck: generalInfo.passwordCheck,
      }),
    )
  }, [
    categories,
    careerYear,
    currentRole,
    desiredRole,
    desiredRoleConfirmed,
    currentRoleConfirmed,
    generalInfo.id,
    generalInfo.password,
    generalInfo.passwordCheck,
    grade,
    idDupChecked,
    job,
    major,
    minor,
    name,
    nameConfirmed,
    nickDupChecked,
    nickname,
    authStepCompleted,
    showGeneralForm,
    skills,
    studentStatus,
    tools,
  ])

  const confirmName = () => {
    if (name.trim().length < 2) return
    setNameConfirmed(true)
  }

  const toggleSingle = (value, setter) => setter(value)
  const toggleMulti = (value, setter) =>
    setter((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]))

  const toggleTagsNoneAware = (value, setter) => {
    setter((prev) => {
      if (value === '없음') {
        return prev.includes('없음') ? [] : ['없음']
      }
      const withoutNone = prev.filter((x) => x !== '없음')
      return withoutNone.includes(value)
        ? withoutNone.filter((x) => x !== value)
        : [...withoutNone, value]
    })
  }

  const resetToStart = () => {
    clearSignupDraft()
    setName('')
    setNameConfirmed(false)
    setNickname('')
    setJob('')
    setMajor('')
    setMinor('')
    setGrade('')
    setStudentStatus('')
    setDesiredRole('')
    setDesiredRoleConfirmed(false)
    setCurrentRole('')
    setCurrentRoleConfirmed(false)
    setCareerYear('')
    setCategories([])
    setSkills([])
    setTools([])
    setShowGeneralForm(false)
    setAuthStepCompleted(false)
    setGeneralInfo({ id: '', password: '', passwordCheck: '' })
    setPasswordError('')
    setNickDupChecked(false)
    setIdDupChecked(false)
    setMajorFinderTarget(null)
    setJobFinderTarget(null)
    setTagSheet(null)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    navigate('/', { replace: true })
  }

  const isGeneralFormValid =
    generalInfo.id.trim().length > 0 &&
    generalInfo.password.trim().length > 0 &&
    generalInfo.passwordCheck.trim().length > 0 &&
    generalInfo.password === generalInfo.passwordCheck &&
    idDupChecked

  const currentJobInfo =
    job === '대학생/대학원생'
      ? { major, minor, grade, studentStatus }
      : job === '취업준비생'
        ? { desiredRole }
        : { currentRole, careerYear }

  const finalizeSignup = async (baseUser) => {
    const user = {
      ...baseUser,
      name,
      nickname,
      job,
      categories,
      skills,
      tools,
      ...currentJobInfo,
    }

    if (hasApiBase()) {
      try {
        const result = await signupRequest(user)
        saveUser(result.user, result.accessToken)
        clearSignupDraft()
        navigate('/main')
        return
      } catch (error) {
        if (!shouldFallbackToLocal(error)) {
          await showAlert({ message: error.message || '회원가입에 실패했습니다.' })
          return
        }
      }
    }

    saveUser(user)
    clearSignupDraft()
    navigate('/main')
  }

  const checkNicknameDuplicate = async () => {
    const nickTrim = nickname.trim()
    if (nickTrim.length < 2) {
      await showAlert({ message: '닉네임을 2자 이상 입력해 주세요.' })
      setNickDupChecked(false)
      return
    }
    const users = getUsers()
    if (users.some((item) => (item.nickname ?? '').trim() === nickTrim)) {
      await showAlert({ message: '이미 사용 중인 닉네임입니다.' })
      setNickDupChecked(false)
      return
    }
    setNickDupChecked(true)
  }

  const checkIdDuplicate = async () => {
    const idTrim = generalInfo.id.trim()
    if (!idTrim) {
      await showAlert({ message: '아이디를 입력해 주세요.' })
      setIdDupChecked(false)
      return
    }
    const users = getUsers()
    if (users.some((item) => item.id === idTrim)) {
      await showAlert({ message: '이미 사용 중인 아이디입니다.' })
      setIdDupChecked(false)
      return
    }
    setIdDupChecked(true)
  }

  const completeGeneralSignup = async () => {
    setPasswordError('')
    const users = getUsers()
    const nickTrim = nickname.trim()
    const idTrim = generalInfo.id.trim()
    if (!nickDupChecked || !idDupChecked) {
      await showAlert({ message: '닉네임과 아이디 중복 확인을 모두 완료해 주세요.' })
      return
    }
    if (users.some((item) => item.id === idTrim)) {
      await showAlert({ message: '이미 사용 중인 아이디입니다.' })
      setIdDupChecked(false)
      return
    }
    if (users.some((item) => (item.nickname ?? '').trim() === nickTrim)) {
      await showAlert({ message: '이미 사용 중인 닉네임입니다.' })
      setNickDupChecked(false)
      return
    }
    if (!PASSWORD_REGEX.test(generalInfo.password)) {
      setPasswordError('비밀번호는 8자 이상, 영문/숫자 조합이어야 합니다')
      return
    }
    setShowGeneralForm(false)
    setAuthStepCompleted(true)
  }

  const completeProfileSignup = async () => {
    await finalizeSignup({
      id: generalInfo.id.trim(),
      password: generalInfo.password,
      authProvider: 'local',
    })
  }

  return (
    <AppFrame>
      <PageTransition>
        <div className="relative flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden">
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-smooth px-5 pb-[calc(128px+var(--kb-inset))] pt-8"
          >
            <p className="text-3xl font-extrabold text-[var(--brand-blue)]">ConQuest</p>
            <div className="mt-6 space-y-4">
              <InputField
                label="이름"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    confirmName()
                  }
                }}
                placeholder="이름을 입력해 주세요"
              />

              {nameConfirmed && (
                <div ref={nickRef} className="animate-card-in">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                    <span className="mb-2 block text-sm font-semibold text-zinc-700">닉네임</span>
                    <div className="flex gap-2">
                      <input
                        value={nickname}
                        onChange={(event) => {
                          setNickname(event.target.value)
                          setNickDupChecked(false)
                        }}
                        placeholder="앱에서 사용할 닉네임"
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-base outline-none focus:border-[var(--brand-blue)]"
                      />
                      <button
                        type="button"
                        onClick={checkNicknameDuplicate}
                        disabled={nickname.trim().length < 2}
                        className="shrink-0 rounded-xl border border-[var(--brand-blue)] bg-[var(--brand-blue)]/10 px-3 text-sm font-bold text-[var(--brand-blue)] disabled:opacity-40"
                      >
                        중복확인
                      </button>
                    </div>
                    {nickDupChecked ? (
                      <p className="mt-2 text-xs font-semibold text-emerald-600">사용 가능한 닉네임입니다.</p>
                    ) : (
                      <p className="mt-2 text-xs text-zinc-500">중복확인 후 다음 단계로 진행할 수 있어요.</p>
                    )}
                  </div>
                </div>
              )}

              {nameConfirmed && nickname.trim().length > 0 && nickDupChecked && !authStepCompleted && (
                <div ref={generalFormRef} className="animate-card-in space-y-3 rounded-2xl border border-zinc-200 p-3">
                  <p className="text-sm font-semibold text-zinc-700">1단계. 계정 정보 입력</p>
                  <p className="-mt-1 text-xs text-zinc-500">이름, 닉네임 확인 후 아이디와 비밀번호를 먼저 설정해 주세요.</p>

                  <div>
                    <span className="mb-2 block text-sm font-semibold text-zinc-700">아이디</span>
                    <div className="flex gap-2">
                      <input
                        placeholder="아이디를 입력하세요"
                        value={generalInfo.id}
                        onChange={(event) => {
                          setIdDupChecked(false)
                          setGeneralInfo((prev) => ({ ...prev, id: event.target.value }))
                        }}
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-base outline-none focus:border-[var(--brand-blue)]"
                      />
                      <button
                        type="button"
                        onClick={checkIdDuplicate}
                        disabled={!generalInfo.id.trim()}
                        className="shrink-0 rounded-xl border border-[var(--brand-blue)] bg-[var(--brand-blue)]/10 px-3 text-sm font-bold text-[var(--brand-blue)] disabled:opacity-40"
                      >
                        중복확인
                      </button>
                    </div>
                    {idDupChecked ? (
                      <p className="mt-2 text-xs font-semibold text-emerald-600">사용 가능한 아이디입니다.</p>
                    ) : (
                      <p className="mt-2 text-xs text-zinc-500">중복확인 후 다음 단계로 진행할 수 있어요.</p>
                    )}
                  </div>

                  <InputField
                    label="비밀번호"
                    type="password"
                    placeholder="비밀번호를 입력하세요"
                    value={generalInfo.password}
                    onChange={(event) => {
                      setPasswordError('')
                      setGeneralInfo((prev) => ({ ...prev, password: event.target.value }))
                    }}
                  />
                  <p className="-mt-1 text-xs text-zinc-500">8자 이상, 영문/숫자를 모두 포함해야 합니다.</p>
                  {passwordError && <p className="-mt-1 text-sm text-rose-500">{passwordError}</p>}

                  <InputField
                    label="비밀번호 확인"
                    type="password"
                    placeholder="비밀번호를 다시 입력하세요"
                    value={generalInfo.passwordCheck}
                    onChange={(event) => setGeneralInfo((prev) => ({ ...prev, passwordCheck: event.target.value }))}
                  />
                  {generalInfo.passwordCheck.length > 0 && generalInfo.password !== generalInfo.passwordCheck && (
                    <p className="-mt-1 text-sm text-rose-500">비밀번호가 일치하지 않습니다</p>
                  )}

                  <PrimaryButton type="button" disabled={!isGeneralFormValid} onClick={completeGeneralSignup}>
                    기본정보 입력으로 이동
                  </PrimaryButton>
                </div>
              )}

              {authStepCompleted && (
                <div className="animate-card-in rounded-2xl border border-[var(--brand-blue)]/20 bg-[var(--brand-blue)]/5 p-3">
                  <p className="text-sm font-semibold text-[var(--brand-blue)]">1단계 완료</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    계정 정보 설정이 끝났어요. 이제 기본정보를 입력하면 회원가입을 마칠 수 있습니다.
                  </p>
                </div>
              )}

              {authStepCompleted && (
                <section ref={jobRef} className="animate-card-in rounded-2xl border border-zinc-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-zinc-700">직업</p>
                  <div className="space-y-2">
                    {['대학생/대학원생', '취업준비생', '직장인/일반'].map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setJob(item)}
                        className={`min-h-11 w-full rounded-xl border px-4 text-base font-semibold active:scale-[0.985] ${
                          job === item ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-300'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {job === '대학생/대학원생' && (
                <div className="animate-card-in space-y-3">
                  <SearchableSelect
                    label="전공"
                    options={SIGNUP_MAJOR_OPTIONS}
                    value={major}
                    onChange={setMajor}
                    placeholder="학과명을 검색해 주세요"
                    synonyms={MAJOR_SYNONYMS_FOR_SEARCH}
                    footer={
                      <SecondaryButton
                        type="button"
                        onClick={() => {
                          setJobFinderTarget(null)
                          setTagSheet(null)
                          setMajorFinderTarget('major')
                        }}
                      >
                        전공 찾기
                      </SecondaryButton>
                    }
                  />
                  <SearchableSelect
                    label="부전공"
                    options={SIGNUP_MAJOR_OPTIONS}
                    value={minor}
                    onChange={setMinor}
                    placeholder="부전공 검색"
                    synonyms={MAJOR_SYNONYMS_FOR_SEARCH}
                    footer={
                      <SecondaryButton
                        type="button"
                        onClick={() => {
                          setJobFinderTarget(null)
                          setTagSheet(null)
                          setMajorFinderTarget('minor')
                        }}
                      >
                        전공 찾기
                      </SecondaryButton>
                    }
                  />
                  <SecondaryButton type="button" onClick={() => setMinor('부전공 없음')} className="text-zinc-900">
                    부전공 없음
                  </SecondaryButton>

                  {studentStep1Done && (
                    <div ref={studentStep2Ref} className="animate-card-in space-y-3">
                      <ChipGroup
                        label="학년"
                        options={['1학년', '2학년', '3학년', '4학년+']}
                        selected={grade ? [grade] : []}
                        onToggle={(value) => toggleSingle(value, setGrade)}
                      />
                      <ChipGroup
                        label="재학 상태"
                        options={['재학', '휴학', '복학 예정', '졸업 예정']}
                        selected={studentStatus ? [studentStatus] : []}
                        onToggle={(value) => toggleSingle(value, setStudentStatus)}
                      />
                    </div>
                  )}
                </div>
              )}

              {job === '취업준비생' && (
                <div ref={prepStepRef} className="animate-card-in space-y-3">
                  <SearchableSelect
                    label="희망 직무 분야"
                    options={JOB_FIELD_NAMES}
                    value={desiredRole}
                    onChange={(value) => {
                      setDesiredRole(value)
                      setDesiredRoleConfirmed(false)
                    }}
                    onConfirm={(value) => {
                      if (value.trim().length > 0) {
                        setDesiredRole(value)
                        setDesiredRoleConfirmed(true)
                      }
                    }}
                    placeholder="직무명·키워드로 검색해 주세요"
                    synonyms={JOB_FIELD_SYNONYMS}
                    footer={
                      <SecondaryButton
                        type="button"
                        onClick={() => {
                          setMajorFinderTarget(null)
                          setTagSheet(null)
                          setJobFinderTarget('desired')
                        }}
                      >
                        희망 직무 분야 찾기
                      </SecondaryButton>
                    }
                  />
                  {!desiredRoleConfirmed && desiredRole.length > 0 && (
                    <p className="text-sm text-zinc-500">엔터를 누르거나 추천 직무를 눌러 확정해 주세요.</p>
                  )}
                </div>
              )}

              {job === '직장인/일반' && (
                <div ref={workerStepRef} className="animate-card-in space-y-3">
                  <SearchableSelect
                    label="현재 종사 직무"
                    options={JOB_FIELD_NAMES}
                    value={currentRole}
                    onChange={(value) => {
                      setCurrentRole(value)
                      setCurrentRoleConfirmed(false)
                    }}
                    onConfirm={(value) => {
                      if (value.trim().length > 0) {
                        setCurrentRole(value)
                        setCurrentRoleConfirmed(true)
                      }
                    }}
                    placeholder="직무명·키워드로 검색해 주세요"
                    synonyms={JOB_FIELD_SYNONYMS}
                    footer={
                      <SecondaryButton
                        type="button"
                        onClick={() => {
                          setMajorFinderTarget(null)
                          setTagSheet(null)
                          setJobFinderTarget('current')
                        }}
                      >
                        현재 종사 직무 찾기
                      </SecondaryButton>
                    }
                  />
                  {!currentRoleConfirmed && currentRole.length > 0 && (
                    <p className="text-sm text-zinc-500">엔터를 누르거나 추천 직무를 눌러 확정해 주세요.</p>
                  )}
                  <ChipGroup
                    label="현재 연차"
                    options={CAREER_YEARS}
                    selected={careerYear ? [careerYear] : []}
                    onToggle={(value) => toggleSingle(value, setCareerYear)}
                  />
                </div>
              )}

              {commonStepReady && (
                <div
                  ref={job === '대학생/대학원생' ? studentStep3Ref : commonStepRef}
                  className="animate-card-in space-y-3"
                >
                  <TagPickerWithMore
                    label="관심 카테고리"
                    options={INTEREST_CATEGORIES}
                    selected={categories}
                    onToggle={(value) => toggleMulti(value, setCategories)}
                    onOpenMore={() => {
                      setMajorFinderTarget(null)
                      setJobFinderTarget(null)
                      setTagSheet('categories')
                    }}
                  />
                  <TagPickerWithMore
                    label="보유 스킬"
                    options={TAG_SKILLS}
                    selected={skills}
                    allowNone
                    onToggle={(value) => toggleTagsNoneAware(value, setSkills)}
                    onOpenMore={() => {
                      setMajorFinderTarget(null)
                      setJobFinderTarget(null)
                      setTagSheet('skills')
                    }}
                  />
                  <TagPickerWithMore
                    label="활용 툴"
                    options={TAG_TOOLS}
                    selected={tools}
                    allowNone
                    onToggle={(value) => toggleTagsNoneAware(value, setTools)}
                    onOpenMore={() => {
                      setMajorFinderTarget(null)
                      setJobFinderTarget(null)
                      setTagSheet('tools')
                    }}
                  />
                </div>
              )}

            </div>
          </div>

          <div className="sticky bottom-0 z-10 shrink-0 border-t border-zinc-100 bg-white/95 px-5 py-3 backdrop-blur">
            {!nameConfirmed ? (
              <PrimaryButton type="button" onClick={confirmName} disabled={name.trim().length < 2}>
                다음
              </PrimaryButton>
            ) : readyForProfileSubmit ? (
              <div className="space-y-2">
                <PrimaryButton type="button" onClick={completeProfileSignup}>
                  가입 완료
                </PrimaryButton>
                <SecondaryButton type="button" onClick={() => navigate('/login')}>
                  이미 계정이 있으신가요?
                </SecondaryButton>
              </div>
            ) : (
              <div className="space-y-2">
                <SecondaryButton type="button" onClick={() => navigate('/login')}>
                  이미 계정이 있으신가요?
                </SecondaryButton>
                <button
                  type="button"
                  className="min-h-11 w-full text-sm font-semibold text-zinc-500 active:scale-[0.985]"
                  onClick={resetToStart}
                >
                  시작 화면으로 돌아가기
                </button>
              </div>
            )}
          </div>

          <MajorFinderPanel
            open={Boolean(majorFinderTarget)}
            onClose={() => setMajorFinderTarget(null)}
            onPick={(name) => {
              if (majorFinderTarget === 'major') setMajor(name)
              else if (majorFinderTarget === 'minor') setMinor(name)
            }}
          />

          <JobFinderPanel
            open={Boolean(jobFinderTarget)}
            title={jobFinderTarget === 'desired' ? '희망 직무 분야' : '현재 종사 직무'}
            onClose={() => setJobFinderTarget(null)}
            onPick={(name) => {
              if (jobFinderTarget === 'desired') {
                setDesiredRole(name)
                setDesiredRoleConfirmed(true)
              } else if (jobFinderTarget === 'current') {
                setCurrentRole(name)
                setCurrentRoleConfirmed(true)
              }
            }}
          />

          <TagMultiPickSheet
            open={tagSheet === 'categories'}
            title="관심 카테고리"
            options={INTEREST_CATEGORIES}
            selected={categories}
            onToggle={(value) => toggleMulti(value, setCategories)}
            onClose={() => setTagSheet(null)}
          />
          <TagMultiPickSheet
            open={tagSheet === 'skills'}
            title="보유 스킬"
            options={['없음', ...TAG_SKILLS]}
            selected={skills}
            onToggle={(value) => toggleTagsNoneAware(value, setSkills)}
            onClose={() => setTagSheet(null)}
          />
          <TagMultiPickSheet
            open={tagSheet === 'tools'}
            title="활용 툴"
            options={['없음', ...TAG_TOOLS]}
            selected={tools}
            onToggle={(value) => toggleTagsNoneAware(value, setTools)}
            onClose={() => setTagSheet(null)}
          />
        </div>
      </PageTransition>
    </AppFrame>
  )
}

/** 개발용: 뷰포트 왼쪽 밖에 숨겨 두고, 가장자리에 마우스를 올리면 슬라이드되어 노출 */
function DevRouteShortcuts() {
  const navigate = useNavigate()
  if (!import.meta.env.DEV) return null
  const links = [
    ['/signup', '가입'],
    ['/login', '로그인'],
    ['/main', '메인'],
    ['/calendar', '캘린더'],
    ['/contests', '공모전'],
    ['/community', '커뮤니티'],
  ]
  return (
    <div className="pointer-events-auto fixed left-0 top-0 z-[9999] max-h-[100dvh]">
      <div className="max-h-[100dvh] max-w-[200px] translate-x-[calc(-100%+22px)] overflow-y-auto overflow-x-hidden rounded-br-lg border border-zinc-500 border-l-0 bg-zinc-900/95 p-1.5 pr-2 pt-2 shadow-[4px_6px_20px_rgba(0,0,0,0.4)] transition-transform duration-200 ease-out hover:translate-x-0">
        <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500">Dev</p>
        <div className="flex flex-col gap-1">
          {links.map(([to, label]) => (
            <button
              key={to}
              type="button"
              onClick={() => navigate(to)}
              className="rounded-md border border-zinc-600 bg-zinc-800/80 px-2 py-1.5 text-left text-[11px] font-semibold text-zinc-100 active:bg-zinc-700"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function readAuthIncomplete() {
  try {
    return isAiProfileIncomplete(JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null'))
  } catch {
    return true
  }
}

function useAuthReloadBump() {
  const [, setBump] = useState(0)
  useEffect(() => {
    const h = () => setBump((n) => n + 1)
    window.addEventListener('conquest-auth-changed', h)
    return () => window.removeEventListener('conquest-auth-changed', h)
  }, [])
}

function IconNavHome({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6H9.5v6H5a1 1 0 0 1-1-1v-9.5Z" strokeLinejoin="round" />
    </svg>
  )
}
function IconNavList({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.5M4 12h.5M4 18h.5" strokeLinecap="round" />
    </svg>
  )
}
function IconNavCalendar({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  )
}
function IconNavChat({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M6 18 4 21v-4.5A9 9 0 0 1 12 4a9 9 0 0 1 0 18 9 9 0 0 1-6-2Z" strokeLinejoin="round" />
    </svg>
  )
}
function IconNavBolt({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" strokeLinejoin="round" />
    </svg>
  )
}

function ShellLayout() {
  useAuthReloadBump()
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const shellScrollRef = useRef(null)
  const user = getAuthUser()

  useLayoutEffect(() => {
    const el = shellScrollRef.current
    if (el) el.scrollTop = 0
  }, [location.pathname, location.key])


  const nickname = user?.nickname?.trim() || user?.name?.trim() || '닉네임'
  const [aiWarn, setAiWarn] = useState(readAuthIncomplete)

  useEffect(() => {
    const sync = () => setAiWarn(readAuthIncomplete())
    const onDraft = (e) => {
      if (typeof e.detail?.incomplete === 'boolean') setAiWarn(e.detail.incomplete)
    }
    window.addEventListener('conquest-auth-changed', sync)
    window.addEventListener('conquest-ai-profile-draft', onDraft)
    return () => {
      window.removeEventListener('conquest-auth-changed', sync)
      window.removeEventListener('conquest-ai-profile-draft', onDraft)
    }
  }, [])

  useEffect(() => {
    setAiWarn(readAuthIncomplete())
  }, [location.pathname])

  if (!user) return <Navigate to="/" replace />

  const closeMenu = () => setMenuOpen(false)
  const go = (path) => {
    closeMenu()
    navigate(path)
  }

  const logout = () => {
    closeMenu()
    localStorage.removeItem(AUTH_KEY)
    clearAccessToken()
    notifyAuthChanged()
    navigate('/', { replace: true })
  }

  return (
    <AppFrame>
      <div className="relative flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
        <header className="shrink-0 border-b border-zinc-100 bg-white px-3 pb-2 pt-3">
          <button
            type="button"
            onClick={() => navigate('/main')}
            className="block text-left text-2xl font-extrabold tracking-tight text-[var(--brand-blue)] active:opacity-90"
          >
            ConQuest
          </button>
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setMenuOpen(true)}
            className="-ml-1 mt-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-start rounded-lg py-2 pl-1 pr-3 text-zinc-600 active:bg-zinc-100"
          >
            <span className="flex flex-col gap-[3px]" aria-hidden>
              <span className="block h-[2px] w-[14px] rounded-full bg-zinc-700" />
              <span className="block h-[2px] w-[14px] rounded-full bg-zinc-700" />
              <span className="block h-[2px] w-[14px] rounded-full bg-zinc-700" />
            </span>
          </button>
        </header>
        <div
          ref={shellScrollRef}
          className="shell-outlet-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-[76px]"
        >
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
        <BottomNavigation />
        <PersonalizedNotificationWidget />

        <div
          className={`absolute inset-0 z-[60] bg-zinc-900/40 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${
            menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-hidden={!menuOpen}
          onClick={closeMenu}
        />
        <aside
          className={`absolute left-0 top-0 z-[70] flex h-full w-[min(86vw,300px)] flex-col border-r border-zinc-200 bg-white shadow-[6px_0_32px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="border-b border-zinc-100 px-4 pb-3 pt-4">
            <p className="text-xs font-medium text-zinc-500">안녕하세요</p>
            <p className="mt-0.5 truncate text-lg font-bold text-zinc-900">{nickname}</p>
            <button
              type="button"
              onClick={() => {
                closeMenu()
                navigate('/profile/ai-basis', { state: aiWarn ? { emphasize: true } : {} })
              }}
              className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-blue)] px-3 py-2.5 text-sm font-semibold text-white shadow-sm active:brightness-95"
            >
              AI분석 기반정보 등록/수정
              {aiWarn ? (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
              ) : null}
            </button>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3">
            {[
              { to: '/main', label: '메인화면', Icon: IconNavHome },
              { to: '/contests', label: '공모전 목록', Icon: IconNavList },
              { to: '/calendar', label: '캘린더', Icon: IconNavCalendar },
              { to: '/community', label: '커뮤니티', Icon: IconNavChat },
              { to: '/conquest', label: 'ConQuest', Icon: IconNavBolt },
            ].map(({ to, label, Icon }) => (
              <button
                key={to}
                type="button"
                onClick={() => go(to)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-semibold text-zinc-800 transition-colors active:bg-zinc-100"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
                  <Icon />
                </span>
                <span className="min-w-0 flex-1">{label}</span>
              </button>
            ))}
          </nav>

          <div className="shrink-0 border-t border-zinc-100 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-700 active:bg-red-100"
            >
              로그아웃
            </button>
          </div>
        </aside>
      </div>
    </AppFrame>
  )
}

function App() {
  useKeyboardAware()
  useAuthReloadBump()

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-blue', BRAND_BLUE)
  }, [])

  const isAuthenticated = Boolean(getAuthUser())

  return (
    <BrowserRouter>
      <DevRouteShortcuts />
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/main" replace /> : <LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<ShellLayout />}>
          <Route path="/main" element={<MainPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/contests" element={<ContestPage />} />
          <Route path="/contests/:id" element={<ContestPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/community/post/:postId" element={<PostDetailPage />} />
          <Route path="/profile/ai-basis" element={<AIAnalysisPage />} />
          <Route path="/ai-recommend" element={<AIRecommendPage />} />
          <Route path="/conquest" element={<ConQuestPage />} />
          <Route path="/dummy/:slug" element={<DummyPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
