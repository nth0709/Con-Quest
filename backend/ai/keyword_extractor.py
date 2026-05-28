from __future__ import annotations

import re
from typing import Iterable

_STOP_WORDS = {
    "and",
    "the",
    "for",
    "with",
    "from",
    "정보",
    "공모전",
    "모집",
    "지원",
    "대상",
    "기간",
}


def split_keywords(value: str | Iterable[str] | None) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, str):
        tokens = re.split(r"[,/|#\s]+", value)
    else:
        tokens = [str(item) for item in value]
    return {token.strip().lower() for token in tokens if token and token.strip()}


def extract_keywords(text: str | None) -> set[str]:
    words = re.findall(r"[0-9A-Za-z가-힣+#.]{2,}", text or "")
    return {word.lower() for word in words if word.lower() not in _STOP_WORDS}

