import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ALL_MAJORS, MAJOR_GROUPS } from './constants/majors'
import { ALL_CERTIFICATE_NAMES } from './constants/certificates'
import { LANGUAGE_CERT_CONFIG } from './constants/languageCertConfig'
import { INTEREST_CATEGORIES, JOB_FIELDS, SKILLS as TAG_SKILLS, TOOLS as TAG_TOOLS } from './constants/tagsDB'
import { useAppDialog } from './context/AppDialogProvider'
import { patchMe } from './api/auth'
import { hasApiBase } from './api/client'
import { notifyAuthChanged } from './utils/authNotify'
import { getAiProfileMissingLabels, isAiProfileIncomplete } from './utils/aiProfileCompleteness'

const AUTH_KEY = 'authUser'
const USERS_KEY = 'users'
const CAREER_YEARS = ['1~3년', '4~6년', '7~10년', '10년 이상']
const JOB_OPTIONS = ['대학생/대학원생', '취업준비생', '직장인/일반']

const TAG_INLINE_VISIBLE = 6
const TAG_INLINE_COLLAPSE_AFTER = 4

function normalizeSearchText(text) {
  return (text ?? '').toLowerCase().replace(/\s+/g, '')
}

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

const SIGNUP_MAJOR_OPTIONS = [...new Set(ALL_MAJORS)]

function buildMajorSynonymMapForSignup() {
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
const MAJOR_SYNONYMS_FOR_SEARCH = buildMajorSynonymMapForSignup()

/** 지역 선택 (앱 내부) */
const KOREA_REGION_TREE = [
  { group: '수도권', cities: ['서울', '경기', '인천'] },
  { group: '충청·강원', cities: ['대전', '세종', '충북', '충남', '강원'] },
  { group: '경상', cities: ['부산', '대구', '울산', '경북', '경남'] },
  { group: '전라·제주', cities: ['광주', '전북', '전남', '제주'] },
  { group: '기타', cities: ['무관', '원격'] },
]

function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null')
  } catch {
    return null
  }
}

function saveAuthUser(user) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
  notifyAuthChanged()
}

function saveUser(user) {
  const users = getUsers()
  const next = [...users.filter((u) => u.id !== user.id), user]
  localStorage.setItem(USERS_KEY, JSON.stringify(next))
  saveAuthUser(user)
}

function ymSerial(ym) {
  if (!ym || typeof ym.y !== 'number' || typeof ym.m !== 'number') return null
  return ym.y * 12 + ym.m
}

function formatYmDot(ym) {
  if (!ym || typeof ym.y !== 'number' || typeof ym.m !== 'number') return ''
  return `${ym.y}.${String(ym.m).padStart(2, '0')}`
}

function toYmKey(ym) {
  if (!ym || typeof ym.y !== 'number' || typeof ym.m !== 'number') return ''
  return `${ym.y}-${String(ym.m).padStart(2, '0')}`
}

function parseYmKey(s) {
  if (!s || typeof s !== 'string') return null
  const [a, b] = s.split('-')
  const y = Number(a)
  const m = Number(b)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  return { y, m }
}

/** 셸 세로 스크롤 안에서 블록을 뷰포트 세로 중앙에 두되, 끝에서 잘리지 않게 clamp */
function scrollElementToShellCenterClamped(el) {
  if (!el || !(el instanceof Element)) return
  const run = () => {
    let scrollParent = el.parentElement
    while (scrollParent && scrollParent !== document.body) {
      if (scrollParent.classList.contains('shell-outlet-scroll')) break
      const { overflowY } = getComputedStyle(scrollParent)
      const sh = scrollParent.scrollHeight
      const ch = scrollParent.clientHeight
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && sh > ch + 2) break
      scrollParent = scrollParent.parentElement
    }

    if (!scrollParent || scrollParent === document.body) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      return
    }

    const spRect = scrollParent.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const elTopInSp = elRect.top - spRect.top + scrollParent.scrollTop
    const elH = el.offsetHeight || elRect.height
    const viewH = scrollParent.clientHeight
    const idealTop = elTopInSp - viewH / 2 + elH / 2
    const maxScroll = Math.max(0, scrollParent.scrollHeight - viewH)
    scrollParent.scrollTo({ top: Math.max(0, Math.min(idealTop, maxScroll)), behavior: 'smooth' })
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(run)
  })
}

/** 태그가 많아 같은 블록 안에서 연속 탭 시에만 스크롤 안 함 · 블록이 바뀌면 스크롤 유지 */
const AI_TAG_SECTION_IDS = new Set(['tag-cats', 'tag-skills', 'tag-tools'])

/** 데스크톱에서도 앱 컬럼(max 412px) 안에만 시트가 보이도록 */
function AppSheetRoot({ open, onClose, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex justify-center">
      <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" aria-label="닫기" onClick={onClose} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 flex justify-center">
        <div className="pointer-events-none flex h-full w-full max-w-[412px] flex-col justify-end">
          <div className="pointer-events-auto w-full">{children}</div>
        </div>
      </div>
    </div>
  )
}

function SecondaryButton({ className = '', children, ...props }) {
  return (
    <button
      {...props}
      className={`min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base font-semibold text-zinc-700 active:bg-zinc-100 ${className}`}
    >
      {children}
    </button>
  )
}

function ChipGroup({ label, options, selected, onToggle, boxed = true }) {
  const inner = (
    <>
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
    </>
  )
  if (!boxed) return <div className="space-y-0">{inner}</div>
  return <section className="rounded-2xl border border-zinc-200 bg-white p-3">{inner}</section>
}

