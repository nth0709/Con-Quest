import { Link, useParams } from 'react-router-dom'

const titles = {
  mypage: '마이페이지',
  tier: '티어',
  conquest: 'ConQuest',
}

export default function DummyPage() {
  const { slug } = useParams()
  const title = titles[slug] ?? '페이지'

  return (
    <div className="flex min-h-[50vh] flex-col bg-white px-4 pb-8 pt-4">
      <h1 className="text-lg font-bold text-zinc-900">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">준비 중입니다.</p>
      <Link to="/main" className="mt-auto text-sm font-semibold text-[var(--brand-blue)]">
        메인으로
      </Link>
    </div>
  )
}
