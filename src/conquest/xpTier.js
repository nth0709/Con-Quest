/** 계정별 총 XP (한 기기에서 아이디마다 분리) */
const XP_BY_USER_KEY = 'conquest_total_xp_by_user_v1'
/** 과거 버전 호환용(한 번만 계정별로 흡수 후 제거) */
const LEGACY_XP_SINGLE = 'conquest_total_xp'

export const TIERS = [
  { id: 'BRONZE', label: '브론즈', minXp: 0, icon: '🥉', bar: '#9a3412' },
  { id: 'SILVER', label: '실버', minXp: 500, icon: '🥈', bar: '#64748b' },
  { id: 'GOLD', label: '골드', minXp: 1500, icon: '🥇', bar: '#b45309' },
  { id: 'PLATINUM', label: '플래티넘', minXp: 3500, icon: '💎', bar: '#0284c7' },
]

function readXpBag() {
  try {
    const bag = JSON.parse(localStorage.getItem(XP_BY_USER_KEY) ?? '{}')
    return bag && typeof bag === 'object' ? bag : {}
  } catch {
    return {}
  }
}

function writeXpBag(bag) {
  localStorage.setItem(XP_BY_USER_KEY, JSON.stringify(bag))
}

/** @param {unknown} userId 로그인 아이디(문자열 권장) */
export function loadTotalXp(userId, fallback = 0) {
  if (userId === undefined || userId === null || String(userId).trim() === '') return fallback

  try {
    const uid = String(userId)
    let bag = readXpBag()
    let v = bag[uid]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v)

    /** 구형 단일 키가 있으면 지금 접속한 계정에만 이관 후 삭제 */
    const legacyRaw = localStorage.getItem(LEGACY_XP_SINGLE)
    if (legacyRaw != null && legacyRaw !== '') {
      const legacy = Number(legacyRaw)
      localStorage.removeItem(LEGACY_XP_SINGLE)
      if (Number.isFinite(legacy) && legacy >= 0) {
        bag = { ...bag, [uid]: Math.floor(legacy) }
        writeXpBag(bag)
      }
    }

    v = readXpBag()[uid]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v)
    return fallback
  } catch {
    return fallback
  }
}

/** @param {unknown} userId */
export function saveTotalXp(userId, n) {
  if (userId === undefined || userId === null || String(userId).trim() === '') return

  const uid = String(userId)
  const v = Math.max(0, Math.floor(n))
  const bag = readXpBag()
  bag[uid] = v
  writeXpBag(bag)
  window.dispatchEvent(new CustomEvent('conquest-xp-changed', { detail: { userId: uid, totalXp: v } }))
}

/** @returns {{ tier: object, next: object|null, segPct: number, needForNext: number }} */
export function tierProgress(totalXp) {
  const xp = Math.max(0, totalXp)
  let tier = TIERS[0]
  let next = TIERS[1]
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (xp >= TIERS[i].minXp) {
      tier = TIERS[i]
      next = TIERS[i + 1] ?? null
      break
    }
  }
  if (!next) {
    return { tier, next: null, segPct: 100, needForNext: 0 }
  }
  const span = next.minXp - tier.minXp
  const seg = Math.min(1, (xp - tier.minXp) / span)
  return {
    tier,
    next,
    segPct: seg * 100,
    needForNext: Math.max(0, next.minXp - xp),
  }
}
