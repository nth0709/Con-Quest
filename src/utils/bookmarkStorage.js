/** @typedef {{ [userId: string]: number[] }} BookmarksByUser */

const STORAGE = 'conquest_bookmarks_by_user_v2'
const LEGACY = 'conquest_bookmarks_v1'

export function loadBookmarksByUser() {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return {}
    const o = JSON.parse(raw)
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

function saveBookmarksByUser(map) {
  localStorage.setItem(STORAGE, JSON.stringify(map))
}

/** 모든 유저 스크랩을 합산해 공모전 id → 건수 */
export function getGlobalBookmarkCounts() {
  const map = loadBookmarksByUser()
  const counts = {}
  for (const uid of Object.keys(map)) {
    const ids = Array.isArray(map[uid]) ? map[uid] : []
    for (const id of ids) {
      const k = String(id)
      counts[k] = (counts[k] ?? 0) + 1
    }
  }
  return counts
}

export function getBookmarkIdsForUser(userId) {
  if (!userId) return []
  const map = loadBookmarksByUser()
  const list = map[userId]
  return Array.isArray(list) ? [...list] : []
}

export function setBookmarkIdsForUser(userId, ids) {
  if (!userId) return
  const map = loadBookmarksByUser()
  map[userId] = [...new Set(ids)]
  saveBookmarksByUser(map)
}

export function userHasBookmark(userId, contestId) {
  return getBookmarkIdsForUser(userId).includes(Number(contestId))
}

export function setUserBookmark(userId, contestId, bookmarked) {
  let ids = getBookmarkIdsForUser(userId)
  const n = Number(contestId)
  if (bookmarked) {
    if (!ids.includes(n)) ids = [...ids, n]
  } else {
    ids = ids.filter((x) => x !== n)
  }
  setBookmarkIdsForUser(userId, ids)
}
