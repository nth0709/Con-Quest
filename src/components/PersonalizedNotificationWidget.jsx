import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../context/AppDataProvider'
import {
  aiRecommendContest,
  loadStoredNotifications,
  mergeNotifications,
  saveStoredNotifications,
} from '../utils/personalizedNotifications'

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem('authUser') ?? 'null')
  } catch {
    return null
  }
}

function BellIcon({ className = 'h-6 w-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M15 17H9m9-1v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  )
}

export default function PersonalizedNotificationWidget() {
  const navigate = useNavigate()
  const { contests } = useAppData()
  const [user, setUser] = useState(getAuthUser)
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(() => loadStoredNotifications(getAuthUser()?.id))

  useEffect(() => {
    const sync = () => setUser(getAuthUser())
    window.addEventListener('conquest-auth-changed', sync)
    return () => window.removeEventListener('conquest-auth-changed', sync)
  }, [])

  useEffect(() => {
    if (!user?.id) {
      setNotifications([])
      return
    }
    const existing = loadStoredNotifications(user.id)
    const generated = aiRecommendContest(user, contests)
    const next = mergeNotifications(existing, generated)
    saveStoredNotifications(user.id, next)
    setNotifications(next)
  }, [contests, user])

  const unreadCount = useMemo(() => notifications.filter((row) => !row.isRead).length, [notifications])

  const markAllRead = () => {
    if (!user?.id || unreadCount === 0) return
    const next = notifications.map((row) => ({ ...row, isRead: true }))
    saveStoredNotifications(user.id, next)
    setNotifications(next)
  }

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev
      if (next) window.setTimeout(markAllRead, 120)
      return next
    })
  }

  const openContest = (contestId) => {
    if (!user?.id) return
    const next = notifications.map((row) => (row.contestId === contestId ? { ...row, isRead: true } : row))
    saveStoredNotifications(user.id, next)
    setNotifications(next)
    setOpen(false)
    navigate(`/contests/${contestId}`)
  }

  if (!user) return null

  return (
    <div className="absolute bottom-[92px] left-4 z-50">
      {open ? (
        <section className="absolute bottom-[68px] left-0 w-[min(88vw,340px)] overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_18px_45px_rgba(30,64,175,0.18)]">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-500 px-4 py-3 text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold">AI 맞춤 알림</h2>
                <p className="mt-0.5 text-xs text-blue-50">마이페이지 정보를 바탕으로 찾았어요</p>
              </div>
              <span className="rounded-full bg-white/18 px-2.5 py-1 text-xs font-bold">
                {unreadCount > 0 ? `신규 ${unreadCount}개` : '확인 완료'}
              </span>
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto p-3">
            {notifications.length === 0 ? (
              <div className="rounded-2xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-600">
                아직 새로운 맞춤 공모전이 없어요.
              </div>
            ) : (
              <div className="space-y-2.5">
                {notifications.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openContest(item.contestId)}
                    className="w-full rounded-2xl border border-zinc-100 bg-white p-3 text-left shadow-sm active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold leading-5 text-zinc-900">AI가 회원님에게 맞는 새 공모전을 찾았어요!</p>
                      {!item.isRead ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" /> : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-700">{item.message}</p>
                    {item.deadline ? (
                      <p className="mt-1 text-xs font-semibold text-blue-600">마감일은 {item.deadline}입니다.</p>
                    ) : null}
                    {item.reasons?.length ? (
                      <p className="mt-2 rounded-xl bg-blue-50 px-2.5 py-2 text-xs leading-5 text-blue-800">
                        {item.reasons.slice(0, 2).join(' · ')}
                      </p>
                    ) : null}
                    <span className="mt-2 inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700">
                      공모전 상세보기
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={toggleOpen}
        className="relative grid h-14 w-14 place-items-center rounded-full border border-blue-100 bg-white text-blue-700 shadow-[0_10px_28px_rgba(30,64,175,0.2)] active:scale-95"
        aria-label="AI 맞춤 알림 열기"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-h-6 min-w-6 place-items-center rounded-full bg-red-500 px-1.5 text-xs font-extrabold text-white shadow">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>
    </div>
  )
}
