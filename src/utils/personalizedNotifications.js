const NOTIFICATION_KEY = 'conquest_ai_notifications_v1'

function asText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' ')
  return String(value ?? '')
}

function tokenize(value) {
  return asText(value)
    .toLowerCase()
    .match(/[0-9a-z가-힣+#.]{2,}/g) ?? []
}

function uniqueTerms(values) {
  return [...new Set(values.flatMap((value) => tokenize(value)))]
}

function daysUntil(deadline) {
  if (!deadline) return null
  const target = new Date(`${deadline}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86400000)
}

export function buildNotificationProfile(user) {
  if (!user) return null
  return {
    interests: [user.interests, ...(user.categories ?? [])].filter(Boolean).join(' '),
    skills: [user.skills, ...(user.tools ?? [])].filter(Boolean).join(' '),
    competencies: [user.preferred_fields, user.preferredFields, user.certificates, user.awards].filter(Boolean).join(' '),
    preferredTypes: [user.desired_career, user.desiredCareer, user.desiredRole, user.major].filter(Boolean).join(' '),
  }
}

export function matchContestToUser(profile, contest) {
  if (!profile || !contest) return { score: 0, matchedTerms: [], reasons: [] }

  const interestTerms = uniqueTerms([profile.interests, profile.preferredTypes])
  const skillTerms = uniqueTerms([profile.skills, profile.competencies])
  const contestText = [
    contest.title,
    contest.organizer,
    contest.category,
    contest.description,
    contest.summary,
    contest.sourceSite,
    contest.source_site,
    contest.required_skills,
    ...(contest.tags ?? []),
  ].join(' ')
  const contestTokens = new Set(tokenize(contestText))
  const matchedInterests = interestTerms.filter((term) => contestTokens.has(term) || contestText.toLowerCase().includes(term))
  const matchedSkills = skillTerms.filter((term) => contestTokens.has(term) || contestText.toLowerCase().includes(term))

  let score = matchedInterests.length * 18 + matchedSkills.length * 22
  const reasons = []

  if (matchedInterests.length > 0) reasons.push(`관심 분야 일치: ${matchedInterests.slice(0, 3).join(', ')}`)
  if (matchedSkills.length > 0) reasons.push(`기술/역량 일치: ${matchedSkills.slice(0, 3).join(', ')}`)

  const remainingDays = daysUntil(contest.endDate || contest.deadline || contest.end_date)
  if (remainingDays !== null) {
    if (remainingDays >= 7 && remainingDays <= 90) {
      score += 10
      reasons.push('지원 준비 기간이 적당해요')
    } else if (remainingDays >= 0 && remainingDays < 7) {
      score += 3
      reasons.push('마감이 임박했어요')
    } else if (remainingDays < 0) {
      score -= 20
    }
  }

  const matchedTerms = [...new Set([...matchedInterests, ...matchedSkills])]
  return { score, matchedTerms, reasons }
}

export function generatePersonalizedNotification(user, contest, match) {
  const userId = user?.id ?? 'guest'
  const deadline = contest.endDate || contest.deadline || contest.end_date || ''
  return {
    id: `${userId}-${contest.id}`,
    contestId: Number(contest.id),
    title: 'AI 맞춤 알림',
    message: `AI가 회원님에게 맞는 새 공모전을 찾았어요! ${contest.title}이 관심 분야와 잘 맞아요.`,
    deadline,
    score: match.score,
    reasons: match.reasons,
    isRead: false,
    createdAt: new Date().toISOString(),
  }
}

export function aiRecommendContest(user, contests, { threshold = 24, limit = 8 } = {}) {
  const profile = buildNotificationProfile(user)
  if (!profile) return []

  return (contests ?? [])
    .map((contest) => ({ contest, match: matchContestToUser(profile, contest) }))
    .filter(({ match }) => match.score >= threshold)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit)
    .map(({ contest, match }) => generatePersonalizedNotification(user, contest, match))
}

export function notificationStorageKey(userId) {
  return `${NOTIFICATION_KEY}:${userId ?? 'guest'}`
}

export function loadStoredNotifications(userId) {
  try {
    const rows = JSON.parse(localStorage.getItem(notificationStorageKey(userId)) ?? '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

export function saveStoredNotifications(userId, rows) {
  localStorage.setItem(notificationStorageKey(userId), JSON.stringify(rows))
}

export function mergeNotifications(existing, generated) {
  const map = new Map()
  for (const row of existing ?? []) map.set(row.id, row)
  for (const row of generated ?? []) {
    const prev = map.get(row.id)
    map.set(row.id, prev ? { ...row, isRead: prev.isRead, createdAt: prev.createdAt } : row)
  }
  return [...map.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}
