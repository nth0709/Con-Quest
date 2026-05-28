import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAppData } from './context/AppDataProvider'
import { useAppDialog } from './context/AppDialogProvider'

const BRIGHT_BLUE = '#3B6CFF'

function toDateOnly(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function calculateDday(deadline) {
  const now = new Date()
  const diff = toDateOnly(deadline).getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function textOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function buildCardMeta(contest) {
  return [
    { label: '모집기간', value: textOrEmpty(contest.recruitmentPeriod || contest.period) },
    { label: '활동기간', value: textOrEmpty(contest.activityPeriod) },
    { label: '모집인원', value: textOrEmpty(contest.recruitCount || contest.recruitmentCount) },
    { label: '활동지역', value: textOrEmpty(contest.region || contest.activityRegion) },
    { label: '대상', value: textOrEmpty(contest.target || contest.participationTarget) },
    { label: '분야', value: textOrEmpty(contest.category) },
  ].filter((item) => item.value)
}

function buildDetailItems(contest) {
  return [
    { label: '출처', value: textOrEmpty(contest.sourceSite) },
    { label: '주최사', value: textOrEmpty(contest.organizer) },
    { label: '모집기간', value: textOrEmpty(contest.recruitmentPeriod || contest.period) },
    { label: '마감일', value: textOrEmpty(contest.deadline) },
    { label: '활동기간', value: textOrEmpty(contest.activityPeriod) },
    { label: '모집인원', value: textOrEmpty(contest.recruitCount || contest.recruitmentCount) },
    { label: '활동지역', value: textOrEmpty(contest.region || contest.activityRegion) },
    { label: '대상', value: textOrEmpty(contest.target || contest.participationTarget) },
    { label: '분야', value: textOrEmpty(contest.category) },
    { label: '우대역량', value: textOrEmpty(contest.preferredCompetency) },
    { label: '혜택', value: textOrEmpty(contest.benefits) },
    { label: '시상내역', value: textOrEmpty(contest.prize) },
  ].filter((item) => item.value)
}

function MetadataRows({ items, emptyText = '정보 없음' }) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyText}</p>
  }

  return (
    <div className="space-y-3 text-sm text-zinc-700">
      {items.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[84px_1fr] gap-3 border-b border-zinc-100 pb-3 last:border-b-0 last:pb-0"
        >
          <p className="font-semibold text-zinc-500">{item.label}</p>
          <p className="whitespace-pre-wrap break-words text-zinc-900">{item.value || emptyText}</p>
        </div>
      ))}
    </div>
  )
}

