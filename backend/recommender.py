from __future__ import annotations

from datetime import date

from ai.keyword_extractor import extract_keywords, split_keywords
from ai.qwen_client import get_qwen_status_message, use_qwen_recommender


def text_contains_any(keywords: set[str], candidates: set[str]) -> set[str]:
    return {keyword for keyword in keywords if keyword and keyword in candidates}


def _keyword_bonus(match_count: int, bonus_per_match: int, max_bonus: int) -> int:
    return min(match_count * bonus_per_match, max_bonus)


def calculate_recommendation(user_profile: dict, contests: list[dict]) -> list[dict]:
    today = date.today()
    user_interests = split_keywords(user_profile.get("interests", ""))
    user_major = split_keywords(user_profile.get("major", ""))
    user_skills = split_keywords(user_profile.get("skills", ""))
    user_certificates = split_keywords(user_profile.get("certificates", ""))
    user_awards = split_keywords(user_profile.get("awards", ""))
    user_career = split_keywords(user_profile.get("desired_career", ""))
    user_fields = split_keywords(user_profile.get("preferred_fields", ""))

    qwen_status = get_qwen_status_message()
    results: list[dict] = []

    for contest in contests:
        category = contest.get("category", "")
        description = contest.get("description", "")
        title = contest.get("title", "")
        required_skills = contest.get("required_skills", "")
        searchable_text = " ".join([title, category, description, required_skills]).strip()
        contest_keywords = extract_keywords(searchable_text)

        score = 0
        reasons: list[str] = []
        matched_points: list[str] = []

        matched = text_contains_any(user_interests, contest_keywords)
        if matched:
            score += 30 + _keyword_bonus(len(matched), 2, 8)
            matched_points.append("관심 분야 일치")
            reasons.append(f"관심 분야와 맞는 키워드가 있습니다: {', '.join(sorted(matched)[:4])}")

        matched = text_contains_any(user_skills, contest_keywords)
        if matched:
            score += 20 + _keyword_bonus(len(matched), 2, 8)
            matched_points.append("기술 스택 연관")
            reasons.append(f"기술 스택과 연결되는 키워드가 보입니다: {', '.join(sorted(matched)[:4])}")

        matched = text_contains_any(user_major, contest_keywords)
        if matched:
            score += 20 + _keyword_bonus(len(matched), 1, 5)
            matched_points.append("전공 관련성")
            reasons.append(f"전공과 관련된 표현이 포함되어 있습니다: {', '.join(sorted(matched)[:4])}")

        matched = text_contains_any(user_certificates, contest_keywords)
        if matched:
            score += 10 + _keyword_bonus(len(matched), 1, 3)
            matched_points.append("자격증 연관")
            reasons.append(f"보유 자격증과 이어지는 키워드가 있습니다: {', '.join(sorted(matched)[:4])}")

        matched = text_contains_any(user_awards, contest_keywords)
        if matched:
            score += 10 + _keyword_bonus(len(matched), 1, 3)
            matched_points.append("수상 내역 연관")
            reasons.append(f"수상 경험과 비슷한 맥락의 키워드가 있습니다: {', '.join(sorted(matched)[:4])}")

        matched = text_contains_any(user_career, contest_keywords)
        if matched:
            score += 15 + _keyword_bonus(len(matched), 1, 4)
            matched_points.append("희망 진로 연관")
            reasons.append(f"희망 진로와 가까운 내용이 보입니다: {', '.join(sorted(matched)[:4])}")

        matched = text_contains_any(user_fields, split_keywords(category))
        if matched:
            score += 25 + _keyword_bonus(len(matched), 2, 6)
            matched_points.append("희망 공모전 분야 일치")
            reasons.append(f"희망 공모전 분야와 직접 맞닿아 있습니다: {', '.join(sorted(matched)[:4])}")

        end_date = contest.get("end_date")
        if end_date:
            days_left = (end_date - today).days
            if days_left < 0:
                score -= 20
                reasons.append("이미 마감된 일정이라 추천 점수를 낮췄습니다.")
            elif days_left <= 7:
                score += 8
                matched_points.append("곧 마감")
                reasons.append("마감이 가까워 바로 도전하기 좋은 일정입니다.")
            elif days_left <= 30:
                score += 4

        if use_qwen_recommender() and contest_keywords:
            qwen_overlap = text_contains_any(
                user_interests | user_skills | user_major | user_fields | user_career,
                contest_keywords,
            )
            if qwen_overlap:
                score += _keyword_bonus(len(qwen_overlap), 2, 10)
                matched_points.append("Qwen 키워드 보강")
                reasons.append(f"Qwen 키워드 분석에서도 유사성이 확인되었습니다: {', '.join(sorted(qwen_overlap)[:4])}")
            elif qwen_status:
                reasons.append(qwen_status)

        if not reasons:
            reasons.append("직접 일치하는 키워드는 적지만 탐색 후보로 확인해볼 만한 공모전입니다.")
        if not matched_points:
            matched_points.append("기본 추천")

        results.append(
            {
                "contest": contest,
                "score": score,
                "reason": " ".join(reasons),
                "matched_points": matched_points,
            }
        )

    return sorted(results, key=lambda item: (item["score"], item["contest"].get("end_date") or today), reverse=True)
