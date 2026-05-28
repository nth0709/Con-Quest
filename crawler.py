from __future__ import annotations

import csv
import json
import os
import random
import re
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qs, urljoin, urlparse

import requests
import urllib3
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from urllib3.util.retry import Retry

ROOT_DIR = Path(__file__).resolve().parent
CSV_PATH = ROOT_DIR / "contests.csv"
FRONTEND_JSON_PATH = ROOT_DIR / "src" / "data" / "contests.json"
BACKEND_JSON_PATH = ROOT_DIR / "backend" / "data" / "contests.json"

CSV_COLUMNS = ["contest_name", "organizer", "deadline", "link", "source_site"]
DEFAULT_POSTER = (
    "https://images.unsplash.com/photo-1516321497487-e288fb19713f"
    "?auto=format&fit=crop&w=1200&q=80"
)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/135.0.0.0 Safari/537.36 ConQuestBot/1.0"
)
AGGREGATOR_DOMAINS = {
    "linkareer.com",
    "www.linkareer.com",
    "wevity.com",
    "www.wevity.com",
    "thinkcontest.com",
    "www.thinkcontest.com",
}
INVALID_LINK_KEYWORDS = ("facebook.com/wevity/app",)

LINKAREER_MAX_PAGES = int(os.getenv("LINKAREER_MAX_PAGES", "4"))
WEVITY_MAX_PAGES = int(os.getenv("WEVITY_MAX_PAGES", "10"))
WEVITY_MAX_CATEGORIES = int(os.getenv("WEVITY_MAX_CATEGORIES", "1"))
THINKGOOD_MAX_PAGES = int(os.getenv("THINKGOOD_MAX_PAGES", "3"))
REQUEST_DELAY = float(os.getenv("CRAWLER_DELAY", "0.12"))
REQUEST_TIMEOUT = int(os.getenv("CRAWLER_TIMEOUT", "20"))

SOURCE_LINKAREER = "링커리어"
SOURCE_WEVITY = "위비티"
SOURCE_THINKGOOD = "씽굿"


def build_session() -> requests.Session:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    session = requests.Session()
    session.trust_env = False
    session.verify = False
    retry = Retry(
        total=3,
        read=3,
        connect=3,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://www.google.com/",
        }
    )
    return session


def polite_sleep() -> None:
    time.sleep(REQUEST_DELAY + random.uniform(0.0, 0.08))


def fetch_html(session: requests.Session, url: str) -> str:
    polite_sleep()
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.text


def clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").replace("\u200b", "").strip()


def normalize_date(raw_value: str | None) -> str:
    text = clean_text(raw_value)
    if not text:
        return ""

    normalized = (
        text.replace("년", "-")
        .replace("월", "-")
        .replace("일", "")
        .replace("/", "-")
        .replace(".", "-")
        .replace("~", " ~ ")
    )
    normalized = re.sub(r"\s+", " ", normalized)

    full_dates = re.findall(r"(20\d{2})-(\d{1,2})-(\d{1,2})", normalized)
    if full_dates:
        year, month, day = full_dates[-1]
        try:
            return date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            return ""

    short_dates = re.findall(r"(?<!\d)(\d{1,2})-(\d{1,2})(?!\d)", normalized)
    if short_dates:
        month, day = short_dates[-1]
        today = date.today()
        for year in (today.year, today.year + 1):
            try:
                candidate = date(year, int(month), int(day))
            except ValueError:
                continue
            if candidate >= today - timedelta(days=120):
                return candidate.isoformat()

    compact_dates = re.findall(r"(20\d{2})(\d{2})(\d{2})", normalized)
    if compact_dates:
        year, month, day = compact_dates[-1]
        try:
            return date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            return ""

    dday = re.search(r"D\s*-\s*(\d+)", text, flags=re.IGNORECASE)
    if dday:
        return (date.today() + timedelta(days=int(dday.group(1)))).isoformat()

    if "오늘마감" in text or text.upper() == "D-DAY":
        return date.today().isoformat()

    return ""