export default function ContestPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { id: idParam } = useParams()
  const detailId = idParam && !Number.isNaN(Number(idParam)) ? Number(idParam) : null

  const { contests, setBookmarked } = useAppData()
  const { showConfirm } = useAppDialog()

  const [searchText, setSearchText] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [sortOption, setSortOption] = useState('latest')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalTags, setModalTags] = useState([])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q) setSearchText(q)
  }, [searchParams])

  const allTags = useMemo(
    () => [...new Set(contests.flatMap((contest) => contest.tags))].sort((a, b) => a.localeCompare(b, 'ko')),
    [contests],
  )

  const selectedContest = useMemo(
    () => (detailId ? contests.find((contest) => contest.id === detailId) ?? null : null),
    [contests, detailId],
  )

  const filteredContests = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    let list = contests.filter((contest) => {
      const titleMatch = contest.title.toLowerCase().includes(normalizedSearch)
      const organizerMatch = contest.organizer.toLowerCase().includes(normalizedSearch)
      const matchesSearch = normalizedSearch.length === 0 || titleMatch || organizerMatch

      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tag) => contest.tags.some((contestTag) => contestTag === tag || contestTag.includes(tag)))

      return matchesSearch && matchesTags
    })

    if (sortOption === 'latest') {
      list = list.sort((a, b) => toDateOnly(b.createdAt).getTime() - toDateOnly(a.createdAt).getTime())
    } else {
      list = list.sort((a, b) => toDateOnly(a.deadline).getTime() - toDateOnly(b.deadline).getTime())
    }
    return list
  }, [contests, searchText, selectedTags, sortOption])

  const openTagModal = () => {
    setModalTags([...selectedTags])
    setIsModalOpen(true)
  }

  const toggleModalTag = (tag) => {
    setModalTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
  }

  const applyTags = () => {
    setSelectedTags([...modalTags])
    setIsModalOpen(false)
  }

  const goBackSafely = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/main')
  }

  const onToggleBookmark = async (id, currentlyMarked, event) => {
    event?.stopPropagation?.()
    if (currentlyMarked) {
      const ok = await showConfirm({ message: '스크랩을 해제할까요?' })
      if (!ok) return
      setBookmarked(id, false)
    } else {
      setBookmarked(id, true)
    }
  }

  const openOfficialLink = (contest, event) => {
    event?.stopPropagation?.()
    const link = contest.officialLink || contest.homepage || contest.originalLink || contest.link
    if (!link) return
    window.open(link, '_blank', 'noopener,noreferrer')
  }

  if (detailId && selectedContest) {
    const detailItems = buildDetailItems(selectedContest)
    const dday = calculateDday(selectedContest.deadline)
    const imageUrl = selectedContest.imageUrl || selectedContest.thumbnailUrl || selectedContest.poster

    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[412px] flex-col overflow-hidden bg-white">
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-6">
          <header className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={goBackSafely}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-zinc-700 active:scale-[0.96]"
            >
              ← 뒤로가기
            </button>
            <button
              type="button"
              onClick={(event) => onToggleBookmark(selectedContest.id, selectedContest.bookmarked, event)}
              className="min-h-11 rounded-xl px-3 text-xl text-zinc-700 active:scale-[0.96]"
              aria-label="스크랩 토글"
            >
              {selectedContest.bookmarked ? '★' : '☆'}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto pb-[104px]">
            <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50">
              <img src={imageUrl} alt={selectedContest.title} className="h-72 w-full object-cover" />
            </section>

            <section className="mt-3 rounded-3xl border border-zinc-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full bg-[color:var(--brand-blue)]/10 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--brand-blue)]">
                      {selectedContest.sourceSite || '출처 정보 없음'}
                    </span>
                    {selectedContest.category ? (
                      <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                        {selectedContest.category}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-xl font-bold leading-7 text-zinc-900">{selectedContest.title}</h2>
                  <p className="mt-2 text-sm text-zinc-600">{selectedContest.organizer || '주최사 정보 없음'}</p>
                </div>
                <div className="shrink-0 rounded-2xl bg-[color:var(--brand-blue)] px-3 py-2 text-sm font-bold text-white">
                  {dday >= 0 ? `D-${dday}` : `마감 ${Math.abs(dday)}일 지남`}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={(event) => openOfficialLink(selectedContest, event)}
                  className="min-h-11 flex-1 rounded-xl border border-[color:var(--brand-blue)] bg-white px-4 text-sm font-semibold text-[color:var(--brand-blue)] active:scale-[0.985]"
                >
                  공식 홈페이지
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/community?board=team&contestId=${encodeURIComponent(String(selectedContest.id))}&openWrite=1`,
                    )
                  }
                  className="min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold text-white active:scale-[0.985]"
                  style={{ backgroundColor: BRIGHT_BLUE }}
                >
                  팀원 찾기
                </button>
              </div>
            </section>

            <section className="mt-3 rounded-3xl border border-zinc-200 p-4">
              <h3 className="text-base font-bold text-zinc-900">상세 정보</h3>
              <div className="mt-3">
                <MetadataRows items={detailItems} />
              </div>
            </section>

            <section className="mt-3 rounded-3xl border border-zinc-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-zinc-900">설명</h3>
                <button
                  type="button"
                  onClick={(event) => openOfficialLink(selectedContest, event)}
                  className="text-xs font-semibold text-[color:var(--brand-blue)]"
                >
                  원문 링크 열기
                </button>
              </div>
              <p className="text-sm leading-6 text-zinc-700">
                {selectedContest.description || selectedContest.summary || '상세 설명이 아직 없습니다.'}
              </p>
            </section>
          </div>
        </div>
      </div>
    )
  }

  if (detailId && !selectedContest) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[412px] flex-col items-center justify-center gap-3 bg-white px-6">
        <p className="text-center text-sm text-zinc-600">공모전을 찾을 수 없습니다.</p>
        <button
          type="button"
          onClick={goBackSafely}
          className="min-h-11 rounded-xl px-4 text-sm font-semibold text-[var(--brand-blue)]"
        >
          뒤로가기
        </button>
      </div>
    )
  }

  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[412px] flex-col overflow-hidden bg-white">
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
        <header className="mb-3 shrink-0">
          <div className="space-y-2">
            <label className="flex min-h-10 items-center gap-2 rounded-2xl bg-zinc-100 px-3 py-2">
              <span className="text-sm text-zinc-500">검색</span>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="공모전명 또는 주최사 검색"
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openTagModal}
                className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 active:bg-zinc-50"
              >
                태그 설정
              </button>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex max-w-full items-center rounded-full border border-[color:var(--brand-blue)]/30 bg-[color:var(--brand-blue)]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--brand-blue)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              <select
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value)}
                className="shrink-0 rounded-full border border-zinc-300 bg-white px-2 py-1.5 text-xs font-semibold text-zinc-700 outline-none"
              >
                <option value="latest">최신순</option>
                <option value="deadline">마감일순</option>
              </select>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          <div className="space-y-3">
            {filteredContests.map((contest) => {
              const dday = calculateDday(contest.deadline)
              const cardMeta = buildCardMeta(contest)
              const imageUrl = contest.imageUrl || contest.thumbnailUrl || contest.poster

              return (
                <article
                  key={contest.id}
                  onClick={() => navigate(`/contests/${contest.id}`)}
                  className="cursor-pointer overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition active:scale-[0.995]"
                >
                  <div className="flex gap-3 p-3">
                    <img
                      src={imageUrl}
                      alt={contest.title}
                      className="h-28 w-24 shrink-0 rounded-2xl object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-[color:var(--brand-blue)]/10 px-2 py-0.5 text-[11px] font-semibold text-[color:var(--brand-blue)]">
                              {contest.sourceSite || '출처 정보 없음'}
                            </span>
                            {contest.category ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                                {contest.category}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-zinc-900">
                            {contest.title}
                          </p>
                          <p className="mt-1 text-sm text-zinc-600">{contest.organizer || '주최사 정보 없음'}</p>
                        </div>

                        <button
                          type="button"
                          onClick={(event) => onToggleBookmark(contest.id, contest.bookmarked, event)}
                          className="min-h-8 shrink-0 rounded-md px-2 text-lg text-zinc-700 active:scale-[0.95]"
                          aria-label="스크랩 토글"
                        >
                          {contest.bookmarked ? '★' : '☆'}
                        </button>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {(cardMeta.length > 0 ? cardMeta : [{ label: '정보', value: '정보 없음' }]).slice(0, 6).map((item) => (
                          <div key={item.label} className="rounded-2xl bg-zinc-50 px-2.5 py-2">
                            <p className="text-[11px] font-semibold text-zinc-500">{item.label}</p>
                            <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-zinc-800">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: BRIGHT_BLUE }}>
                        {dday >= 0 ? `D-${dday}` : `마감 ${Math.abs(dday)}일 지남`}
                      </span>
                      {contest.target ? <span className="text-xs text-zinc-500">{contest.target}</span> : null}
                    </div>

                    <button
                      type="button"
                      onClick={(event) => openOfficialLink(contest, event)}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 active:bg-zinc-50"
                    >
                      공식 홈페이지
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm">
          <div className="max-h-[70vh] w-full overflow-hidden rounded-t-3xl bg-white p-5 pb-8 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900">태그 설정</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 text-xl text-zinc-400">
                ×
              </button>
            </div>
            <div className="max-h-[42vh] overflow-y-auto pb-3">
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => {
                  const active = modalTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleModalTag(tag)}
                      className={`min-h-9 rounded-full border px-3 text-xs font-semibold active:scale-[0.97] ${
                        active
                          ? 'border-[var(--blue)] bg-[var(--blue)]/10 text-[var(--blue)]'
                          : 'border-zinc-300 bg-white text-zinc-600'
                      }`}
                      style={{ '--blue': BRIGHT_BLUE }}
                    >
                      #{tag}
                    </button>
                  )
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={applyTags}
              className="mt-2 min-h-12 w-full rounded-xl text-base font-bold text-white active:scale-[0.985]"
              style={{ backgroundColor: BRIGHT_BLUE }}
            >
              적용하기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
