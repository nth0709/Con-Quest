/** 티어 메달 영역 — 메인 카드 등에서 이모지가 너무 작아 보이지 않게 래핑 */

const SIZE = {
  lg: 'h-[4.75rem] w-[4.75rem] min-h-[4.75rem] min-w-[4.75rem]',
  xl: 'h-[5.25rem] w-[5.25rem] min-h-[5.25rem] min-w-[5.25rem]',
}

const TEXT = {
  lg: 'text-[2rem] leading-none',
  xl: 'text-[2.35rem] leading-none',
}

export function TierMedal({ tier, size = 'lg', showLabel = true }) {
  if (!tier) return null
  return (
    <div
      className={`flex shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-white via-zinc-50/90 to-zinc-100 shadow-[inset_0_2px_0_rgba(255,255,255,0.9)] ring-2 ring-black/[0.05] ${SIZE[size]}`}
      style={{
        borderBottom: `3px solid ${tier.bar}`,
        boxShadow: `inset 0 2px 0 rgba(255,255,255,0.9), 0 6px 20px -6px ${tier.bar}55`,
      }}
      aria-hidden
    >
      <span className={`select-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.08)] ${TEXT[size]}`}>{tier.icon}</span>
      {showLabel ? (
        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">{tier.id}</span>
      ) : null}
    </div>
  )
}