def is_external_link(url: str) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    if parsed.netloc.lower() in AGGREGATOR_DOMAINS:
        return False
    if any(token in url.lower() for token in INVALID_LINK_KEYWORDS):
        return False
    return True


def normalize_absolute_url(url: str, base_url: str) -> str:
    absolute = urljoin(base_url, (url or "").strip())
    return clean_text(absolute)


def pick_best_image(soup: BeautifulSoup, detail_url: str) -> str:
    candidates = []
    for selector in (
        "meta[property='og:image']",
        "meta[name='twitter:image']",
        ".view_top img",
        ".thumb img",
        ".poster img",
        ".img-wrap img",
        "img",
    ):
        node = soup.select_one(selector)
        if not node:
            continue
        raw_url = node.get("content") if node.name == "meta" else node.get("src")
        url = normalize_absolute_url(raw_url or "", detail_url)
        if url.startswith("http"):
            candidates.append(url)

    return candidates[0] if candidates else DEFAULT_POSTER


def looks_like_homepage_text(text: str) -> bool:
    return any(keyword in text for keyword in ("공식", "홈페이지", "접수", "지원", "신청", "상세", "바로가기"))


def pick_official_link(soup: BeautifulSoup, detail_url: str) -> str:
    scored = []
    for anchor in soup.select("a[href]"):
        href = normalize_absolute_url(anchor.get("href", ""), detail_url)
        if not href.startswith("http"):
            continue
        text = clean_text(anchor.get_text(" ", strip=True))
        score = 0
        if is_external_link(href):
            score += 8
        if looks_like_homepage_text(text):
            score += 4
        if any(keyword in href.lower() for keyword in ("apply", "contest", "event", "entry", "form")):
            score += 2
        scored.append((score, href))

    scored.sort(key=lambda item: item[0], reverse=True)
    for _, href in scored:
        if is_external_link(href):
            return href
    return detail_url


def extract_title(soup: BeautifulSoup, fallback: str = "") -> str:
    selectors = (
        "meta[property='og:title']",
        "meta[name='title']",
        "h1",
        "h2",
        ".title",
        ".tit_view",
        ".view_title",
        "title",
    )
    for selector in selectors:
        node = soup.select_one(selector)
        if not node:
            continue
        value = clean_text(node.get("content")) if node.name == "meta" else clean_text(node.get_text(" ", strip=True))
        if value:
            value = re.sub(r"\s*[-|]\s*(WEVITY|위비티|링커리어|Linkareer|공모전 대외활동 콘테스트).*$", "", value, flags=re.IGNORECASE)
            value = re.sub(r"\s*\|\s*공모전 대외활동.*$", "", value)
            return clean_text(value)
    return clean_text(fallback)


def extract_description(soup: BeautifulSoup, organizer: str) -> str:
    meta = soup.select_one("meta[property='og:description'], meta[name='description']")
    if meta:
        content = clean_text(meta.get("content"))
        if content:
            return content

    for selector in (".view_cont", ".detail-cont", ".txt_area", ".board-view", ".entry-content"):
        node = soup.select_one(selector)
        if node:
            content = clean_text(node.get_text(" ", strip=True))
            if content:
                return content[:1000]

    return f"{organizer}에서 진행하는 공모전입니다."


def extract_organizer(page_text: str) -> str:
    patterns = (
        r"주최\s*/\s*주관\s*[:：]?\s*([^\n]+)",
        r"주최기관\s*[:：]?\s*([^\n]+)",
        r"주최\s*[:：]?\s*([^\n]+)",
        r"주관\s*[:：]?\s*([^\n]+)",
        r"기관명\s*[:：]?\s*([^\n]+)",
    )
    for pattern in patterns:
        match = re.search(pattern, page_text)
        if match:
            return clean_text(match.group(1)).split("조회")[0].strip()
    return ""


