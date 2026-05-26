import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAppData } from './context/AppDataProvider'
import { useMemo, useEffect } from 'react'

const AUTH_KEY = 'authUser'

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null')
  } catch {
    return null
  }
}

function isAiContest(c) {
  return c.tags.some((t) => /인공지능|AI|머신|딥러닝/i.test(t) || t.toLowerCase() === 'ai')
}

export default function AIRecommendContests() {
  const user = getAuthUser()
  const navigate = useNavigate()
  const { contests } = useAppData()

  const list = useMemo(() => contests.filter(isAiContest), [contests])

  useEffect(() => {
    if (user && list && list.length > 0) {
      const firstContest = list[0];
      
      // 0.1초 뒤에 이벤트를 발생시켜 신호 유실을 방지합니다.
      const timerId = setTimeout(() => {
        console.log("📢 추천 페이지에서 알림 무전 발송 시도!");
        const event = new CustomEvent("NEW_AI_RECOMMENDATION", {
          detail: {
            title: "✦ AI 맞춤 추천 공모전 업데이트!",
            contestTitle: firstContest.title
          }
        });
        window.dispatchEvent(event);
      }, 100);

      return () => clearTimeout(timerId);
    }
  }, [list, user]);

  if (!user) return <Navigate to="/" replace />

  return (
    <div className="flex h-auto min-h-[100dvh] flex-col bg-zinc-50 pb-8">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3">
        <button type="button" onClick={() => navigate(-1)} className="text-sm font-semibold text-zinc-600">
          ← 뒤로
        </button>
        <h1 className="mt-2 text-lg font-bold text-zinc-900">AI 맞춤 추천 공모전</h1>
      </header>

      <div className="space-y-3 px-3 pt-4">
        {list.map((c) => (
          <div key={c.id} className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            <Link to={`/contests/${c.id}`} className="shrink-0">
              <img src={c.poster} alt="" className="h-20 w-20 rounded-lg object-cover" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link to={`/contests/${c.id}`} className="font-bold text-zinc-900">
                {c.title}
              </Link>
              <p className="mt-1 text-xs text-zinc-500">{c.organizer}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
