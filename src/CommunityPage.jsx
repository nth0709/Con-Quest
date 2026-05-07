import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppData } from './context/AppDataProvider'
import { useAppDialog } from './context/AppDialogProvider'

const AUTH_KEY = 'authUser'

function readCommunityLocationState(sp) {
  const b = sp.get('board')
  const tab = b === 'team' || b === 'qna' || b === 'free' ? b : 'free'
  const openWrite = sp.get('openWrite') === '1'
  const contestIdRaw = sp.get('contestId')
  const contestId = contestIdRaw ? String(contestIdRaw) : ''
  return { tab, openWrite, contestId }
}

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null')
  } catch {
    return null
  }
}

const BOARDS = [
  { id: 'free', label: '자유 게시판' },
  { id: 'team', label: '팀원 모집' },
  { id: 'qna', label: '질문 게시판' },
]

export default function CommunityPage() {
  const user = getAuthUser()
  const navigate = useNavigate()
  const { posts, addPost, updatePost, deletePost, contests } = useAppData()
  const { showConfirm } = useAppDialog()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialRoute = readCommunityLocationState(searchParams)
  const [tab, setTab] = useState(initialRoute.tab)
  const [mineOnly, setMineOnly] = useState(false)
  /** 'closed' | 'write' | 'edit' */
  const [sheetMode, setSheetMode] = useState(initialRoute.openWrite ? 'write' : 'closed')
  const [editPostId, setEditPostId] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [contestId, setContestId] = useState(initialRoute.contestId)

  useEffect(() => {
    const b = searchParams.get('board')
    if (b === 'team') setTab('team')
    else if (b === 'qna') setTab('qna')
    else if (b === 'free') setTab('free')
    const cid = searchParams.get('contestId')
    if (cid) setContestId(cid)
    if (searchParams.get('openWrite') === '1') {
      setTitle('')
      setBody('')
      setEditPostId(null)
      setSheetMode('write')
    }
  }, [searchParams])

  const stripQuery = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('openWrite')
    next.delete('contestId')
    next.delete('board')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const filtered = useMemo(() => {
    let list = posts.filter((p) => p.board === tab)
    if (mineOnly) list = list.filter((p) => p.authorId === user?.id)
    return list
  }, [posts, tab, mineOnly, user?.id])

  if (!user) return <Navigate to="/" replace />

  const sheetOpen = sheetMode !== 'closed'

  const closeSheet = () => {
    setSheetMode('closed')
    setEditPostId(null)
    stripQuery()
  }

  const openWriteSheet = () => {
    setEditPostId(null)
    setTitle('')
    setBody('')
    const cid = searchParams.get('contestId')
    setContestId(cid ?? '')
    setSheetMode('write')
  }

  const openEditSheet = (p) => {
    setEditPostId(p.id)
    setTitle(p.title)
    setBody(p.body)
    setContestId(p.contestId ? String(p.contestId) : '')
    setSheetMode('edit')
  }

  const submitSheet = () => {
    const t = title.trim()
    const b = body.trim()
    if (!t || !b) return
    const contest = contestId ? contests.find((c) => String(c.id) === String(contestId)) : null

    if (sheetMode === 'edit' && editPostId) {
      const patch = { title: t, body: b }
      if (tab === 'team') {
        patch.contestId = contestId ? String(contestId) : ''
        patch.contestTitle = contest?.title ?? ''
      }
      updatePost(editPostId, patch)
      closeSheet()
      return
    }

    const id = `p_${Date.now()}`
    const row = {
      id,
      board: tab,
      title: t,
      body: b,
      authorId: user.id,
      authorNick: user.nickname ?? user.name ?? '익명',
      contestId: tab === 'team' && contestId ? String(contestId) : '',
      contestTitle: contest?.title ?? '',
      createdAt: new Date().toISOString(),
      comments: [],
    }
    addPost(row)
    closeSheet()
  }

  const removePost = async (p) => {
    const ok = await showConfirm({ message: '이 글을 삭제할까요?' })
    if (!ok) return
    deletePost(p.id)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-gradient-to-b from-zinc-50 to-white">
      <div className="sticky top-0 z-10 border-b border-zinc-100/90 bg-white/95 px-4 pb-3 pt-2 backdrop-blur">
        <h1 className="text-lg font-bold text-zinc-900">커뮤니티</h1>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex flex-1 rounded-xl bg-zinc-100/90 p-1">
            {BOARDS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setTab(b.id)}
                className={`relative flex-1 rounded-lg py-2 text-center text-[12px] font-semibold transition-all duration-200 ${
                  tab === b.id ? 'bg-white text-[color:var(--brand-blue)] shadow-sm' : 'text-zinc-500'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMineOnly((v) => !v)}
          className={`mt-2 w-full rounded-lg border py-2 text-center text-xs font-bold transition ${
            mineOnly
              ? 'border-[color:var(--brand-blue)] bg-[color:var(--brand-blue)]/10 text-[color:var(--brand-blue)]'
              : 'border-zinc-200 bg-white text-zinc-600'
          }`}
        >
          내 글 보기 {mineOnly ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-3 pb-28 pt-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white/60 py-16 text-center">
            <p className="text-sm font-medium text-zinc-600">아직 작성된 글이 없습니다.</p>
            <p className="mt-1 text-xs text-zinc-400">첫 글을 남겨보세요!</p>
          </div>
        ) : (
          filtered.map((p) => {
            const isMine = p.authorId === user.id
            return (
              <div
                key={p.id}
                className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm ring-1 ring-zinc-100/80"
              >
                {isMine ? (
                  <div className="flex items-center justify-end gap-3 border-b border-zinc-100 bg-zinc-50/90 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => openEditSheet(p)}
                      className="text-xs font-bold text-[var(--brand-blue)] active:opacity-80"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => removePost(p)}
                      className="text-xs font-bold text-red-600 active:opacity-80"
                    >
                      삭제
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => navigate(`/community/post/${p.id}`)}
                  className="w-full p-4 text-left active:bg-zinc-50/80"
                >
                  {p.contestTitle ? (
                    <span className="mb-2 inline-block rounded-full bg-[color:var(--brand-blue)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--brand-blue)]">
                      {p.contestTitle}
                    </span>
                  ) : null}
                  <p className="font-semibold text-zinc-900">{p.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-zinc-600">{p.body}</p>
                  <p className="mt-3 text-xs text-zinc-400">
                    {p.authorNick} · {new Date(p.createdAt).toLocaleDateString('ko-KR')}
                  </p>
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="pointer-events-none fixed bottom-[72px] left-1/2 z-30 w-full max-w-[412px] -translate-x-1/2 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openWriteSheet}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-blue)] text-3xl font-light leading-none text-white shadow-lg shadow-blue-500/35 active:scale-95"
            aria-label="글쓰기"
          >
            +
          </button>
        </div>
      </div>

      {sheetOpen &&
        createPortal(
          <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-[2px]" role="presentation">
            <button type="button" className="absolute inset-0 cursor-default" aria-label="닫기" onClick={closeSheet} />
            <div className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center pb-[max(16px,env(safe-area-inset-bottom))]">
              <div className="pointer-events-auto w-full max-w-[412px] px-3">
                <div className="max-h-[min(72dvh,520px)] w-full overflow-hidden rounded-t-[1.35rem] bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.18)]">
                  <div className="flex justify-center pt-3 pb-1">
                    <span className="h-1 w-10 rounded-full bg-zinc-200" aria-hidden />
                  </div>
                  <div className="max-h-[min(calc(72dvh-2.5rem),480px)] overflow-y-auto overscroll-y-contain px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-lg font-bold text-zinc-900">{sheetMode === 'edit' ? '글 수정' : '새 글 작성'}</h2>
                      <button
                        type="button"
                        className="rounded-full p-2 text-sm font-semibold text-zinc-400 active:bg-zinc-100"
                        onClick={closeSheet}
                      >
                        닫기
                      </button>
                    </div>
                    {tab === 'team' && (
                      <label className="mb-4 block">
                        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-zinc-500">공모전 선택</span>
                        <select
                          className="min-h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 text-sm font-medium text-zinc-900 outline-none focus:border-[var(--brand-blue)]"
                          value={contestId}
                          onChange={(e) => setContestId(e.target.value)}
                        >
                          <option value="">선택하세요</option>
                          {contests.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="mb-4 block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-zinc-500">제목</span>
                      <input
                        className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium outline-none focus:border-[var(--brand-blue)]"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="제목을 입력하세요"
                      />
                    </label>
                    <label className="mb-5 block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-zinc-500">내용</span>
                      <textarea
                        className="min-h-[140px] w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm leading-relaxed outline-none focus:border-[var(--brand-blue)]"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="내용을 입력하세요"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={submitSheet}
                      className="min-h-12 w-full rounded-xl bg-[var(--brand-blue)] text-base font-bold text-white shadow-md active:brightness-95"
                    >
                      {sheetMode === 'edit' ? '저장' : '등록'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