def extract_deadline(page_text: str) -> str:
    patterns = (
        r"접수기간\s*[:：]?\s*([^\n]+)",
        r"모집기간\s*[:：]?\s*([^\n]+)",
        r"공고기간\s*[:：]?\s*([^\n]+)",
        r"마감일\s*[:：]?\s*([^\n]+)",
        r"기간\s*[:：]?\s*([^\n]+)",
    )
    for pattern in patterns:
        match = re.search(pattern, page_text)
        if match:
            parsed = normalize_date(match.group(1))
            if parsed:
                return parsed

    dates = re.findall(r"20\d{2}[./-]\d{1,2}[./-]\d{1,2}", page_text)
    if dates:
        return normalize_date(dates[-1])
    return ""


def extract_label_value(page_text: str, labels: Iterable[str]) -> str:
    for label in labels:
        pattern = rf"{re.escape(label)}\s*[:：]?\s*([^\n]+)"
        match = re.search(pattern, page_text, flags=re.IGNORECASE)
        if not match:
            continue
        value = clean_text(match.group(1))
        if value and value not in {"-", "없음", "미정"}:
            return value
    return ""


def extract_period_pair(page_text: str, label: str) -> str:
    pattern = rf"{re.escape(label)}\s*시작일\s*([0-9]{{4}}[./-][0-9]{{1,2}}[./-][0-9]{{1,2}})\s*마감일\s*([0-9]{{4}}[./-][0-9]{{1,2}}[./-][0-9]{{1,2}})"
    match = re.search(pattern, page_text)
    if not match:
        return ""
    return f"{clean_text(match.group(1))} ~ {clean_text(match.group(2))}"


def extract_homepage_from_text(page_text: str) -> str:
    match = re.search(r"(https?://[^\s]+)", page_text)
    return clean_text(match.group(1).rstrip(").,")) if match else ""


def extract_detail_fields(soup: BeautifulSoup, detail_url: str, title: str = "") -> dict[str, str]:
    page_text = soup.get_text("\n", strip=True)
    focused_text = page_text
    for marker in ("공모전 대외활동 정보", title):
        marker = clean_text(marker)
        if marker and marker in focused_text:
            focused_text = focused_text[focused_text.find(marker) :]
            break

    organizer = extract_organizer(focused_text) or extract_organizer(page_text) or "주최사 정보 미상"
    homepage = extract_label_value(focused_text, ("홈페이지", "참가 URL", "접수 URL", "신청 링크"))
    if homepage and not homepage.startswith("http"):
        homepage = ""
    if not homepage:
        homepage = extract_homepage_from_text(focused_text)
    if not is_external_link(homepage):
        homepage = pick_official_link(soup, detail_url)

    recruitment_period = extract_period_pair(focused_text, "접수기간") or extract_label_value(
        focused_text,
        ("접수기간", "모집기간", "공고기간", "신청기간"),
    )
    activity_period = extract_period_pair(focused_text, "활동기간") or extract_label_value(
        focused_text,
        ("활동기간", "행사기간", "대회기간", "참여기간"),
    )
    recruit_count = extract_label_value(focused_text, ("모집인원", "선발인원", "모집규모", "모집 수"))
    region = extract_label_value(focused_text, ("활동지역", "활동장소", "근무지역", "활동장소/지역", "교육장소"))
    target = extract_label_value(focused_text, ("참여대상", "응모대상", "지원자격", "모집대상", "참가대상"))
    category = extract_label_value(focused_text, ("공모분야", "분야", "카테고리"))
    preferred_competency = extract_label_value(focused_text, ("우대역량", "우대사항", "필요역량"))
    benefits = extract_label_value(focused_text, ("활동혜택", "혜택", "특전"))
    prize = extract_label_value(focused_text, ("시상내역", "시상규모", "총 상금", "1등 상금"))

    return {
        "organizer": organizer,
        "deadline": extract_deadline(focused_text) or extract_deadline(page_text),
        "official_link": homepage or detail_url,
        "homepage": homepage or detail_url,
        "image_url": pick_best_image(soup, detail_url),
        "thumbnail_url": pick_best_image(soup, detail_url),
        "recruitment_period": recruitment_period,
        "activity_period": activity_period,
        "recruit_count": recruit_count,
        "region": region,
        "target": target,
        "category": category,
        "preferred_competency": preferred_competency,
        "benefits": benefits,
        "prize": prize or benefits,
        "description": extract_description(soup, organizer),
    }


