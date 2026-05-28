import { apiFetch } from './client'
import { normalizeContest } from '../data/contestsData'

export async function fetchContests() {
  const data = await apiFetch('/api/v1/contests', { auth: false })
  const rows = Array.isArray(data) ? data : data?.items ?? []
  return rows.map((row, index) => normalizeContest(row, index))
}

export async function fetchContestDetail(contestId) {
  const row = await apiFetch(`/api/v1/contests/${contestId}`, { auth: false })
  return normalizeContest(row)
}

export function fetchBookmarks() {
  return apiFetch('/api/v1/users/me/bookmarks')
}

export function addBookmark(contestId) {
  return apiFetch(`/api/v1/users/me/bookmarks/${contestId}`, { method: 'POST' })
}

export function removeBookmark(contestId) {
  return apiFetch(`/api/v1/users/me/bookmarks/${contestId}`, { method: 'DELETE' })
}
