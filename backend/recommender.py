from __future__ import annotations

import math
import re
from collections import Counter
from datetime import date

TOKEN_RE = re.compile(r"[0-9A-Za-z가-힣+#.]{2,}")
STOP_WORDS = {
    "공모전",
    "모집",
    "지원",
    "대상",
    "기간",
    "정보",
    "주최",
    "the",
    "and",
    "for",
    "with",
}


def _tokens(text: str | None) -> list[str]:
    return [token.lower() for token in TOKEN_RE.findall(text or "") if token.lower() not in STOP_WORDS]


def _vector(text: str | None) -> Counter[str]:
    return Counter(_tokens(text))


def _cosine(left: Counter[str], right: Counter[str]) -> float:
    if not left or not right:
        return 0.0
    common = set(left) & set(right)
    numerator = sum(left[token] * right[token] for token in common)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if not left_norm or not right_norm:
        return 0.0
    return numerator / (left_norm * right_norm)


def _profile_text(user_profile: dict) -> str:
    return " ".join(
        str(user_profile.get(key, ""))
        for key in (
            "name",
            "interests",
            "major",
            "skills",
            "certificates",
            "awards",
            "desired_career",
            "preferred_fields",
        )
    )


def _contest_text(contest: dict) -> str:
    return " ".join(
        str(contest.get(key, ""))
        for key in ("title", "organizer", "category", "description", "required_skills")
    )


def calculate_recommendation(user_profile: dict, contests: list[dict]) -> list[dict]:
    """Tiny local recommender: tokenizes profile/contest text and ranks by cosine similarity."""
    today = date.today()
    profile_vector = _vector(_profile_text(user_profile))
    profile_terms = set(profile_vector)
    results: list[dict] = []

    for contest in contests:
        contest_vector = _vector(_contest_text(contest))
        contest_terms = set(contest_vector)
        similarity = _cosine(profile_vector, contest_vector)
        matched = sorted(profile_terms & contest_terms)

        score = int(round(similarity * 100))
        reasons: list[str] = []
        matched_points: list[str] = []

        if matched:
            bonus = min(len(matched) * 4, 24)
            score += bonus
            matched_points.append("프로필 키워드 일치")
            reasons.append(f"마이페이지 정보와 겹치는 키워드가 있습니다: {', '.join(matched[:5])}")

        end_date = contest.get("end_date")
        if end_date:
            days_left = (end_date - today).days
            if days_left < 0:
                score -= 20
                reasons.append("이미 마감된 일정이라 추천 점수를 낮췄습니다.")
            elif days_left <= 7:
                score += 8
                matched_points.append("마감 임박")
                reasons.append("마감이 가까워 바로 확인하기 좋은 공모전입니다.")
            elif days_left <= 30:
                score += 4

        if not reasons:
            reasons.append("직접 일치 키워드는 적지만 탐색 후보로 볼 만한 공모전입니다.")
        if not matched_points:
            matched_points.append("AI 탐색 후보")

        results.append(
            {
                "contest": contest,
                "score": score,
                "reason": " ".join(reasons),
                "matched_points": matched_points,
            }
        )

    return sorted(
        results,
        key=lambda item: (item["score"], item["contest"].get("end_date") or today),
        reverse=True,
    )

