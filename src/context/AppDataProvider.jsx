import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { CONTESTS_MOCK } from '../data/contestsData'
import {
  addBookmark,
  fetchBookmarks,
  fetchContests,
  removeBookmark,
} from '../api/contests'
import {
  createCommentRequest,
  createPost,
  deleteCommentRequest,
  deletePostRequest,
  fetchPosts,
  updateCommentRequest,
  updatePostRequest,
} from '../api/posts'
import { hasApiBase } from '../api/client'
import {
  getBookmarkIdsForUser,
  getGlobalBookmarkCounts,
  setUserBookmark,
} from '../utils/bookmarkStorage'

export const POSTS_KEY = 'conquest_community_posts_v2'
const POSTS_LEGACY = 'conquest_community_posts_v1'

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem('authUser') ?? 'null')
  } catch {
    return null
  }
}

function loadPostsRaw() {
  try {
    const raw = localStorage.getItem(POSTS_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      return Array.isArray(arr) ? arr : []
    }
    const leg = localStorage.getItem(POSTS_LEGACY)
    if (!leg) return []
    const old = JSON.parse(leg)
    if (!Array.isArray(old)) return []
    return old.map((p) => ({
      ...p,
      board: p.board === 'team' ? 'team' : p.board === 'qna' ? 'qna' : 'free',
      comments: Array.isArray(p.comments) ? p.comments : [],
    }))
  } catch {
    return []
  }
}

function savePostsRaw(list) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(list))
}

function normalizePosts(list) {
  return Array.isArray(list)
    ? list.map((p) => ({
        ...p,
        board: p.board === 'team' ? 'team' : p.board === 'qna' ? 'qna' : 'free',
        comments: Array.isArray(p.comments) ? p.comments : [],
      }))
    : []
}

const Ctx = createContext(null)

