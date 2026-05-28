import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAppData } from './context/AppDataProvider'
import { useAppDialog } from './context/AppDialogProvider'

const AUTH_KEY = 'authUser'

function getAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null')
  } catch {
    return null
  }
}

export default function PostDetailPage() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const user = getAuthUser()
  const { posts, updatePost, deletePost, addComment, updateComment, deleteComment } = useAppData()
  const { showConfirm } = useAppDialog()

  const post = useMemo(() => posts.find((p) => p.id === postId), [posts, postId])

  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editingPost, setEditingPost] = useState(false)

  const [commentText, setCommentText] = useState('')
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editCommentBody, setEditCommentBody] = useState('')

  if (!user) return <Navigate to="/" replace />
  if (!post) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6">
        <p className="text-sm text-zinc-600">글을 찾을 수 없습니다.</p>
        <Link to="/community" className="text-sm font-semibold text-[var(--brand-blue)]">
          커뮤니티로
        </Link>
      </div>
    )
  }

  const isMine = post.authorId === user.id
  const comments = post.comments ?? []

  const startEditPost = () => {
    setEditTitle(post.title)
    setEditBody(post.body)
    setEditingPost(true)
  }

  const savePost = () => {
    const t = editTitle.trim()
    const b = editBody.trim()
    if (!t || !b) return
    updatePost(post.id, { title: t, body: b })
    setEditingPost(false)
  }

  const removePost = async () => {
    const ok = await showConfirm({ message: '게시글을 삭제할까요?' })
    if (!ok) return
    deletePost(post.id)
    navigate('/community', { replace: true })
  }

  const submitComment = () => {
    const b = commentText.trim()
    if (!b) return
    const c = {
      id: `c_${Date.now()}`,
      authorId: user.id,
      authorNick: user.nickname ?? user.name ?? '익명',
      body: b,
      createdAt: new Date().toISOString(),
    }
    addComment(post.id, c)
    setCommentText('')
  }

  const saveComment = (cid) => {
    const b = editCommentBody.trim()
    if (!b) return
    updateComment(post.id, cid, b)
    setEditingCommentId(null)
    setEditCommentBody('')
  }

  const removeComment = async (cid) => {
    const ok = await showConfirm({ message: '댓글을 삭제할까요?' })
    if (!ok) return
    deleteComment(post.id, cid)
  }

  return (
    <div className="flex min-h-0 flex-col bg-white px-4 pb-28 pt-3">
      <button type="button" onClick={() => navigate(-1)} className="mb-2 self-start text-sm font-semibold text-zinc-600">
        ← 뒤로
      </button>

      {editingPost ? (
        <div className="space-y-3">
          <input
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-base font-bold"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <textarea
            className="min-h-[160px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditingPost(false)}
              className="flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-semibold"
            >
              취소
            </button>
            <button
              type="button"
              onClick={savePost}
              className="flex-1 rounded-xl bg-[var(--brand-blue)] py-2 text-sm font-bold text-white"
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-bold text-zinc-900">{post.title}</h1>
          <p className="mt-2 text-xs text-zinc-400">
            {post.authorNick} · {new Date(post.createdAt).toLocaleString('ko-KR')}
          </p>
          {post.contestTitle ? (
            <p className="mt-2 inline-block rounded-full bg-[color:var(--brand-blue)]/10 px-2 py-1 text-xs font-bold text-[color:var(--brand-blue)]">
              {post.contestTitle}
            </p>
          ) : null}
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{post.body}</p>
          {isMine ? (
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={startEditPost} className="text-sm font-semibold text-[var(--brand-blue)]">
                수정
              </button>
              <button type="button" onClick={removePost} className="text-sm font-semibold text-red-600">
                삭제
              </button>
            </div>
          ) : null}
        </>
      )}

      <section className="mt-8 border-t border-zinc-100 pt-4">
        <h2 className="text-sm font-bold text-zinc-800">댓글 {comments.length}</h2>
        <div className="mt-3 space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="rounded-xl bg-zinc-50 px-3 py-2">
              {editingCommentId === c.id ? (
                <div>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1 text-sm"
                    value={editCommentBody}
                    onChange={(e) => setEditCommentBody(e.target.value)}
                  />
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="text-xs font-semibold text-zinc-600" onClick={() => setEditingCommentId(null)}>
                      취소
                    </button>
                    <button
                      type="button"
                      className="text-xs font-bold text-[var(--brand-blue)]"
                      onClick={() => saveComment(c.id)}
                    >
                      저장
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-zinc-500">{c.authorNick}</p>
                  <p className="mt-1 text-sm text-zinc-800">{c.body}</p>
                  {c.authorId === user.id ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-[var(--brand-blue)]"
                        onClick={() => {
                          setEditingCommentId(c.id)
                          setEditCommentBody(c.body)
                        }}
                      >
                        수정
                      </button>
                      <button type="button" className="text-xs font-semibold text-red-600" onClick={() => removeComment(c.id)}>
                        삭제
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4">
          <textarea
            placeholder="댓글을 입력하세요"
            className="min-h-[72px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <button
            type="button"
            onClick={submitComment}
            className="mt-2 w-full rounded-xl bg-zinc-900 py-2.5 text-sm font-bold text-white"
          >
            댓글 등록
          </button>
        </div>
      </section>
    </div>
  )
}