def normalize_row(
    *,
    contest_name: str,
    organizer: str,
    deadline: str,
    link: str,
    source_site: str,
    extra_fields: dict[str, str] | None = None,
) -> dict[str, str] | None:
    contest_name = clean_text(contest_name)
    organizer = clean_text(organizer)
    deadline = normalize_date(deadline)
    link = clean_text(link)
    extra_fields = extra_fields or {}

    if not contest_name or not organizer or not deadline or not link.startswith("http"):
        return None

    return {
        "contest_name": contest_name,
        "organizer": organizer,
        "deadline": deadline,
        "link": link,
        "source_site": source_site,
        "image_url": clean_text(extra_fields.get("image_url")) or DEFAULT_POSTER,
        "thumbnail_url": clean_text(extra_fields.get("thumbnail_url")) or DEFAULT_POSTER,
        "official_link": clean_text(extra_fields.get("official_link")) or link,
        "homepage": clean_text(extra_fields.get("homepage")) or link,
        "recruitment_period": clean_text(extra_fields.get("recruitment_period")),
        "activity_period": clean_text(extra_fields.get("activity_period")),
        "recruit_count": clean_text(extra_fields.get("recruit_count")),
        "region": clean_text(extra_fields.get("region")),
        "target": clean_text(extra_fields.get("target")),
        "category": clean_text(extra_fields.get("category")),
        "preferred_competency": clean_text(extra_fields.get("preferred_competency")),
        "benefits": clean_text(extra_fields.get("benefits")),
        "prize": clean_text(extra_fields.get("prize")),
        "description": clean_text(extra_fields.get("description")),
    }


def crawl_linkareer() -> list[dict[str, str]]:
    session = build_session()
    results: list[dict[str, str]] = []
    seen_detail_urls: set[str] = set()

    for page in range(1, LINKAREER_MAX_PAGES + 1):
        list_url = f"https://linkareer.com/list/contest?page={page}"
        try:
            html = fetch_html(session, list_url)
        except Exception:
            continue

        detail_urls = []
        for match in re.finditer(r'href="(/activity/\d+)"', html):
            detail_url = urljoin(list_url, match.group(1))
            if detail_url in seen_detail_urls:
                continue
            seen_detail_urls.add(detail_url)
            detail_urls.append(detail_url)

        for detail_url in detail_urls:
            try:
                detail_html = fetch_html(session, detail_url)
                soup = BeautifulSoup(detail_html, "html.parser")
                title = extract_title(soup)
                detail_fields = extract_detail_fields(soup, detail_url, title)
                organizer = detail_fields["organizer"] or "주최사 정보 미상"
                row = normalize_row(
                    contest_name=title,
                    organizer=organizer,
                    deadline=detail_fields["deadline"],
                    link=detail_fields["official_link"],
                    source_site=SOURCE_LINKAREER,
                    extra_fields=detail_fields,
                )
                if row:
                    results.append(row)
            except Exception:
                continue

    return results


def extract_wevity_categories(session: requests.Session) -> list[str]:
    base_url = "https://www.wevity.com/?c=find&s=1&gub=1"
    html = fetch_html(session, base_url)
    categories = [base_url]
    category_urls = []
    for match in re.finditer(r'href="\?c=find&amp;s=1&gub=1&cidx=(\d+)"', html):
        category_urls.append(f"{base_url}&cidx={match.group(1)}")
    for url in list(dict.fromkeys(category_urls))[:WEVITY_MAX_CATEGORIES]:
        categories.append(url)
    return categories


