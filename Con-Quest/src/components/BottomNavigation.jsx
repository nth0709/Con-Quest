import { useLocation, useNavigate } from 'react-router-dom'

const items = [
  { label: '홈', path: '/main', icon: '⌂' },
  { label: '공모전', path: '/contests', icon: '▤' },
  { label: '추천', path: '/ai-recommend', icon: '✦' },
  { label: '캘린더', path: '/calendar', icon: '◫' },
  { label: '마이', path: '/profile/ai-basis', icon: '◌' },
]

function isActive(pathname, path) {
  if (path === '/contests') return pathname === '/contests' || pathname.startsWith('/contests/')
  return pathname === path
}

export default function BottomNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <nav className="absolute bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <div className="grid grid-cols-5 gap-1">
        {items.map((item) => {
          const active = isActive(location.pathname, item.path)
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex min-h-[56px] flex-col items-center justify-center rounded-2xl text-xs font-semibold transition active:scale-[0.98] ${
                active ? 'bg-[var(--brand-blue)]/10 text-[var(--brand-blue)]' : 'text-zinc-500'
              }`}
            >
              <span className="text-base" aria-hidden>
                {item.icon}
              </span>
              <span className="mt-1">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
