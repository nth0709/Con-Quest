import { apiFetch } from './client'
import { normalizeContest } from '../data/contestsData'

export async function fetchRecommendations(profile) {
  const rows = await apiFetch('/api/v1/recommendations', {
    method: 'POST',
    body: profile,
  })

  return (Array.isArray(rows) ? rows : []).map((item, index) => ({
    ...item,
    contest: normalizeContest(item.contest, index),
  }))
}