def normalize_wevity_detail_url(raw_url: str) -> str:
    absolute = urljoin("https://www.wevity.com/", raw_url)
    parsed = urlparse(absolute)
    query = parse_qs(parsed.query)
    contest_id = query.get("ix", [""])[0]
    if not contest_id:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}?c=find&s=1&gbn=view&ix={contest_id}"


def crawl_wevity() -> list[dict[str, str]]:
    session = build_session()
    results: list[dict[str, str]] = []
    seen_detail_urls: set[str] = set()

    try:
        category_urls = extract_wevity_categories(session)
    except Exception:
        category_urls = ["https://www.wevity.com/?c=find&s=1&gub=1"]

    for category_url in category_urls:
        for page in range(1, WEVITY_MAX_PAGES + 1):
            list_url = f"{category_url}&gp={page}"
            try:
                html = fetch_html(session, list_url)
            except Exception:
                continue

            detail_urls = []
            for match in re.finditer(r'href="([^"]*ix=\d+[^"]*)"', html):
                detail_url = normalize_wevity_detail_url(match.group(1).replace("&amp;", "&"))
                if not detail_url or detail_url in seen_detail_urls:
                    continue
                seen_detail_urls.add(detail_url)
                detail_urls.append(detail_url)

            for detail_url in detail_urls:
                try:
                    detail_html = fetch_html(session, detail_url)
                    soup = BeautifulSoup(detail_html, "html.parser")
                    title = extract_title(soup)
                    detail_fields = extract_detail_fields(soup, detail_url, title)
                    organizer = detail_fields["organizer"] or "주최사 정보 미상"
                    row = normalize_row(
                        contest_name=title,
                        organizer=organizer,
                        deadline=detail_fields["deadline"],
                        link=detail_fields["official_link"],
                        source_site=SOURCE_WEVITY,
                        extra_fields=detail_fields,
                    )
                    if row:
                        results.append(row)
                except Exception:
                    continue

    return results


def crawl_wevity_fast() -> list[dict[str, str]]:
    """Collect many WEVITY rows from listing pages without slow detail-page fan-out."""
    session = build_session()
    results: list[dict[str, str]] = []
    seen_detail_urls: set[str] = set()

    try:
        category_urls = extract_wevity_categories(session)
    except Exception:
        category_urls = ["https://www.wevity.com/?c=find&s=1&gub=1"]

    for category_url in category_urls:
        for page in range(1, WEVITY_MAX_PAGES + 1):
            list_url = f"{category_url}&gp={page}"
            try:
                html = fetch_html(session, list_url)
            except Exception:
                continue

            soup = BeautifulSoup(html, "html.parser")
            for item in soup.select(".list li"):
                try:
                    if "top" in item.get("class", []):
                        continue
                    anchor = item.select_one(".tit a[href*='ix=']")
                    if not anchor:
                        continue
                    detail_url = normalize_wevity_detail_url(anchor.get("href", "").replace("&amp;", "&"))
                    if not detail_url or detail_url in seen_detail_urls:
                        continue
                    seen_detail_urls.add(detail_url)

                    title = clean_text(anchor.get_text(" ", strip=True))
                    title = re.sub(r"\b(SPECIAL|HOT|NEW)\b", "", title).strip()
                    organizer_node = item.select_one(".organ")
                    day_node = item.select_one(".day")
                    category_node = item.select_one(".sub-tit")
                    organizer = clean_text(organizer_node.get_text(" ", strip=True) if organizer_node else "") or "주최사 정보 미상"
                    deadline = clean_text(day_node.get_text(" ", strip=True) if day_node else "")
                    category = clean_text(category_node.get_text(" ", strip=True) if category_node else "")
                    category = re.sub(r"^분야\s*:\s*", "", category)
                    detail_fields = {
                        "organizer": organizer,
                        "deadline": deadline,
                        "official_link": detail_url,
                        "homepage": detail_url,
                        "image_url": DEFAULT_POSTER,
                        "thumbnail_url": DEFAULT_POSTER,
                        "category": category,
                        "description": f"{organizer}에서 진행하는 공모전입니다. 자세한 내용은 위비티 원문을 확인해 주세요.",
                    }
                    row = normalize_row(
                        contest_name=title,
                        organizer=organizer,
                        deadline=deadline,
                        link=detail_url,
                        source_site=SOURCE_WEVITY,
                        extra_fields=detail_fields,
                    )
                    if row:
                        results.append(row)
                except Exception:
                    continue

    return results


