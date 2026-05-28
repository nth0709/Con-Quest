import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { fetchRecommendations } from './api/recommendations'
import { useAppData } from './context/AppDataProvider'

const AUTH_KEY = 'authUser'

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null')
  } catch {
    return null
  }
}

function tokens(text) {
  return String(text ?? '')
    .toLowerCase()
    .match(/[0-9a-z가-힣+#.]{2,}/gi) ?? []
}

function buildProfile(user) {
  return {
    name: user?.name ?? '',
    interests: [user?.interests, ...(user?.categories ?? [])].filter(Boolean).join(', '),
    major: user?.major ?? '',
    skills: [user?.skills, ...(user?.tools ?? [])].filter(Boolean).join(', '),
    certificates: user?.certificates ?? '',
    awards: user?.awards ?? '',
    desired_career: user?.desired_career ?? user?.desiredCareer ?? user?.desiredRole ?? '',
    preferred_fields: user?.preferred_fields ?? user?.preferredFields ?? '',
  }
}

function localRecommend(user, contests) {
  const profileTerms = new Set(tokens(Object.values(buildProfile(user)).join(' ')))
  const hasProfile = profileTerms.size > 0

  return contests
    .map((contest) => {
      const contestText = [
        contest.title,
        contest.organizer,
        contest.category,
        contest.sourceSite,
        contest.summary,
        contest.description,
        ...(contest.tags ?? []),
      ].join(' ')
      const contestTerms = new Set(tokens(contestText))
      const matched = [...profileTerms].filter((term) => contestTerms.has(term))
      const aiBonus = /ai|인공지능|데이터|소프트웨어|it|앱|웹|기획/i.test(contestText) ? 8 : 0
      const score = (hasProfile ? matched.length * 18 : 4) + aiBonus

      return {
        contest,
        score,
        reason:
          matched.length > 0
            ? `마이페이지 정보와 겹치는 키워드가 있어요: ${matched.slice(0, 5).join(', ')}`
            : '직접 일치 키워드는 적지만 탐색 후보로 볼 만한 공모전입니다.',
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

export default function AIRecommendContests() {
  const user = getAuthUser()
  const navigate = useNavigate()
  const { contests } = useAppData()
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setFailed(false)
      try {
        const rows = await fetchRecommendations(buildProfile(user))
        if (!cancelled) setRecommendations(rows)
      } catch {
        if (!cancelled) {
          setFailed(true)
          setRecommendations([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const localRows = useMemo(() => localRecommend(user, contests), [contests, user])
  const rows = recommendations.length > 0 ? recommendations : localRows

  if (!user) return <Navigate to="/" replace />

  return (
    <div className="flex h-auto min-h-[100dvh] flex-col bg-zinc-50 pb-8">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="text-sm font-semibold text-zinc-600">
          ← 뒤로가기
        </button>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">AI 맞춤 추천 공모전</h1>
        <p className="mt-1 text-xs text-zinc-500">
          {loading
            ? '마이페이지 정보를 바탕으로 추천을 계산하는 중입니다.'
            : failed
              ? '백엔드 연결이 불안정해 앱 내부 로컬 AI 추천으로 보여드립니다.'
              : '마이페이지 정보와 공모전 내용을 분석해 어울리는 순서로 보여드립니다.'}
        </p>
      </header>

      <div className="space-y-3 px-3 pt-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
            추천할 공모전 데이터를 불러오지 못했습니다. 공모전 목록을 먼저 열어 데이터를 확인해 주세요.
          </div>
        ) : (
          rows.map((item) => {
            const c = item.contest
            return (
              <div key={c.id} className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="flex gap-3">
                  <Link to={`/contests/${c.id}`} className="shrink-0">
                    <img src={c.poster} alt="" className="h-20 w-20 rounded-lg object-cover" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to={`/contests/${c.id}`} className="line-clamp-2 font-bold text-zinc-900">
                      {c.title}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">{c.organizer}</p>
                    <p className="mt-1 text-xs font-semibold text-[var(--brand-blue)]">{c.sourceSite}</p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2">
                  <p className="text-xs font-bold text-blue-700">추천 점수 {item.score}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-700">{item.reason}</p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

