/**
 * 사이드바 배지·AI 분석 페이지 상단 안내용 — 저장된 유저 객체 기준 미완성 여부
 */
export function isAiProfileIncomplete(user) {
  if (!user || typeof user !== 'object') return true

  const nick = String(user.nickname ?? '').trim()
  const job = String(user.job ?? '').trim()
  if (!nick || !job) return true

  if (!Array.isArray(user.categories) || user.categories.length === 0) return true
  if (!Array.isArray(user.skills) || user.skills.length === 0) return true
  if (!Array.isArray(user.tools) || user.tools.length === 0) return true

  if (job === '대학생/대학원생') {
    if (!String(user.major ?? '').trim()) return true
    if (!String(user.minor ?? '').trim()) return true
    if (!String(user.grade ?? '').trim()) return true
    if (!String(user.studentStatus ?? '').trim()) return true
  }

  if (job === '취업준비생') {
    if (!String(user.desiredRole ?? '').trim()) return true
  }

  if (job === '직장인/일반') {
    if (!String(user.currentRole ?? '').trim()) return true
    if (!String(user.careerYear ?? '').trim()) return true
  }

  if (job === '취업준비생' || job === '직장인/일반') {
    const ug = user.universityGraduated
    if (ug !== 'yes' && ug !== 'no') return true
    if (ug === 'yes') {
      if (!String(user.major ?? '').trim()) return true
      if (!String(user.minor ?? '').trim()) return true
    }
  }

  if (!String(user.activityRegions ?? '').trim()) return true
  const pref = user.activityPreferenceForm
  if (pref !== 'individual' && pref !== 'team' && pref !== 'both') return true

  const past = user.pastContestParticipation
  if (past !== 'yes' && past !== 'no') return true
  if (past === 'yes') {
    const award = user.contestAwardCount
    if (award === '' || award === undefined || award === null || Number.isNaN(Number(award))) return true
    if (!Array.isArray(user.mainActivityJobFields) || user.mainActivityJobFields.length === 0) return true
  }

  const hc = user.hasCert
  if (hc !== '있음' && hc !== '없음') return true
  if (hc === '있음' && (!Array.isArray(user.certifications) || user.certifications.length === 0)) return true

  const hi = user.hasIntern
  if (hi !== '있음' && hi !== '없음') return true
  if (hi === '있음' && (!Array.isArray(user.internships) || user.internships.length === 0)) return true

  return false
}

/** 저장 전 알림용 — 미입력 항목 라벨(한국어) */
export function getAiProfileMissingLabels(user) {
  if (!user || typeof user !== 'object') return ['로그인 정보']

  const miss = []
  const nick = String(user.nickname ?? '').trim()
  const job = String(user.job ?? '').trim()
  if (!nick) miss.push('닉네임')
  if (!job) miss.push('직업 유형')

  if (!Array.isArray(user.categories) || user.categories.length === 0) miss.push('관심 카테고리')
  if (!Array.isArray(user.skills) || user.skills.length === 0) miss.push('보유 스킬')
  if (!Array.isArray(user.tools) || user.tools.length === 0) miss.push('활용 툴')

  if (job === '대학생/대학원생') {
    if (!String(user.major ?? '').trim()) miss.push('전공')
    if (!String(user.minor ?? '').trim()) miss.push('부전공')
    if (!String(user.grade ?? '').trim()) miss.push('학년')
    if (!String(user.studentStatus ?? '').trim()) miss.push('재학 상태')
  }

  if (job === '취업준비생' && !String(user.desiredRole ?? '').trim()) miss.push('희망 직무 분야')

  if (job === '직장인/일반') {
    if (!String(user.currentRole ?? '').trim()) miss.push('현재 종사 직무')
    if (!String(user.careerYear ?? '').trim()) miss.push('현재 연차')
  }

  if (job === '취업준비생' || job === '직장인/일반') {
    const ug = user.universityGraduated
    if (ug !== 'yes' && ug !== 'no') miss.push('대학교 졸업 여부')
    if (ug === 'yes') {
      if (!String(user.major ?? '').trim()) miss.push('전공(졸업 후)')
      if (!String(user.minor ?? '').trim()) miss.push('부전공(졸업 후)')
    }
  }

  if (!String(user.activityRegions ?? '').trim()) miss.push('활동 가능 지역')
  const pref = user.activityPreferenceForm
  if (pref !== 'individual' && pref !== 'team' && pref !== 'both') miss.push('선호하는 활동 형태')

  const past = user.pastContestParticipation
  if (past !== 'yes' && past !== 'no') miss.push('과거 수상·참가 이력')
  if (past === 'yes') {
    const award = user.contestAwardCount
    if (award === '' || award === undefined || award === null || Number.isNaN(Number(award))) miss.push('공모전 수상 횟수')
    if (!Array.isArray(user.mainActivityJobFields) || user.mainActivityJobFields.length === 0) miss.push('공모전 활동 분야')
  }

  const hc = user.hasCert
  if (hc !== '있음' && hc !== '없음') miss.push('보유 자격증 여부')
  if (hc === '있음' && (!Array.isArray(user.certifications) || user.certifications.length === 0)) miss.push('보유 자격증(목록)')

  const hi = user.hasIntern
  if (hi !== '있음' && hi !== '없음') miss.push('인턴 경험 여부')
  if (hi === '있음' && (!Array.isArray(user.internships) || user.internships.length === 0)) miss.push('인턴 경험(등록)')

  return miss
}