def crawl_thinkgood() -> list[dict[str, str]]:
    session = build_session()
    results: list[dict[str, str]] = []
    seen_keys: set[tuple[str, str, str]] = set()

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1440,2200")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-features=Translate,OptimizationHints,MediaRouter")
    options.add_argument("--remote-debugging-port=0")
    options.add_argument(f"user-agent={USER_AGENT}")

    driver = webdriver.Chrome(options=options)
    try:
        driver.get("https://www.thinkcontest.com/thinkgood/user/contest/index.do")
        WebDriverWait(driver, 20).until(lambda current_driver: len(current_driver.find_elements(By.CSS_SELECTOR, "#dataList tr")) > 0)

        for page in range(1, THINKGOOD_MAX_PAGES + 1):
            if page > 1:
                clicked = False
                for node in driver.find_elements(By.CSS_SELECTOR, "#pagination1 a, #pagination1 button, #pagination1 span"):
                    if clean_text(node.text) == str(page):
                        driver.execute_script("arguments[0].click();", node)
                        clicked = True
                        break
                if not clicked:
                    break
                WebDriverWait(driver, 20).until(
                    lambda current_driver: clean_text(current_driver.find_element(By.CSS_SELECTOR, "#pagination1 .on").text) == str(page)
                )
                time.sleep(0.8)

            rows = driver.find_elements(By.CSS_SELECTOR, "#dataList tr")
            if not rows:
                break

            for row_element in rows:
                try:
                    cells = row_element.find_elements(By.TAG_NAME, "td")
                    if len(cells) < 6:
                        continue

                    title = clean_text(cells[0].text.split("\n")[0])
                    organizer = clean_text(cells[2].text) or "주최사 정보 미상"
                    deadline = normalize_date(cells[4].text)
                    reg_type = row_element.get_attribute("data-reg_type") or "contest"
                    contest_pk = row_element.get_attribute("data-contest_pk") or ""
                    detail_url = (
                        f"https://www.thinkcontest.com/thinkgood/user/{reg_type}/view.do?contest_pk={contest_pk}"
                        if contest_pk
                        else driver.current_url
                    )

                    detail_fields = {
                        "organizer": organizer,
                        "deadline": deadline,
                        "official_link": detail_url,
                        "homepage": detail_url,
                        "image_url": DEFAULT_POSTER,
                        "thumbnail_url": DEFAULT_POSTER,
                        "description": f"{organizer}에서 진행하는 공모전입니다.",
                    }

                    try:
                        detail_html = fetch_html(session, detail_url)
                        soup = BeautifulSoup(detail_html, "html.parser")
                        parsed_fields = extract_detail_fields(soup, detail_url, title)
                        detail_fields.update(parsed_fields)
                        title = title or extract_title(soup)
                        organizer = parsed_fields["organizer"] or organizer
                        deadline = parsed_fields["deadline"] or deadline
                    except Exception:
                        pass

                    row = normalize_row(
                        contest_name=title,
                        organizer=organizer,
                        deadline=deadline,
                        link=detail_fields["official_link"],
                        source_site=SOURCE_THINKGOOD,
                        extra_fields=detail_fields,
                    )
                    if not row:
                        continue

                    dedupe_key = (row["contest_name"], row["organizer"], row["deadline"])
                    if dedupe_key in seen_keys:
                        continue
                    seen_keys.add(dedupe_key)
                    results.append(row)
                except Exception:
                    continue
    finally:
        driver.quit()

    return results


