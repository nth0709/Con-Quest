import contestsJson from './contests.json'

const FALLBACK_POSTER =
  'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80'
const DEFAULT_POSTER_TOKEN = 'photo-1516321497487-e288fb19713f'
const FALLBACK_POSTERS = [
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=80',
]

function firstText(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || ''
}

function normalizeTags(row, sourceSite, category) {
  if (Array.isArray(row.tags) && row.tags.length > 0) return row.tags
  const tags = [sourceSite, category].filter(Boolean)
  return tags.length > 0 ? tags : ['기타']
}

function hashText(text) {
  return [...String(text ?? '')].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7)
}

function fallbackPosterFor(row) {
  const key = [row.title, row.contest_name, row.organizer, row.sourceSite, row.deadline, row.endDate].join('|')
  return FALLBACK_POSTERS[hashText(key) % FALLBACK_POSTERS.length] || FALLBACK_POSTER
}

function normalizeImageUrl(row) {
  const imageUrl = firstText(row.imageUrl, row.image_url, row.thumbnailUrl, row.thumbnail_url, row.poster)
  if (!imageUrl || imageUrl.includes(DEFAULT_POSTER_TOKEN)) return fallbackPosterFor(row)
  return imageUrl
}

export function normalizeContest(row, index = 0) {
  const deadline = firstText(row.deadline, row.endDate, row.end_date, row.createdAt, row.created_at, '2099-12-31')
  const startDate = firstText(row.startDate, row.start_date, row.createdAt, row.created_at, deadline)
  const organizer = firstText(row.organizer, '주최사 정보 미상')
  const sourceSite = firstText(row.sourceSite, row.source_site, '기타')
  const officialLink = firstText(row.officialLink, row.official_link, row.originalLink, row.original_link, row.link, row.homepage)
  const sourceDetailUrl = firstText(row.sourceDetailUrl, row.source_detail_url)
  const imageUrl = normalizeImageUrl(row)
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
    endDate: firstText(row.endDate, row.end_date, deadline),
    resultDate: firstText(row.resultDate, row.result_date, deadline),
    poster: imageUrl,
    imageUrl,
    thumbnailUrl: imageUrl,
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
    sourceDetailUrl: firstText(sourceDetailUrl, officialLink),
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