function SearchableSelect({ label, options, value, onChange, placeholder, synonyms, onConfirm, footer, onItemChosen }) {
  const normalize = (text) => (text ?? '').toLowerCase().replace(/\s+/g, '')
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
    <section className="rounded-2xl border border-zinc-200 bg-white p-3">
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
        className="min-h-11 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px] font-medium leading-snug tracking-tight text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-[var(--brand-blue)]"
      />
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {candidates.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                if (onItemChosen) onItemChosen(item)
                else {
                  onChange(item)
                  onConfirm?.(item)
                }
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

function NumberStepper({ value, onChange, min = 0, max = 999 }) {
  const n = Math.floor(Number(value))
  const v = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
  return (
    <div className="relative flex min-h-11 w-full items-stretch rounded-xl border border-zinc-200 bg-white">
      <input
        type="number"
        min={min}
        max={max}
        value={v}
        onChange={(e) => {
          const x = Math.floor(Number(e.target.value))
          if (!Number.isFinite(x)) onChange(String(min))
          else onChange(String(Math.min(max, Math.max(min, x))))
        }}
        className="min-h-11 w-full min-w-0 flex-1 border-0 bg-transparent pl-3 pr-12 text-sm font-semibold text-zinc-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 flex-col gap-0.5 pr-1">
        <button
          type="button"
          aria-label="증가"
          disabled={v >= max}
          onClick={() => onChange(String(Math.min(max, v + 1)))}
          className="flex h-5 w-7 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-[10px] font-bold text-zinc-600 disabled:opacity-30"
        >
          ▲
        </button>
        <button
          type="button"
          aria-label="감소"
          disabled={v <= min}
          onClick={() => onChange(String(Math.max(min, v - 1)))}
          className="flex h-5 w-7 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-[10px] font-bold text-zinc-600 disabled:opacity-30"
        >
          ▼
        </button>
      </div>
    </div>
  )
}

function RegionPickerModal({ open, selectedCities, onClose, onSave }) {
  const [local, setLocal] = useState([])

  useEffect(() => {
    if (open) setLocal([...(selectedCities ?? [])])
  }, [open, selectedCities])

  const toggleCity = (c) => {
    setLocal((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  if (!open) return null

  return (
    <AppSheetRoot open={open} onClose={onClose}>
      <div className="flex max-h-[min(88dvh,560px)] flex-col rounded-t-2xl border border-b-0 border-zinc-200 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-3 py-3">
          <p className="text-sm font-bold text-zinc-900">활동 가능 지역</p>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 active:bg-zinc-100">
            닫기
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-2 pb-2">
          {KOREA_REGION_TREE.map(({ group, cities }) => (
            <div key={group} className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">{group}</p>
              <div className="flex flex-wrap gap-2">
                {cities.map((c) => {
                  const on = local.includes(c)
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCity(c)}
                      className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${
                        on ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-200 text-zinc-700'
                      }`}
                    >
                      {c}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-zinc-100 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              onSave(local)
              onClose()
            }}
            className="min-h-12 w-full rounded-xl bg-[var(--brand-blue)] text-sm font-bold text-white active:brightness-95"
          >
            선택 완료
          </button>
        </div>
      </div>
    </AppSheetRoot>
  )
}

function CertFinderModal({ open, query, takenNames, onClose, onPick }) {
  const [q, setQ] = useState('')

  useEffect(() => {
    if (open) setQ(query ?? '')
  }, [open, query])

  const filtered = useMemo(() => {
    const t = normalizeSearchText(q)
    let list = ALL_CERTIFICATE_NAMES.filter((n) => !takenNames.has(n))
    if (t) list = list.filter((n) => normalizeSearchText(n).includes(t))
    return list.slice(0, 80)
  }, [q, takenNames])

  if (!open) return null

  return (
    <AppSheetRoot open={open} onClose={onClose}>
      <div className="flex max-h-[min(88dvh,640px)] flex-col rounded-t-2xl border border-b-0 border-zinc-200 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-3 py-3">
          <p className="text-sm font-bold text-zinc-900">자격증 찾기</p>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 active:bg-zinc-100">
            닫기
          </button>
        </div>
        <div className="shrink-0 px-3 pb-2 pt-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="자격증 이름 검색"
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
              className="mb-2 flex min-h-12 w-full items-center rounded-xl border border-zinc-200 px-4 text-left text-sm font-semibold text-zinc-800 active:bg-[var(--brand-blue)]/10"
            >
              {name}
            </button>
          ))}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">검색 결과가 없습니다.</p>}
        </div>
      </div>
    </AppSheetRoot>
  )
}

/** 계열 → 중분류 → 학과 */
function MajorFinderModal({ open, onClose, onPick }) {
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
    <AppSheetRoot open={open} onClose={onClose}>
      <div className="flex max-h-[min(88dvh,640px)] shrink-0 flex-col rounded-t-2xl border border-b-0 border-zinc-200 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-2 py-3">
          {group ? (
            <button type="button" onClick={goBack} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-zinc-700 active:bg-zinc-100">
              뒤로
            </button>
          ) : (
            <span className="w-[52px]" aria-hidden />
          )}
          <p className="flex-1 text-center text-sm font-semibold text-zinc-800">{title}</p>
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-zinc-500 active:bg-zinc-100">
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
                className="mb-2 flex min-h-12 w-full items-center rounded-xl border border-zinc-200 px-4 text-left text-sm font-semibold text-zinc-800 active:bg-zinc-50"
              >
                {g.name}
              </button>
            ))}
          {group &&
            !sub &&
            group.subcategories.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSub(s)}
                className="mb-2 flex min-h-12 w-full items-center rounded-xl border border-zinc-200 px-4 text-left text-sm font-semibold text-zinc-800 active:bg-zinc-50"
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
                className="mb-2 flex min-h-12 w-full items-center rounded-xl border border-zinc-200 px-4 text-left text-sm font-semibold text-zinc-800 active:bg-[var(--brand-blue)]/10"
              >
                {m}
              </button>
            ))}
        </div>
      </div>
    </AppSheetRoot>
  )
}

function JobFinderModal({ open, title, onClose, onPick }) {
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
    <AppSheetRoot open={open} onClose={onClose}>
      <div className="flex max-h-[min(88dvh,640px)] shrink-0 flex-col rounded-t-2xl border border-b-0 border-zinc-200 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-2 py-3">
          <span className="w-[52px]" aria-hidden />
          <p className="flex-1 text-center text-sm font-semibold text-zinc-800">{title}</p>
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-zinc-500 active:bg-zinc-100">
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
              className="mb-2 flex min-h-12 w-full items-center rounded-xl border border-zinc-200 px-4 text-left text-sm font-semibold text-zinc-800 active:bg-[var(--brand-blue)]/10"
            >
              {name}
            </button>
          ))}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">검색 결과가 없습니다.</p>}
        </div>
      </div>
    </AppSheetRoot>
  )
}

function YearMonthModal({ open, which, title, initial, onClose, onConfirm }) {
  const [y, setY] = useState(2024)
  const [m, setM] = useState(1)

  useEffect(() => {
    if (open) {
      if (initial?.y && initial?.m) {
        setY(initial.y)
        setM(initial.m)
      } else {
        setY(new Date().getFullYear())
        setM(1)
      }
    }
  }, [open, initial])

  if (!open) return null

  const years = []
  for (let yy = 1990; yy <= 2035; yy++) years.push(yy)

  return (
    <AppSheetRoot open={open} onClose={onClose}>
      <div className="shrink-0 rounded-t-2xl border border-b-0 border-zinc-200 bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-zinc-900">{title}</p>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-zinc-500 active:bg-zinc-100">
            닫기
          </button>
        </div>
        <div>
          <p className="text-xs font-semibold text-zinc-600">연도</p>
          <div className="mt-1.5 max-h-32 overflow-y-auto overscroll-y-contain rounded-xl border border-zinc-100 bg-zinc-50/80 p-2">
            <div className="flex flex-wrap gap-1.5">
              {years.map((yy) => (
                <button
                  key={yy}
                  type="button"
                  onClick={() => setY(yy)}
                  className={`min-h-9 min-w-[3.25rem] rounded-lg border px-2 text-xs font-bold ${
                    y === yy ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-200 bg-white text-zinc-700'
                  }`}
                >
                  {yy}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <p className="text-xs font-semibold text-zinc-600">월</p>
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => (
              <button
                key={mm}
                type="button"
                onClick={() => setM(mm)}
                className={`min-h-10 rounded-xl border text-sm font-bold ${
                  m === mm ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-200 bg-white text-zinc-800'
                }`}
              >
                {mm}월
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onConfirm(which, { y, m })
            onClose()
          }}
          className="mt-4 min-h-12 w-full rounded-xl bg-[var(--brand-blue)] text-sm font-bold text-white active:brightness-95"
        >
          확인
        </button>
      </div>
    </AppSheetRoot>
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
    <AppSheetRoot open={open} onClose={onClose}>
      <div className="flex max-h-[min(90dvh,680px)] shrink-0 flex-col rounded-t-2xl border border-b-0 border-zinc-200 bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 px-2 py-3">
          <span className="w-[52px]" aria-hidden />
          <p className="flex-1 text-center text-sm font-semibold text-zinc-800">{title}</p>
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-zinc-500 active:bg-zinc-100">
            닫기
          </button>
        </div>
        <div className="shrink-0 px-3 pb-2 pt-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색"
            className="min-h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[var(--brand-blue)]"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-2 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap gap-2">
            {filtered.map((item) => {
              const on = selected.includes(item)
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onToggle(item)}
                  className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${
                    on ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-200 text-zinc-700'
                  }`}
                >
                  {item}
                </button>
              )
            })}
          </div>
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">검색 결과가 없습니다.</p>}
        </div>
      </div>
    </AppSheetRoot>
  )
}

function TagPickerWithMore({ label, options, selected, onToggle, onOpenMore, allowNone = false }) {
  const collapseInline = selected.length >= TAG_INLINE_COLLAPSE_AFTER

  const selectedOrdered = useMemo(() => {
    const hasReal = selected.some((s) => s !== '없음' && options.includes(s))
    const basis = hasReal ? selected.filter((s) => s !== '없음') : selected
    const optIdx = (name) => (name === '없음' ? -1 : options.indexOf(name))
    const valid = basis.filter((s) => s === '없음' || options.includes(s))
    return [...valid].sort((a, b) => {
      if (allowNone && a === '없음') return -1
      if (allowNone && b === '없음') return 1
      return optIdx(a) - optIdx(b)
    })
  }, [allowNone, options, selected])

  const suggestionChips = useMemo(() => {
    if (collapseInline) return []
    const out = []
    const hasReal = selected.some((s) => s !== '없음' && options.includes(s))
    const unsel = options.filter((o) => !selected.includes(o))
    /** 선택에 '없음'이 이미 있으면 다시 미선택 칩으로 넣지 않음 */
    if (allowNone && !hasReal && !selected.includes('없음') && selected.filter((s) => s !== '없음').length === 0)
      out.push('없음')
    for (const o of unsel) {
      if (out.length >= TAG_INLINE_VISIBLE) break
      out.push(o)
    }
    return out
  }, [allowNone, collapseInline, options, selected])

  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50/40 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-700">{label}</p>
        <button type="button" onClick={onOpenMore} className="shrink-0 text-sm font-semibold text-[var(--brand-blue)] active:opacity-80">
          + 더보기
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedOrdered.map((item) => (
          <button
            key={`s-${item}`}
            type="button"
            onClick={() => onToggle(item)}
            className="min-h-9 max-w-full rounded-full border border-[var(--brand-blue)] bg-[var(--brand-blue)] px-3 py-1.5 text-left text-xs font-semibold leading-snug text-white active:scale-[0.98]"
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
              className="min-h-9 max-w-full rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-left text-xs font-semibold leading-snug text-zinc-700 active:bg-zinc-50"
            >
              {item}
            </button>
          ))}
      </div>
      {collapseInline && <p className="mt-1.5 text-[11px] text-zinc-500">더보기를 눌러 추가 선택해 주세요.</p>}
    </section>
  )
}

function ToggleYesNo({ value, onChange, labels = ['있음', '없음'] }) {
  return (
    <div className="flex gap-2">
      {[
        { v: '있음', label: labels[0] },
        { v: '없음', label: labels[1] },
      ].map(({ v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`min-h-11 flex-1 rounded-xl border text-sm font-bold ${
            value === v ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-200 bg-white text-zinc-600'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default function AIAnalysisPage() {
  const raw = getAuthUser()
  const location = useLocation()
  const emphasize = Boolean(location.state?.emphasize)
  const { showAlert } = useAppDialog()
  const topBannerRef = useRef(null)
  const pageRootRef = useRef(null)
  const studentSchoolRevealRef = useRef(null)
  const gradMajorRevealRef = useRef(null)
  const contestExtraRevealRef = useRef(null)
  const certExpandRef = useRef(null)
  const internExpandRef = useRef(null)
  const prevStudentStepDone = useRef(null)
  const prevUniversityGraduated = useRef(null)
  const prevPastContestParticipation = useRef(null)
  const prevHasCert = useRef(null)
  const prevHasIntern = useRef(null)
  /** hydration 직후 첫 이펙트 배치에서 state가 아직 늦게 오면 ref를 ''로 덮어 자동 스크롤이 오동작함 → state가 ref와 일치할 때까지 스킵 */
  const skipRevealScrollAfterHydrationPastRef = useRef(false)
  const skipRevealScrollAfterHydrationCertRef = useRef(false)
  const skipRevealScrollAfterHydrationInternRef = useRef(false)
  const skipRevealScrollAfterHydrationStudentRef = useRef(false)
  const skipRevealScrollAfterHydrationGradRef = useRef(false)
  /** 관심 카테고리 / 보유 스킬 / 활용 툴: 같은 섹션 안에서만 탭 연속 클릭 시 스크롤 생략, 섹션 바뀌면 스크롤 */
  const lastAiSectionInteractRef = useRef(null)

  useLayoutEffect(() => {
    const shell = typeof document !== 'undefined' ? document.querySelector('.shell-outlet-scroll') : null
    const prevSb = shell instanceof HTMLElement ? shell.style.scrollBehavior : ''
    const scrollShellTop = () => {
      if (shell instanceof HTMLElement) {
        shell.style.scrollBehavior = 'auto'
        shell.scrollTop = 0
      }
    }
    scrollShellTop()
    requestAnimationFrame(() => {
      scrollShellTop()
      requestAnimationFrame(scrollShellTop)
    })
    return () => {
      if (shell instanceof HTMLElement) shell.style.scrollBehavior = prevSb
    }
  }, [location.key, location.pathname])

  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [job, setJob] = useState('')
  const [major, setMajor] = useState('')
  const [minor, setMinor] = useState('')
  const [grade, setGrade] = useState('')
  const [studentStatus, setStudentStatus] = useState('')
  const [desiredRole, setDesiredRole] = useState('')
  const [currentRole, setCurrentRole] = useState('')
  const [careerYear, setCareerYear] = useState('')
  const [universityGraduated, setUniversityGraduated] = useState('')

  const [categories, setCategories] = useState([])
  const [skills, setSkills] = useState([])
  const [tools, setTools] = useState([])

  const [activityRegionCities, setActivityRegionCities] = useState([])
  const [activityPreferenceForm, setActivityPreferenceForm] = useState('')
  const [pastContestParticipation, setPastContestParticipation] = useState('')
  const [contestAwardCount, setContestAwardCount] = useState('0')
  const [mainActivityJobFields, setMainActivityJobFields] = useState([])
  const [mainActivitySearch, setMainActivitySearch] = useState('')

  const [hasCert, setHasCert] = useState('')
  const [certifications, setCertifications] = useState([])
  const [showCertForm, setShowCertForm] = useState(false)
  const [certSearch, setCertSearch] = useState('')
  const [certScore, setCertScore] = useState('')
  const [certGrade, setCertGrade] = useState('')

  const [hasIntern, setHasIntern] = useState('')
  const [internships, setInternships] = useState([])
  const [showInternForm, setShowInternForm] = useState(false)
  const [internJobSearch, setInternJobSearch] = useState('')
  const [internStartYm, setInternStartYm] = useState(null)
  const [internEndYm, setInternEndYm] = useState(null)

  const [majorFinder, setMajorFinder] = useState(null)
  const [jobFinder, setJobFinder] = useState(null)
  const [tagSheet, setTagSheet] = useState(null)
  const [ymPicker, setYmPicker] = useState(null)
  const [regionPickerOpen, setRegionPickerOpen] = useState(false)
  const [certFinderOpen, setCertFinderOpen] = useState(false)

  const studentStep1Done = job === '대학생/대학원생' && major.trim().length > 0 && minor.trim().length > 0

  const toggleMulti = (value, setter) =>
    setter((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]))

  const toggleTagsNoneAware = (value, setter) => {
    setter((prev) => {
      if (value === '없음') {
        return prev.includes('없음') ? [] : ['없음']
      }
      const withoutNone = prev.filter((x) => x !== '없음')
      return withoutNone.includes(value) ? withoutNone.filter((x) => x !== value) : [...withoutNone, value]
    })
  }

  const resetCertDraft = useCallback(() => {
    setCertSearch('')
    setCertScore('')
    setCertGrade('')
  }, [])

  const resetInternDraft = useCallback(() => {
    setInternJobSearch('')
    setInternStartYm(null)
    setInternEndYm(null)
  }, [])

  useEffect(() => {
    if (!raw) return
    setName(raw.name ?? '')
    setNickname(raw.nickname ?? '')
    setJob(raw.job ?? '')
    setMajor(raw.major ?? '')
    setMinor(raw.minor ?? '')
    setGrade(raw.grade ?? '')
    setStudentStatus(raw.studentStatus ?? '')
    setDesiredRole(raw.desiredRole ?? '')
    setCurrentRole(raw.currentRole ?? '')
    setCareerYear(raw.careerYear ?? '')
    setUniversityGraduated(raw.universityGraduated ?? '')

    const cats = Array.isArray(raw.categories) ? raw.categories.filter((c) => INTEREST_CATEGORIES.includes(c)) : []
    setCategories(cats)
    setSkills(Array.isArray(raw.skills) ? raw.skills : [])
    setTools(Array.isArray(raw.tools) ? raw.tools : [])

    const ar = String(raw.activityRegions ?? '').trim()
    setActivityRegionCities(ar ? ar.split(/[·,]/).map((s) => s.trim()).filter(Boolean) : [])
    setActivityPreferenceForm(raw.activityPreferenceForm ?? '')
    const loadedPastParticipation =
      raw.pastContestParticipation === 'yes' || raw.pastContestParticipation === 'no'
        ? raw.pastContestParticipation
        : String(raw.pastContestHistory ?? '').trim()
          ? 'yes'
          : ''
    setPastContestParticipation(loadedPastParticipation)
    setContestAwardCount(
      raw.contestAwardCount !== undefined && raw.contestAwardCount !== null ? String(raw.contestAwardCount) : '0',
    )
    setMainActivityJobFields(Array.isArray(raw.mainActivityJobFields) ? raw.mainActivityJobFields : [])
    setMainActivitySearch('')

    const hc = raw.hasCert === '있음' || raw.hasCert === '없음' ? raw.hasCert : ''
    const hi = raw.hasIntern === '있음' || raw.hasIntern === '없음' ? raw.hasIntern : ''
    setHasCert(hc)
    setHasIntern(hi)

    const certs = Array.isArray(raw.certifications) ? raw.certifications : []
    setCertifications(certs)
    setShowCertForm(hc === '있음' && certs.length === 0)

    const ints = Array.isArray(raw.internships) ? raw.internships : []
    setInternships(ints)
    setShowInternForm(hi === '있음' && ints.length === 0)

    resetCertDraft()
    resetInternDraft()

    /** 서버/로컬에서 불러온 값이 ''→'yes' 전환으로 오인되지 않게, 자동 센터 스크롤용 ref를 즉시 동기화 */
    prevPastContestParticipation.current = loadedPastParticipation
    prevHasCert.current = hc
    prevHasIntern.current = hi
    const jobLoaded = raw.job ?? ''
    const majorLoaded = (raw.major ?? '').trim()
    const minorLoaded = (raw.minor ?? '').trim()
    prevStudentStepDone.current = jobLoaded === '대학생/대학원생' && majorLoaded.length > 0 && minorLoaded.length > 0
    prevUniversityGraduated.current = raw.universityGraduated ?? ''
    skipRevealScrollAfterHydrationPastRef.current = true
    skipRevealScrollAfterHydrationCertRef.current = true
    skipRevealScrollAfterHydrationInternRef.current = true
    skipRevealScrollAfterHydrationStudentRef.current = true
    skipRevealScrollAfterHydrationGradRef.current = true
  }, [raw?.id, resetCertDraft, resetInternDraft])

  const mergedForCheck = useMemo(() => {
    const base = getAuthUser() ?? raw
    if (!base) return null
    const nAward = Number(contestAwardCount)
    return {
      ...base,
      name: name.trim(),
      nickname: nickname.trim(),
      job: job.trim(),
      major: major.trim(),
      minor: minor.trim(),
      grade: grade.trim(),
      studentStatus: studentStatus.trim(),
      desiredRole: desiredRole.trim(),
      currentRole: currentRole.trim(),
      careerYear,
      universityGraduated,
      categories,
      skills,
      tools,
      activityRegions: activityRegionCities.join(' · '),
      activityPreferenceForm,
      pastContestParticipation,
      contestAwardCount: Number.isFinite(nAward) ? nAward : contestAwardCount,
      mainActivityJobFields,
      hasCert,
      hasIntern,
      certifications,
      internships,
    }
  }, [
    raw?.id,
    name,
    nickname,
    job,
    major,
    minor,
    grade,
    studentStatus,
    desiredRole,
    currentRole,
    careerYear,
    universityGraduated,
    categories,
    skills,
    tools,
    activityRegionCities,
    activityPreferenceForm,
    pastContestParticipation,
    contestAwardCount,
    mainActivityJobFields,
    hasCert,
    hasIntern,
    certifications,
    internships,
  ])

  const incomplete = mergedForCheck ? isAiProfileIncomplete(mergedForCheck) : true

  useEffect(() => {
    if (!mergedForCheck) return
    const inc = isAiProfileIncomplete(mergedForCheck)
    window.dispatchEvent(new CustomEvent('conquest-ai-profile-draft', { detail: { incomplete: inc } }))
  }, [mergedForCheck])

  useEffect(() => {
    if (!emphasize) return
    const t = window.setTimeout(() => {
      topBannerRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' })
    }, 120)
    return () => window.clearTimeout(t)
  }, [emphasize])

  useEffect(() => {
    if (hasCert === '있음' && certifications.length === 0) setShowCertForm(true)
  }, [hasCert, certifications.length])

  useEffect(() => {
    if (hasIntern === '있음' && internships.length === 0) setShowInternForm(true)
  }, [hasIntern, internships.length])

  useEffect(() => {
    if (job !== '대학생/대학원생') {
      if (!skipRevealScrollAfterHydrationStudentRef.current) {
        prevStudentStepDone.current = studentStep1Done
      }
      return
    }
    if (skipRevealScrollAfterHydrationStudentRef.current) {
      if (studentStep1Done === prevStudentStepDone.current) {
        skipRevealScrollAfterHydrationStudentRef.current = false
      }
      return
    }
    const prev = prevStudentStepDone.current
    prevStudentStepDone.current = studentStep1Done
    if (prev === null) return
    if (studentStep1Done && !prev) {
      const t = window.setTimeout(() => scrollElementToShellCenterClamped(studentSchoolRevealRef.current), 120)
      return () => window.clearTimeout(t)
    }
  }, [job, studentStep1Done])

  useEffect(() => {
    if (job !== '취업준비생' && job !== '직장인/일반') {
      if (!skipRevealScrollAfterHydrationGradRef.current) {
        prevUniversityGraduated.current = universityGraduated
      }
      return
    }
    if (skipRevealScrollAfterHydrationGradRef.current) {
      if (universityGraduated === prevUniversityGraduated.current) {
        skipRevealScrollAfterHydrationGradRef.current = false
      }
      return
    }
    const prev = prevUniversityGraduated.current
    prevUniversityGraduated.current = universityGraduated
    if (prev === null) return
    if (universityGraduated === 'yes' && prev !== 'yes') {
      const t = window.setTimeout(() => scrollElementToShellCenterClamped(gradMajorRevealRef.current), 130)
      return () => window.clearTimeout(t)
    }
  }, [job, universityGraduated])

  useEffect(() => {
    if (skipRevealScrollAfterHydrationPastRef.current) {
      if (pastContestParticipation === prevPastContestParticipation.current) {
        skipRevealScrollAfterHydrationPastRef.current = false
      }
      return
    }
    const prev = prevPastContestParticipation.current
    prevPastContestParticipation.current = pastContestParticipation
    if (prev === null) return
    if (pastContestParticipation === 'yes' && prev !== 'yes') {
      const t = window.setTimeout(() => scrollElementToShellCenterClamped(contestExtraRevealRef.current), 150)
      return () => window.clearTimeout(t)
    }
  }, [pastContestParticipation])

  useEffect(() => {
    if (skipRevealScrollAfterHydrationCertRef.current) {
      if (hasCert === prevHasCert.current) {
        skipRevealScrollAfterHydrationCertRef.current = false
      }
      return
    }
    const prev = prevHasCert.current
    prevHasCert.current = hasCert
    if (prev === null) return
    if (hasCert === '있음' && prev !== '있음') {
      const t = window.setTimeout(() => scrollElementToShellCenterClamped(certExpandRef.current), 120)
      return () => window.clearTimeout(t)
    }
  }, [hasCert])

  useEffect(() => {
    if (skipRevealScrollAfterHydrationInternRef.current) {
      if (hasIntern === prevHasIntern.current) {
        skipRevealScrollAfterHydrationInternRef.current = false
      }
      return
    }
    const prev = prevHasIntern.current
    prevHasIntern.current = hasIntern
    if (prev === null) return
    if (hasIntern === '있음' && prev !== '있음') {
      const t = window.setTimeout(() => scrollElementToShellCenterClamped(internExpandRef.current), 120)
      return () => window.clearTimeout(t)
    }
  }, [hasIntern])

  const resolvedCertName = useMemo(() => {
    const t = certSearch.trim()
    if (!t || !ALL_CERTIFICATE_NAMES.includes(t)) return null
    return t
  }, [certSearch])

  const certCfg = resolvedCertName ? LANGUAGE_CERT_CONFIG[resolvedCertName] : null

  const filteredCerts = useMemo(() => {
    const q = normalizeSearchText(certSearch)
    const taken = new Set(certifications.map((c) => c.name))
    let list = ALL_CERTIFICATE_NAMES.filter((n) => !taken.has(n))
    if (q) list = list.filter((n) => normalizeSearchText(n).includes(q))
    return list.slice(0, 40)
  }, [certSearch, certifications])

  const filteredInternJobs = useMemo(() => {
    const q = normalizeSearchText(internJobSearch)
    if (!q) return JOB_FIELD_NAMES.slice(0, 30)
    return JOB_FIELD_NAMES.filter((name) => {
      const nk = normalizeSearchText(name)
      if (nk.includes(q)) return true
      const syns = JOB_FIELD_SYNONYMS[nk] ?? []
      return syns.some((w) => normalizeSearchText(w).includes(q))
    }).slice(0, 40)
  }, [internJobSearch])

  const takenCertNames = useMemo(() => new Set(certifications.map((c) => c.name)), [certifications])

  const registerCert = async () => {
    const pick = certSearch.trim()
    if (!pick || !ALL_CERTIFICATE_NAMES.includes(pick)) {
      await showAlert({ message: '자격증을 검색·선택해 주세요.' })
      return
    }
    if (certifications.some((c) => c.name === pick)) {
      await showAlert({ message: '이미 등록된 자격증입니다.' })
      return
    }
    const cfg = LANGUAGE_CERT_CONFIG[pick]
    let entry = { name: pick }
    if (cfg?.type === 'score') {
      const n = Number(certScore)
      if (!Number.isFinite(n) || n < cfg.min || n > cfg.max) {
        await showAlert({ message: `점수는 ${cfg.min}~${cfg.max} 범위로 입력해 주세요.` })
        return
      }
      entry = { name: pick, score: n }
    } else if (cfg?.type === 'grade') {
      if (!certGrade || !cfg.options.includes(certGrade)) {
        await showAlert({ message: '등급을 선택해 주세요.' })
        return
      }
      entry = { name: pick, grade: certGrade }
    }
    setCertifications((prev) => [...prev, entry])
    setShowCertForm(false)
    resetCertDraft()
  }

  const registerIntern = async () => {
    if (!internJobSearch.trim()) {
      await showAlert({ message: '직무 분야를 선택해 주세요.' })
      return
    }
    if (!internStartYm || !internEndYm) {
      await showAlert({ message: '시작·종료 연·월을 모두 선택해 주세요.' })
      return
    }
    const a = ymSerial(internStartYm)
    const b = ymSerial(internEndYm)
    if (a == null || b == null || b < a) {
      await showAlert({ message: '종료 연·월은 시작 이후여야 합니다.' })
      return
    }
    setInternships((prev) => [
      ...prev,
      { jobRole: internJobSearch.trim(), startYm: toYmKey(internStartYm), endYm: toYmKey(internEndYm) },
    ])
    setShowInternForm(false)
    resetInternDraft()
  }

  const registerMainActivity = async (pickOverride) => {
    const pick = String(pickOverride ?? mainActivitySearch).trim()
    if (!pick || !JOB_FIELD_NAMES.includes(pick)) {
      await showAlert({ message: '목록에서 직무를 검색·선택해 주세요.' })
      return
    }
    if (mainActivityJobFields.includes(pick)) {
      await showAlert({ message: '이미 등록된 활동 분야입니다.' })
      return
    }
    setMainActivityJobFields((prev) => [...prev, pick])
    setMainActivitySearch('')
  }

  const save = async () => {
    const base = getAuthUser() ?? raw
    if (!base?.id) {
      await showAlert({ message: '로그인 정보를 확인해 주세요.' })
      return
    }
    const nAward = Math.max(0, Math.floor(Number(contestAwardCount) || 0))
    const next = {
      ...base,
      name: name.trim(),
      nickname: nickname.trim(),
      job: job.trim(),
      major: major.trim(),
      minor: minor.trim(),
      grade: grade.trim(),
      studentStatus: studentStatus.trim(),
      desiredRole: desiredRole.trim(),
      currentRole: currentRole.trim(),
      careerYear,
      universityGraduated,
      categories,
      skills,
      tools,
      activityRegions: activityRegionCities.join(' · '),
      activityPreferenceForm,
      pastContestParticipation,
      contestAwardCount: nAward,
      mainActivityJobFields,
      hasCert,
      hasIntern,
      certifications,
      internships,
      certNote: undefined,
      internNote: undefined,
      pastContestHistory: undefined,
    }
    const missing = getAiProfileMissingLabels(next)
    if (missing.length > 0) {
      await showAlert({
        title: '입력이 필요합니다',
        message: `다음 항목을 확인해 주세요.\n\n${missing.map((x) => `· ${x}`).join('\n')}`,
      })
      return
    }

    if (hasApiBase()) {
      try {
        const saved = await patchMe({
          name: next.name,
          major: next.major,
          interests: next.categories.join(', '),
          skills: next.skills.join(', '),
          certificates: next.certifications.map((item) => item.name).filter(Boolean).join(', '),
          awards: String(next.contestAwardCount ?? ''),
          preferred_fields: next.mainActivityJobFields.join(', '),
          desired_career: next.desiredRole || next.currentRole,
        })
        saveUser({ ...saved, ...next, points: saved.points })
        await showAlert({ message: '저장되었습니다.' })
        window.dispatchEvent(new CustomEvent('conquest-ai-profile-draft', { detail: { incomplete: isAiProfileIncomplete(next) } }))
        return
      } catch (error) {
        console.warn('Failed to sync AI profile to backend, keeping local fallback.', error)
      }
    }

    saveUser(next)
    await showAlert({ message: '저장되었습니다.' })
    window.dispatchEvent(new CustomEvent('conquest-ai-profile-draft', { detail: { incomplete: isAiProfileIncomplete(next) } }))
  }

  /** 클릭한 요소가 속한 섹션 카드(data-ai-section)를 셸 뷰 세로 중앙에 맞춤(연속 입력 흐름). */
  useEffect(() => {
    const root = pageRootRef.current
    if (!root) return
    const onClick = (e) => {
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest('[data-no-ai-section-scroll]')) return
      const sec = t.closest('[data-ai-section]')
      if (!sec || !root.contains(sec)) return
      const secName = sec.getAttribute('data-ai-section')
      if (!secName) return

      if (AI_TAG_SECTION_IDS.has(secName)) {
        const prevSec = lastAiSectionInteractRef.current
        lastAiSectionInteractRef.current = secName
        if (prevSec === secName) return
      } else {
        lastAiSectionInteractRef.current = secName
      }

      window.setTimeout(() => scrollElementToShellCenterClamped(sec), 0)
    }
    root.addEventListener('click', onClick, false)
    return () => root.removeEventListener('click', onClick, false)
  }, [raw?.id])

  if (!raw) return <Navigate to="/" replace />

  const showWarnBanner = incomplete

  return (
    <div
      ref={pageRootRef}
      className="relative mx-auto flex min-h-0 w-full max-w-[412px] flex-1 flex-col bg-zinc-50 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))]"
    >
      <div className="px-4 pt-4">
        {showWarnBanner ? (
          <div
            ref={topBannerRef}
            className="mb-4 rounded-2xl border border-[var(--brand-blue)]/30 bg-[var(--brand-blue)]/10 px-4 py-3 text-center text-sm font-bold text-[var(--brand-blue)]"
          >
            AI 맞춤 분석을 위해 사용자님의 상세 정보를 입력해주세요
          </div>
        ) : null}

        <h1 className="text-lg font-bold text-zinc-900">AI 분석 기반정보</h1>
        <p className="mt-1 text-xs text-zinc-500">회원가입 시 입력한 정보를 확인·수정하고, 추가 항목을 입력해 주세요.</p>

        <section data-ai-section="identity" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <label className="block text-sm font-semibold text-zinc-700">
            아이디
            <input className="mt-1 min-h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-zinc-600" value={raw.id} readOnly />
          </label>
          <label className="block text-sm font-semibold text-zinc-700">
            이름
            <input
              className="mt-1 min-h-11 w-full rounded-xl border border-zinc-200 px-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-700">
            닉네임
            <input
              className="mt-1 min-h-11 w-full rounded-xl border border-zinc-200 px-3"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          <div>
            <p className="text-sm font-semibold text-zinc-700">직업 유형</p>
            <div className="mt-2 space-y-2">
              {JOB_OPTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setJob(item)}
                  className={`min-h-11 w-full rounded-xl border px-4 text-sm font-semibold ${
                    job === item ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-200 text-zinc-800'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>

        {job === '대학생/대학원생' && (
          <section data-ai-section="stu-major" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
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
                    setJobFinder(null)
                    setTagSheet(null)
                    setMajorFinder('major')
                  }}
                >
                  전공 찾기
                </SecondaryButton>
              }
            />
          </section>
        )}

        {job === '대학생/대학원생' && (
          <section data-ai-section="stu-minor" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
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
                    setJobFinder(null)
                    setTagSheet(null)
                    setMajorFinder('minor')
                  }}
                >
                  부전공 찾기
                </SecondaryButton>
              }
            />
            <SecondaryButton type="button" onClick={() => setMinor('부전공 없음')} className="text-zinc-900">
              부전공 없음
            </SecondaryButton>
          </section>
        )}

        {job === '대학생/대학원생' && studentStep1Done ? (
          <section
            ref={studentSchoolRevealRef}
            data-ai-section="stu-grade"
            className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4"
          >
            <ChipGroup
              boxed={false}
              label="학년"
              options={['1학년', '2학년', '3학년', '4학년+']}
              selected={grade ? [grade] : []}
              onToggle={(value) => setGrade(value)}
            />
          </section>
        ) : null}

        {job === '대학생/대학원생' && studentStep1Done ? (
          <section data-ai-section="stu-status" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
            <ChipGroup
              boxed={false}
              label="재학 상태"
              options={['재학', '휴학', '복학 예정', '졸업 예정']}
              selected={studentStatus ? [studentStatus] : []}
              onToggle={(value) => setStudentStatus(value)}
            />
          </section>
        ) : null}

        {job === '취업준비생' && (
          <section data-ai-section="jsk-role" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
            <SearchableSelect
              label="희망 직무 분야"
              options={JOB_FIELD_NAMES}
              value={desiredRole}
              onChange={setDesiredRole}
              placeholder="직무명·키워드로 검색해 주세요"
              synonyms={JOB_FIELD_SYNONYMS}
              footer={
                <SecondaryButton
                  type="button"
                  onClick={() => {
                    setMajorFinder(null)
                    setTagSheet(null)
                    setJobFinder('desired')
                  }}
                >
                  희망 직무 분야 찾기
                </SecondaryButton>
              }
            />
          </section>
        )}

        {job === '직장인/일반' ? (
          <>
            <section data-ai-section="wrk-role" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
              <SearchableSelect
                label="현재 종사 직무"
                options={JOB_FIELD_NAMES}
                value={currentRole}
                onChange={setCurrentRole}
                placeholder="직무명·키워드로 검색해 주세요"
                synonyms={JOB_FIELD_SYNONYMS}
                footer={
                  <SecondaryButton
                    type="button"
                    onClick={() => {
                      setMajorFinder(null)
                      setTagSheet(null)
                      setJobFinder('current')
                    }}
                  >
                    현재 종사 직무 찾기
                  </SecondaryButton>
                }
              />
            </section>
            <section data-ai-section="wrk-years" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
              <ChipGroup label="현재 연차" options={CAREER_YEARS} selected={careerYear ? [careerYear] : []} onToggle={(value) => setCareerYear(value)} />
            </section>
          </>
        ) : null}

        {(job === '취업준비생' || job === '직장인/일반') && (
          <section data-ai-section="grad-q" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold text-zinc-800">대학교를 졸업하셨나요?</p>
            <div className="flex gap-2">
              {[
                { v: 'yes', label: '졸업(했음)' },
                { v: 'no', label: '아니오' },
              ].map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setUniversityGraduated(v)
                    if (v === 'no') {
                      setMajor('')
                      setMinor('')
                    }
                  }}
                  className={`min-h-11 flex-1 rounded-xl border text-sm font-bold ${
                    universityGraduated === v ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-200 bg-white text-zinc-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        {(job === '취업준비생' || job === '직장인/일반') && universityGraduated === 'yes' ? (
          <section ref={gradMajorRevealRef} data-ai-section="grad-major" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
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
                    setJobFinder(null)
                    setTagSheet(null)
                    setMajorFinder('major')
                  }}
                >
                  전공 찾기
                </SecondaryButton>
              }
            />
          </section>
        ) : null}

        {(job === '취업준비생' || job === '직장인/일반') && universityGraduated === 'yes' ? (
          <section data-ai-section="grad-minor" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
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
                    setJobFinder(null)
                    setTagSheet(null)
                    setMajorFinder('minor')
                  }}
                >
                  부전공 찾기
                </SecondaryButton>
              }
            />
            <SecondaryButton type="button" onClick={() => setMinor('부전공 없음')} className="text-zinc-900">
              부전공 없음
            </SecondaryButton>
          </section>
        ) : null}

        <section data-ai-section="tag-cats" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <TagPickerWithMore
            label="관심 카테고리"
            options={INTEREST_CATEGORIES}
            selected={categories}
            onToggle={(v) => {
              setCategories((prev) => {
                const adding = !prev.includes(v)
                const next = adding ? [...prev, v] : prev.filter((x) => x !== v)
                return next
              })
            }}
            onOpenMore={() => setTagSheet('categories')}
          />
        </section>

        <section data-ai-section="tag-skills" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <TagPickerWithMore
            label="보유 스킬"
            options={TAG_SKILLS}
            selected={skills}
            allowNone
            onToggle={(v) => {
              toggleTagsNoneAware(v, setSkills)
            }}
            onOpenMore={() => setTagSheet('skills')}
          />
        </section>

        <section data-ai-section="tag-tools" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <TagPickerWithMore
            label="활용 툴"
            options={TAG_TOOLS}
            selected={tools}
            allowNone
            onToggle={(v) => {
              toggleTagsNoneAware(v, setTools)
            }}
            onOpenMore={() => setTagSheet('tools')}
          />
        </section>

        <section data-ai-section="regions" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-800">활동 가능 지역</p>
            <p className="mt-1 text-xs text-zinc-500">지역을 탭해 복수 선택할 수 있어요.</p>
            <button
              type="button"
              onClick={() => setRegionPickerOpen(true)}
              className="mt-2 min-h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 text-left text-sm font-semibold text-zinc-800 active:bg-zinc-100"
            >
              {activityRegionCities.length ? activityRegionCities.join(' · ') : '지역 선택하기'}
            </button>
          </div>
        </section>

        <section data-ai-section="activity-pref" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-800">선호하는 활동 형태</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { v: 'individual', label: '개인 참여 선호' },
                { v: 'team', label: '팀 참여 선호' },
                { v: 'both', label: '무관 / 둘 다' },
              ].map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setActivityPreferenceForm(v)}
                  className={`min-h-10 rounded-full border px-3 text-xs font-bold ${
                    activityPreferenceForm === v ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-200 text-zinc-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section data-ai-section="contest-q" className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <div>
            <p className="text-sm font-semibold text-zinc-800">과거 수상·참가 이력</p>
            <div className="mt-2">
              <ToggleYesNo
                value={pastContestParticipation === 'yes' ? '있음' : pastContestParticipation === 'no' ? '없음' : ''}
                onChange={(v) => {
                  const next = v === '있음' ? 'yes' : 'no'
                  setPastContestParticipation(next)
                  if (next === 'no') {
                    setContestAwardCount('0')
                    setMainActivityJobFields([])
                    setMainActivitySearch('')
                  }
                }}
              />
            </div>
          </div>
        </section>

        {pastContestParticipation === 'yes' ? (
          <section ref={contestExtraRevealRef} data-ai-section="contest-extra" className="mt-4 space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-zinc-700">
                공모전 수상 횟수 (회)
                <div className="mt-1">
                  <NumberStepper value={contestAwardCount} onChange={setContestAwardCount} min={0} max={999} />
                </div>
              </label>
              <div className="space-y-3 rounded-xl border border-zinc-100 p-3">
                <p className="text-sm font-bold text-zinc-800">공모전 활동 분야</p>
                <SearchableSelect
                  label="직무 검색"
                  options={JOB_FIELD_NAMES}
                  value={mainActivitySearch}
                  onChange={setMainActivitySearch}
                  onConfirm={(v) => void registerMainActivity(v)}
                  placeholder="직무명·키워드로 검색해 주세요"
                  synonyms={JOB_FIELD_SYNONYMS}
                  footer={
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        setMajorFinder(null)
                        setTagSheet(null)
                        setJobFinder('mainActivity')
                      }}
                    >
                      활동분야찾기
                    </SecondaryButton>
                  }
                />
                <button
                  type="button"
                  onClick={() => void registerMainActivity()}
                  className="min-h-11 w-full rounded-xl bg-[var(--brand-blue)] text-sm font-bold text-white active:brightness-95"
                >
                  등록
                </button>
                {mainActivityJobFields.length > 0 ? (
                  <div className="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
                    <p className="text-xs font-bold text-zinc-600">등록된 활동 분야</p>
                    {mainActivityJobFields.map((j) => (
                      <div key={j} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                        <p className="text-sm font-bold text-zinc-900">{j}</p>
                        <button
                          type="button"
                          className="shrink-0 text-sm font-bold text-red-600"
                          onClick={() => setMainActivityJobFields((prev) => prev.filter((x) => x !== j))}
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        <section data-ai-section="cert-q" className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-800">보유 자격증이 있나요?</p>
          <div className="mt-2">
            <ToggleYesNo
              value={hasCert}
              onChange={(v) => {
                setHasCert(v)
                if (v === '없음') {
                  setCertifications([])
                  setShowCertForm(false)
                  resetCertDraft()
                } else {
                  setShowCertForm(certifications.length === 0)
                }
              }}
            />
          </div>
        </section>

        {hasCert === '있음' || certifications.length > 0 ? (
          <section ref={certExpandRef} data-ai-section="cert-body" className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="space-y-4">
          {certifications.length > 0 && (
            <div className="mt-4 space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
              <p className="text-xs font-bold text-zinc-600">등록된 자격증</p>
              {certifications.map((c, idx) => (
                <div key={`${c.name}-${idx}`} className="flex items-start justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-zinc-900">{c.name}</p>
                    {typeof c.score === 'number' && <p className="text-xs text-zinc-600">점수 {c.score}</p>}
                    {c.grade && <p className="text-xs text-zinc-600">등급 {c.grade}</p>}
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-sm font-bold text-red-600"
                    onClick={() => setCertifications((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}

          {hasCert === '있음' && showCertForm && (
            <div className="mt-4 space-y-3 rounded-xl border border-zinc-100 p-3">
              <p className="text-sm font-bold text-zinc-800">새 자격증 입력</p>
              <input
                className="min-h-11 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px] font-medium leading-snug tracking-tight text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-[var(--brand-blue)]"
                value={certSearch}
                onChange={(e) => setCertSearch(e.target.value)}
                placeholder="자격증 이름 검색"
              />
              <SecondaryButton type="button" onClick={() => setCertFinderOpen(true)}>
                자격증 찾기
              </SecondaryButton>
              {certSearch.trim() && !ALL_CERTIFICATE_NAMES.includes(certSearch.trim()) ? (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-zinc-100">
                  {filteredCerts.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="flex w-full border-b border-zinc-50 px-3 py-2.5 text-left text-sm font-medium text-zinc-800 last:border-0 active:bg-zinc-50"
                      onClick={() => {
                        setCertSearch(n)
                        setCertScore('')
                        setCertGrade('')
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  {filteredCerts.length === 0 && <p className="px-3 py-4 text-center text-xs text-zinc-500">결과 없음</p>}
                </div>
              ) : null}
              {resolvedCertName && (
                <div className="rounded-xl border border-[var(--brand-blue)]/20 bg-[var(--brand-blue)]/5 p-3">
                  <div className="mb-2 flex justify-end">
                    <button
                      type="button"
                      className="text-sm font-semibold text-red-600 active:opacity-80"
                      onClick={() => {
                        setCertSearch('')
                        setCertScore('')
                        setCertGrade('')
                      }}
                    >
                      선택 해제
                    </button>
                  </div>
                  {certCfg?.type === 'score' && (
                    <label className="mt-2 block text-xs font-semibold text-zinc-600">
                      점수
                      <input
                        type="number"
                        min={certCfg.min}
                        max={certCfg.max}
                        placeholder={certCfg.placeholder}
                        className="mt-1 min-h-11 w-full rounded-xl border border-zinc-200 px-3"
                        value={certScore}
                        onChange={(e) => setCertScore(e.target.value)}
                      />
                    </label>
                  )}
                  {certCfg?.type === 'grade' && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-zinc-600">등급 선택</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {certCfg.options.map((o) => (
                          <button
                            key={o}
                            type="button"
                            onClick={() => setCertGrade(o)}
                            className={`min-h-11 rounded-full border px-3 text-sm font-bold ${
                              certGrade === o ? 'border-[var(--brand-blue)] bg-[var(--brand-blue)] text-white' : 'border-zinc-200 bg-white text-zinc-800'
                            }`}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={registerCert} className="mt-3 min-h-11 w-full rounded-xl bg-[var(--brand-blue)] text-sm font-bold text-white active:brightness-95">
                    등록
                  </button>
                </div>
              )}
            </div>
          )}

          {hasCert === '있음' && !showCertForm && (
            <button
              type="button"
              onClick={() => {
                setShowCertForm(true)
                resetCertDraft()
              }}
              className="mt-4 min-h-11 w-full rounded-xl border border-[var(--brand-blue)]/40 bg-[var(--brand-blue)]/10 text-sm font-bold text-[var(--brand-blue)] active:bg-[var(--brand-blue)]/15"
            >
              추가 등록하기
            </button>
          )}
          </div>
        </section>
        ) : null}

        <section data-ai-section="intern-q" className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-sm font-semibold text-zinc-800">인턴 경험이 있나요?</p>
          <div className="mt-2">
            <ToggleYesNo
              value={hasIntern}
              onChange={(v) => {
                setHasIntern(v)
                if (v === '없음') {
                  setInternships([])
                  setShowInternForm(false)
                  resetInternDraft()
                } else {
                  setShowInternForm(internships.length === 0)
                }
              }}
            />
          </div>
        </section>

        {hasIntern === '있음' || internships.length > 0 ? (
          <section ref={internExpandRef} data-ai-section="intern-body" className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="space-y-4">
          {internships.length > 0 && (
            <div className="mt-4 space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
              <p className="text-xs font-bold text-zinc-600">등록된 인턴 경험</p>
              {internships.map((row, idx) => (
                <div key={`${row.jobRole}-${row.startYm}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-900">{row.jobRole}</p>
                    <p className="text-xs text-zinc-600">
                      {formatYmDot(parseYmKey(row.startYm))} ~ {formatYmDot(parseYmKey(row.endYm))}
                    </p>
                  </div>
                  <button type="button" className="shrink-0 text-sm font-bold text-red-600" onClick={() => setInternships((prev) => prev.filter((_, i) => i !== idx))}>
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}

          {hasIntern === '있음' && showInternForm && (
            <div className="mt-4 space-y-3 rounded-xl border border-zinc-100 p-3">
              <p className="text-sm font-bold text-zinc-800">새 인턴 경험 입력</p>
              <label className="block text-xs font-semibold text-zinc-600">
                직무 분야
                <input
                  className="mt-1 min-h-11 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-[15px] font-medium leading-snug tracking-tight text-zinc-800 outline-none placeholder:text-zinc-400 focus:border-[var(--brand-blue)]"
                  value={internJobSearch}
                  onChange={(e) => setInternJobSearch(e.target.value)}
                  placeholder="직무명·키워드로 검색 후 선택"
                />
              </label>
              {internJobSearch.trim() && !JOB_FIELD_NAMES.includes(internJobSearch.trim()) ? (
                <div className="max-h-36 overflow-y-auto rounded-xl border border-zinc-100">
                  {filteredInternJobs.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="flex w-full border-b border-zinc-50 px-3 py-2 text-left text-sm active:bg-zinc-50"
                      onClick={() => {
                        setInternJobSearch(n)
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ) : null}
              <button type="button" onClick={() => setJobFinder('intern')} className="min-h-11 w-full rounded-xl border border-zinc-200 text-sm font-bold text-zinc-800 active:bg-zinc-50">
                직무분야 찾기
              </button>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs font-semibold text-zinc-600">시작 연·월</p>
                  <button
                    type="button"
                    onClick={() => setYmPicker('start')}
                    className="flex min-h-12 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-900"
                  >
                    {internStartYm ? formatYmDot(internStartYm) : ''}
                  </button>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-zinc-600">종료 연·월</p>
                  <button
                    type="button"
                    onClick={() => setYmPicker('end')}
                    className="flex min-h-12 w-full items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-900"
                  >
                    {internEndYm ? formatYmDot(internEndYm) : ''}
                  </button>
                </div>
              </div>
              <button type="button" onClick={registerIntern} className="min-h-11 w-full rounded-xl bg-[var(--brand-blue)] text-sm font-bold text-white active:brightness-95">
                등록
              </button>
            </div>
          )}

          {hasIntern === '있음' && !showInternForm && (
            <button
              type="button"
              onClick={() => {
                setShowInternForm(true)
                resetInternDraft()
              }}
              className="mt-4 min-h-11 w-full rounded-xl border border-[var(--brand-blue)]/40 bg-[var(--brand-blue)]/10 text-sm font-bold text-[var(--brand-blue)]"
            >
              추가 등록하기
            </button>
          )}
          </div>
        </section>
        ) : null}

        <div className="h-6" aria-hidden />
      </div>

      <div className="sticky bottom-0 z-20 border-t border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur" data-no-ai-section-scroll>
        <button type="button" onClick={() => void save()} className="min-h-12 w-full rounded-2xl bg-[var(--brand-blue)] text-base font-bold text-white active:brightness-95">
          저장하기
        </button>
      </div>

      <MajorFinderModal
        open={Boolean(majorFinder)}
        onClose={() => setMajorFinder(null)}
        onPick={(picked) => {
          if (majorFinder === 'major') setMajor(picked)
          if (majorFinder === 'minor') setMinor(picked)
        }}
      />

      <JobFinderModal
        open={Boolean(jobFinder)}
        title={
          jobFinder === 'desired'
            ? '희망 직무 분야'
            : jobFinder === 'current'
              ? '현재 종사 직무'
              : jobFinder === 'mainActivity'
                ? '공모전 활동 분야'
                : '인턴 직무 분야'
        }
        onClose={() => setJobFinder(null)}
        onPick={(picked) => {
          if (jobFinder === 'desired') setDesiredRole(picked)
          if (jobFinder === 'current') setCurrentRole(picked)
          if (jobFinder === 'intern') {
            setInternJobSearch(picked)
          }
          if (jobFinder === 'mainActivity') {
            setMainActivitySearch(picked)
          }
        }}
      />

      <YearMonthModal
        open={ymPicker === 'start' || ymPicker === 'end'}
        which={ymPicker}
        title={ymPicker === 'end' ? '종료 연·월' : '시작 연·월'}
        initial={ymPicker === 'end' ? internEndYm : internStartYm}
        onClose={() => setYmPicker(null)}
        onConfirm={(which, ym) => {
          if (which === 'start') setInternStartYm(ym)
          if (which === 'end') setInternEndYm(ym)
        }}
      />

      <RegionPickerModal
        open={regionPickerOpen}
        selectedCities={activityRegionCities}
        onClose={() => setRegionPickerOpen(false)}
        onSave={(c) => setActivityRegionCities(c)}
      />

      <CertFinderModal
        open={certFinderOpen}
        query={certSearch}
        takenNames={takenCertNames}
        onClose={() => setCertFinderOpen(false)}
        onPick={(name) => {
          setCertSearch(name)
          setCertScore('')
          setCertGrade('')
        }}
      />

      <TagMultiPickSheet
        open={tagSheet === 'categories'}
        title="관심 카테고리"
        options={INTEREST_CATEGORIES}
        selected={categories}
        onToggle={(v) => toggleMulti(v, setCategories)}
        onClose={() => setTagSheet(null)}
      />
      <TagMultiPickSheet
        open={tagSheet === 'skills'}
        title="보유 스킬"
        options={['없음', ...TAG_SKILLS]}
        selected={skills}
        onToggle={(v) => toggleTagsNoneAware(v, setSkills)}
        onClose={() => setTagSheet(null)}
      />
      <TagMultiPickSheet
        open={tagSheet === 'tools'}
        title="활용 툴"
        options={['없음', ...TAG_TOOLS]}
        selected={tools}
        onToggle={(v) => toggleTagsNoneAware(v, setTools)}
        onClose={() => setTagSheet(null)}
      />
    </div>
  )
}