def remove_duplicates(data: list[dict[str, str]]) -> list[dict[str, str]]:
    unique = []
    seen: set[tuple[str, str, str]] = set()

    for row in data:
        key = (row["contest_name"], row["organizer"], row["deadline"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)

    unique.sort(key=lambda item: (item["deadline"], item["contest_name"], item["organizer"]))
    return unique


def row_to_frontend_payload(index: int, row: dict[str, str]) -> dict[str, str | bool | int | list[str]]:
    deadline = row["deadline"]
    organizer = row["organizer"]
    description = row.get("description") or f"{organizer}에서 진행하는 공모전입니다."
    summary = description[:120] if description else f"{organizer}에서 진행하는 공모전입니다."
    official_link = row.get("official_link") or row["link"]
    image_url = row.get("image_url") or DEFAULT_POSTER
    recruit_count = row.get("recruit_count", "")
    region = row.get("region", "")
    target = row.get("target", "")
    category = row.get("category", "")
    benefits = row.get("benefits", "")
    prize = row.get("prize", "") or benefits

    return {
        "id": index,
        "title": row["contest_name"],
        "organizer": organizer,
        "tags": [item for item in (row["source_site"], category) if item],
        "createdAt": deadline,
        "deadline": deadline,
        "startDate": deadline,
        "endDate": deadline,
        "resultDate": deadline,
        "poster": image_url,
        "imageUrl": image_url,
        "thumbnailUrl": row.get("thumbnail_url") or image_url,
        "summary": summary,
        "description": description,
        "host": f"주최: {organizer}",
        "period": row.get("recruitment_period") or f"마감일: {deadline}",
        "bookmarked": False,
        "sourceSite": row["source_site"],
        "link": official_link,
        "originalLink": official_link,
        "officialLink": official_link,
        "homepage": row.get("homepage") or official_link,
        "recruitmentPeriod": row.get("recruitment_period", ""),
        "activityPeriod": row.get("activity_period", ""),
        "recruitmentCount": recruit_count,
        "recruitCount": recruit_count,
        "activityRegion": region,
        "region": region,
        "preferredCompetency": row.get("preferred_competency", ""),
        "benefits": benefits,
        "participationTarget": target,
        "target": target,
        "category": category,
        "prize": prize,
    }


def build_frontend_json_rows(data: list[dict[str, str]]) -> list[dict[str, str | bool | int | list[str]]]:
    return [row_to_frontend_payload(index, row) for index, row in enumerate(data, start=1)]


def save_to_csv(data: list[dict[str, str]]) -> None:
    with CSV_PATH.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(
            {
                "contest_name": row["contest_name"],
                "organizer": row["organizer"],
                "deadline": row["deadline"],
                "link": row["link"],
                "source_site": row["source_site"],
            }
            for row in data
        )


def save_to_json(data: list[dict[str, str]]) -> None:
    payload = build_frontend_json_rows(data)
    FRONTEND_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    BACKEND_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    FRONTEND_JSON_PATH.write_text(serialized, encoding="utf-8")
    BACKEND_JSON_PATH.write_text(serialized, encoding="utf-8")


def load_existing_source_rows() -> dict[str, list[dict[str, str]]]:
    existing: dict[str, list[dict[str, str]]] = {
        SOURCE_LINKAREER: [],
        SOURCE_WEVITY: [],
        SOURCE_THINKGOOD: [],
    }
    if not FRONTEND_JSON_PATH.exists():
        return existing

    try:
        rows = json.loads(FRONTEND_JSON_PATH.read_text(encoding="utf-8"))
    except Exception:
        return existing

    if not isinstance(rows, list):
        return existing

    for row in rows:
        source_site = clean_text(str(row.get("sourceSite", "")))
        if source_site not in existing:
            continue
        existing[source_site].append(
            {
                "contest_name": clean_text(str(row.get("title") or row.get("contest_name") or "")),
                "organizer": clean_text(str(row.get("organizer") or "")),
                "deadline": clean_text(str(row.get("deadline") or "")),
                "link": clean_text(str(row.get("officialLink") or row.get("originalLink") or row.get("link") or "")),
                "source_site": source_site,
                "image_url": clean_text(str(row.get("imageUrl") or row.get("poster") or DEFAULT_POSTER)),
                "thumbnail_url": clean_text(str(row.get("thumbnailUrl") or row.get("imageUrl") or row.get("poster") or DEFAULT_POSTER)),
                "official_link": clean_text(str(row.get("officialLink") or row.get("originalLink") or row.get("link") or "")),
                "homepage": clean_text(str(row.get("homepage") or row.get("officialLink") or row.get("link") or "")),
                "recruitment_period": clean_text(str(row.get("recruitmentPeriod") or row.get("period") or "")),
                "activity_period": clean_text(str(row.get("activityPeriod") or "")),
                "recruit_count": clean_text(str(row.get("recruitCount") or row.get("recruitmentCount") or "")),
                "region": clean_text(str(row.get("region") or row.get("activityRegion") or "")),
                "target": clean_text(str(row.get("target") or row.get("participationTarget") or "")),
                "category": clean_text(str(row.get("category") or "")),
                "preferred_competency": clean_text(str(row.get("preferredCompetency") or "")),
                "benefits": clean_text(str(row.get("benefits") or "")),
                "prize": clean_text(str(row.get("prize") or row.get("benefits") or "")),
                "description": clean_text(str(row.get("description") or row.get("summary") or "")),
            }
        )
    return existing


def crawl_with_fallback(
    source_name: str,
    crawler_fn,
    fallback_rows: list[dict[str, str]],
) -> list[dict[str, str]]:
    try:
        rows = crawler_fn()
        if rows:
            return rows
    except Exception as error:
        print(f"{source_name} 크롤링 실패, 기존 데이터로 대체합니다: {error}")
    return fallback_rows


def print_summary(site_rows: dict[str, list[dict[str, str]]], deduped: list[dict[str, str]]) -> None:
    print(f"{SOURCE_LINKAREER}: {len(site_rows[SOURCE_LINKAREER])}개")
    print(f"{SOURCE_WEVITY}: {len(site_rows[SOURCE_WEVITY])}개")
    print(f"{SOURCE_THINKGOOD}: {len(site_rows[SOURCE_THINKGOOD])}개")
    print(f"전체: {len(deduped)}개")
    if FRONTEND_JSON_PATH.exists():
        payload = json.loads(FRONTEND_JSON_PATH.read_text(encoding="utf-8"))
        print(f"contests.json: {len(payload)}개")


def main() -> None:
    existing_rows = load_existing_source_rows()
    site_rows = {
        SOURCE_LINKAREER: crawl_with_fallback(SOURCE_LINKAREER, crawl_linkareer, existing_rows[SOURCE_LINKAREER]),
        SOURCE_WEVITY: crawl_with_fallback(SOURCE_WEVITY, crawl_wevity_fast, existing_rows[SOURCE_WEVITY]),
        SOURCE_THINKGOOD: crawl_with_fallback(SOURCE_THINKGOOD, crawl_thinkgood, existing_rows[SOURCE_THINKGOOD]),
    }

    merged = site_rows[SOURCE_LINKAREER] + site_rows[SOURCE_WEVITY] + site_rows[SOURCE_THINKGOOD]
    deduped = remove_duplicates(merged)
    save_to_csv(deduped)
    save_to_json(deduped)
    print_summary(site_rows, deduped)


if __name__ == "__main__":
    main()
