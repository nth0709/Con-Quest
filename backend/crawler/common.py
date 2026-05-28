from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any

CSV_HEADERS = ["공모전이름", "주최사", "마감일", "링크"]

_PLACEHOLDER_TITLES = {
    "",
    "-",
    "정보 없음",
    "제목 없음",
    "공모전",
}


def parse_date_or_none(value: Any) -> date | None:
    """Parse common crawler date strings into a date object."""
    if isinstance(value, date):
        return value
    if value is None:
        return None

    text = str(value).strip()
    if not text or text in {"-", "정보 없음", "미정"}:
        return None

    normalized = (
        text.replace(".", "-")
        .replace("/", "-")
        .replace("년", "-")
        .replace("월", "-")
        .replace("일", "")
    )
    normalized = re.sub(r"\s+", " ", normalized)

    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(normalized[:19], fmt).date()
        except ValueError:
            pass

    full_match = re.search(r"(20\d{2})\D+(\d{1,2})\D+(\d{1,2})", normalized)
    if full_match:
        year, month, day = map(int, full_match.groups())
        try:
            return date(year, month, day)
        except ValueError:
            return None

    short_match = re.search(r"(?<!\d)(\d{1,2})\D+(\d{1,2})(?!\d)", normalized)
    if short_match:
        month, day = map(int, short_match.groups())
        today = date.today()
        for year in (today.year, today.year + 1):
            try:
                parsed = date(year, month, day)
            except ValueError:
                continue
            if parsed >= today - timedelta(days=120):
                return parsed

    return None


def invalid_title_reason(title: Any) -> str:
    text = re.sub(r"\s+", " ", str(title or "")).strip()
    if text in _PLACEHOLDER_TITLES:
        return "empty_or_placeholder"
    if len(text) < 2:
        return "too_short"
    return ""


def is_valid_contest_title(title: Any) -> bool:
    return invalid_title_reason(title) == ""