export function AppDataProvider({ children }) {
  const [userId, setUserId] = useState(() => getAuthUser()?.id ?? null)
  const [rev, setRev] = useState(0)
  const [posts, setPosts] = useState(loadPostsRaw)
  const [remoteContests, setRemoteContests] = useState(null)
  const [remoteBookmarkCounts, setRemoteBookmarkCounts] = useState(null)
  
  // 🔔 [추가] 실시간 알림 상태 저장소
  const [notifications, setNotifications] = useState([])
  
  const apiEnabled = hasApiBase()

  // 🔔 [추가] 백엔드로부터 알림 리스트 동기화하는 함수
  const hydrateNotifications = useCallback(async () => {
    if (!apiEnabled || !userId) return
    try {
      const res = await fetch("http://localhost:8000/api/notifications", {
        headers: { "X-User-Id": String(userId) },
      })
      if (res.ok) {
        const data = await res.json()
        setNotifications(data)
      }
    } catch (err) {
      console.error("알림 동기화 실패:", err)
    }
  }, [apiEnabled, userId])

  // 🔔 [추가] 알림 읽음 처리 API 호출 함수
  const markNotificationAsRead = useCallback(async (notificationId) => {
    if (!userId) return
    
    // UI에 즉시 반영 (선최적화)
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
    )

    if (!apiEnabled) return

    try {
      await fetch(`http://localhost:8000/api/notifications/${notificationId}/read`, {
        method: "PATCH",
        headers: { "X-User-Id": String(userId) },
      })
    } catch (err) {
      console.error("알림 읽음 처리 요청 실패:", err)
    }
  }, [apiEnabled, userId])

  useEffect(() => {
    try {
      if (!localStorage.getItem(POSTS_KEY) && localStorage.getItem(POSTS_LEGACY)) {
        const migrated = loadPostsRaw()
        savePostsRaw(migrated)
        setPosts(migrated)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const sync = () => {
      setUserId(getAuthUser()?.id ?? null)
      setPosts(loadPostsRaw())
      setRev((r) => r + 1)
    }
    window.addEventListener('conquest-auth-changed', sync)
    return () => window.removeEventListener('conquest-auth-changed', sync)
  }, [])

  const bump = useCallback(() => setRev((r) => r + 1), [])

  const hydrateRemoteContests = useCallback(async () => {
    if (!apiEnabled) return false
    try {
      const [contestRows, bookmarkRows] = await Promise.all([
        fetchContests(),
        userId ? fetchBookmarks() : Promise.resolve([]),
      ])
      const bookmarkedIds = new Set((bookmarkRows ?? []).map((row) => Number(row.id)))
      const counts = {}
      const normalized = (contestRows ?? []).map((contest) => {
        counts[String(contest.id)] = Number(contest.bookmarkCount ?? 0)
        return {
          ...contest,
          bookmarked: bookmarkedIds.has(Number(contest.id)) || Boolean(contest.bookmarked),
        }
      })
      setRemoteContests(normalized)
      setRemoteBookmarkCounts(counts)
      return true
    } catch {
      setRemoteContests(null)
      setRemoteBookmarkCounts(null)
      return false
    }
  }, [apiEnabled, userId])

  const hydrateRemotePosts = useCallback(async () => {
    if (!apiEnabled) return false
    try {
      const rows = normalizePosts(await fetchPosts())
      setPosts(rows)
      savePostsRaw(rows)
      return true
    } catch {
      return false
    }
  }, [apiEnabled])

  // 기존 라이프사이클 엔진에 알림 주기적 동기화 톱니바퀴 연동
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!apiEnabled) return
      // 공모전, 게시글 로드할 때 알림도 함께 동기화 처리
      await Promise.all([hydrateRemoteContests(), hydrateRemotePosts(), hydrateNotifications()])
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [apiEnabled, hydrateRemoteContests, hydrateRemotePosts, hydrateNotifications, rev])

  // 🔔 [추가] 20초마다 새 알림 정보 체크하는 백그라운드 폴링 타이머 가동
  useEffect(() => {
    if (!userId || !apiEnabled) return
    const interval = setInterval(hydrateNotifications, 20000)
    return () => clearInterval(interval)
  }, [hydrateNotifications, userId, apiEnabled])

  const contests = useMemo(() => {
    if (remoteContests) return remoteContests
    const uid = userId
    const ids = new Set(uid ? getBookmarkIdsForUser(uid) : [])
    return CONTESTS_MOCK.map((c) => ({ ...c, bookmarked: ids.has(c.id) }))
  }, [remoteContests, userId, rev])

  const globalScrapCounts = useMemo(
    () => remoteBookmarkCounts ?? getGlobalBookmarkCounts(),
    [remoteBookmarkCounts, rev],
  )

  const setBookmarked = useCallback(
    async (contestId, bookmarked) => {
      if (!userId) return

      setUserBookmark(userId, contestId, bookmarked)
      if (!apiEnabled) {
        bump()
        return
      }

      setRemoteContests((prev) =>
        Array.isArray(prev)
          ? prev.map((contest) =>
              contest.id === contestId ? { ...contest, bookmarked } : contest,
            )
          : prev,
      )

      try {
        if (bookmarked) await addBookmark(contestId)
        else await removeBookmark(contestId)
        await hydrateRemoteContests()
      } catch {
        bump()
      }
    },
    [apiEnabled, bump, hydrateRemoteContests, userId],
  )

  const persistPosts = useCallback(
    (next) => {
      savePostsRaw(next)
      setPosts(next)
      bump()
    },
    [bump],
  )

  const addPost = useCallback(
    async (row) => {
      if (!apiEnabled) {
        persistPosts([row, ...posts])
        return row.id
      }
      try {
        const created = await createPost({
          board: row.board,
          title: row.title,
          body: row.body,
          contestId: row.contestId || '',
          contestTitle: row.contestTitle || '',
        })
        const next = [created, ...posts]
        savePostsRaw(next)
        setPosts(next)
        return created.id
      } catch {
        persistPosts([row, ...posts])
        return row.id
      }
    },
    [apiEnabled, persistPosts, posts],
  )

  const updatePost = useCallback(
    async (id, patch) => {
      if (!apiEnabled) {
        persistPosts(posts.map((p) => (p.id === id ? { ...p, ...patch } : p)))
        return
      }
      try {
        const updated = await updatePostRequest(id, patch)
        const next = posts.map((p) => (p.id === id ? updated : p))
        savePostsRaw(next)
        setPosts(next)
      } catch {
        persistPosts(posts.map((p) => (p.id === id ? { ...p, ...patch } : p)))
      }
    },
    [apiEnabled, persistPosts, posts],
  )

  const deletePost = useCallback(
    async (id) => {
      if (!apiEnabled) {
        persistPosts(posts.filter((p) => p.id !== id))
        return
      }
      try {
        await deletePostRequest(id)
        const next = posts.filter((p) => p.id !== id)
        savePostsRaw(next)
        setPosts(next)
      } catch {
        persistPosts(posts.filter((p) => p.id !== id))
      }
    },
    [apiEnabled, persistPosts, posts],
  )

  const addComment = useCallback(
    async (postId, comment) => {
      if (!apiEnabled) {
        persistPosts(
          posts.map((p) =>
            p.id === postId ? { ...p, comments: [...(p.comments ?? []), comment] } : p,
          ),
        )
        return
      }
      try {
        const created = await createCommentRequest(postId, { body: comment.body })
        const next = posts.map((p) =>
          p.id === postId ? { ...p, comments: [...(p.comments ?? []), created] } : p,
        )
        savePostsRaw(next)
        setPosts(next)
      } catch {
        persistPosts(
          posts.map((p) =>
            p.id === postId ? { ...p, comments: [...(p.comments ?? []), comment] } : p,
          ),
        )
      }
    },
    [apiEnabled, persistPosts, posts],
  )

  const updateComment = useCallback(
    async (postId, commentId, body) => {
      if (!apiEnabled) {
        persistPosts(
          posts.map((p) =>
            p.id !== postId
              ? p
              : {
                  ...p,
                  comments: (p.comments ?? []).map((c) =>
                    c.id === commentId ? { ...c, body } : c,
                  ),
                },
          ),
        )
        return
      }
      try {
        const updated = await updateCommentRequest(postId, commentId, { body })
        const next = posts.map((p) =>
          p.id !== postId
            ? p
            : {
                ...p,
                comments: (p.comments ?? []).map((c) => (c.id === commentId ? updated : c)),
              },
        )
        savePostsRaw(next)
        setPosts(next)
      } catch {
        persistPosts(
          posts.map((p) =>
            p.id !== postId
              ? p
              : {
                  ...p,
                  comments: (p.comments ?? []).map((c) =>
                    c.id === commentId ? { ...c, body } : c,
                  ),
                },
          ),
        )
      }
    },
    [apiEnabled, persistPosts, posts],
  )

  const deleteComment = useCallback(
    async (postId, commentId) => {
      if (!apiEnabled) {
        persistPosts(
          posts.map((p) =>
            p.id !== postId
              ? p
              : { ...p, comments: (p.comments ?? []).filter((c) => c.id !== commentId) },
          ),
        )
        return
      }
      try {
        await deleteCommentRequest(postId, commentId)
        const next = posts.map((p) =>
          p.id !== postId
            ? p
            : { ...p, comments: (p.comments ?? []).filter((c) => c.id !== commentId) },
        )
        savePostsRaw(next)
        setPosts(next)
      } catch {
        persistPosts(
          posts.map((p) =>
            p.id !== postId
              ? p
              : { ...p, comments: (p.comments ?? []).filter((c) => c.id !== commentId) },
          ),
        )
      }
    },
    [apiEnabled, persistPosts, posts],
  )

  const getContestById = useCallback(
    (id) => contests.find((c) => Number(c.id) === Number(id)),
    [contests],
  )

  const value = useMemo(
    () => ({
      contests,
      globalScrapCounts,
      setBookmarked,
      posts,
      addPost,
      updatePost,
      deletePost,
      addComment,
      updateComment,
      deleteComment,
      getContestById,
      userId,
      // 🔔 [추가] 하위 알림 종 아이콘에서 가져다 쓸 수 있도록 컨텍스트 배포
      notifications,
      markNotificationAsRead,
    }),
    [
      contests,
      globalScrapCounts,
      setBookmarked,
      posts,
      addPost,
      updatePost,
      deletePost,
      addComment,
      updateComment,
      deleteComment,
      getContestById,
      userId,
      notifications,
      markNotificationAsRead,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAppData() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppData outside AppDataProvider')
  return v
}