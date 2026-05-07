import { apiFetch } from './client'

export function fetchContests() {
  return apiFetch('/api/v1/contests', { auth: false })
}

export function fetchContestDetail(contestId) {
  return apiFetch(`/api/v1/contests/${contestId}`, { auth: false })
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

