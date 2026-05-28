import contestsJson from './contests.json'

const FALLBACK_POSTER =
  'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80'

function firstText(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || ''
}

function normalizeTags(row, sourceSite, category) {
  if (Array.isArray(row.tags) && row.tags.length > 0) return row.tags
  const tags = [sourceSite, category].filter(Boolean)
  return tags.length > 0 ? tags : ['기타']
}

export function normalizeContest(row, index = 0) {
  const deadline = firstText(row.deadline, row.endDate, row.createdAt, '2099-12-31')
  const startDate = firstText(row.startDate, row.createdAt, deadline)
  const organizer = firstText(row.organizer, '주최사 정보 미상')
  const sourceSite = firstText(row.sourceSite, row.source_site, '기타')
  const officialLink = firstText(row.officialLink, row.originalLink, row.link, row.homepage)
  const imageUrl = firstText(row.imageUrl, row.thumbnailUrl, row.poster, FALLBACK_POSTER)
  const recruitmentPeriod = firstText(row.recruitmentPeriod, row.period, `마감일: ${deadline}`)
  const activityPeriod = firstText(row.activityPeriod)
  const recruitCount = firstText(row.recruitCount, row.recruitmentCount)
  const region = firstText(row.region, row.activityRegion)
  const target = firstText(row.target, row.participationTarget)
  const category = firstText(row.category, Array.isArray(row.tags) ? row.tags.join(', ') : '')
  const benefits = firstText(row.benefits)
  const prize = firstText(row.prize, benefits)

  return {
    id: Number(row.id ?? index + 1),
    title: firstText(row.title, row.contest_name, '제목 미상'),
    organizer,
    tags: normalizeTags(row, sourceSite, category),
    createdAt: firstText(row.createdAt, startDate),
    deadline,
    startDate,
    endDate: firstText(row.endDate, deadline),
    resultDate: firstText(row.resultDate, deadline),
    poster: imageUrl,
    imageUrl,
    thumbnailUrl: firstText(row.thumbnailUrl, imageUrl),
    summary: firstText(row.summary, `${organizer}에서 진행하는 공모전입니다.`),
    description: firstText(row.description, row.summary, `${organizer}에서 진행하는 공모전입니다.`),
    host: firstText(row.host, `주최: ${organizer}`),
    period: firstText(row.period, recruitmentPeriod),
    bookmarked: Boolean(row.bookmarked),
    sourceSite,
    link: officialLink,
    officialLink,
    originalLink: firstText(row.originalLink, officialLink),
    homepage: firstText(row.homepage, officialLink),
    recruitmentPeriod,
    activityPeriod,
    recruitmentCount: recruitCount,
    recruitCount,
    activityRegion: region,
    region,
    preferredCompetency: firstText(row.preferredCompetency),
    benefits,
    participationTarget: target,
    target,
    category,
    prize,
  }
}

export const CONTESTS_MOCK = (Array.isArray(contestsJson) ? contestsJson : []).map(normalizeContest)

export const CALENDAR_CONTESTS_MOCK = CONTESTS_MOCK.map(
  ({ id, title, organizer, startDate, endDate, resultDate, bookmarked, poster }) => ({
    id,
    title,
    organizer,
    startDate,
    endDate,
    resultDate,
    bookmarked,
    poster,
  }),
)
