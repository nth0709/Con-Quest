from __future__ import annotations

import csv
from datetime import date, datetime
import json
from pathlib import Path
from typing import Optional

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session

from crawler.common import CSV_HEADERS, is_valid_contest_title, invalid_title_reason, parse_date_or_none
from crawler.linkareer import fetch_contests as fetch_linkareer
from crawler.thinkgood import fetch_contests as fetch_thinkgood
from crawler.webity import fetch_contests as fetch_webity
from database import Base, SessionLocal, engine, get_db
from models import Comment, CommunityPost, Contest, ProfileItem, Quest, Scrap, User, UserProfileItem, UserQuest
from recommender import calculate_recommendation
from schemas import (
    AuthResponse,
    CalendarEvent,
    CommentCreate,
    CommentOut,
    CommunityPostCreate,
    CommunityPostDetail,
    CommunityPostSummary,
    ContestOut,
    ContestSearchResponse,
    CsvContestRow,
    EquipItemRequest,
    MessageResponse,
    MyPageResponse,
    MyPageUpdate,
    ProfileItemOut,
    QuestOut,
    RecommendationItem,
    RecommendationRequest,
    UserLogin,
    UserOut,
    UserRegister,
)


APP_TITLE = "ConQuest API"
DATA_DIR = Path(__file__).resolve().parent / "data"
SAMPLE_PATH = DATA_DIR / "sample_contests.json"
CSV_PATH = DATA_DIR / "contests.csv"

SITE_COLORS = {
    "링커리어": "#4f46e5",
    "씽굿": "#0ea5e9",
    "위비티": "#8b5cf6",
    "기타": "#64748b",
}


app = FastAPI(title=APP_TITLE, version="0.4.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_sample_payload() -> list[dict]:
    return json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))


def normalize_contest_payload(contest: dict, fallback_source: Optional[str] = None) -> dict:
    title = str(contest.get("title") or contest.get("공모전이름") or "").strip()
    organizer = str(contest.get("organizer") or contest.get("주최사") or "").strip() or "정보 없음"
    start_date_raw = contest.get("start_date") or contest.get("startDate") or contest.get("createdAt")
    end_date_raw = contest.get("end_date") or contest.get("endDate") or contest.get("deadline") or contest.get("마감일")
    original_link = str(
        contest.get("original_link")
        or contest.get("originalLink")
        or contest.get("officialLink")
        or contest.get("link")
        or contest.get("homepage")
        or contest.get("링크")
        or ""
    ).strip() or "정보 없음"
    source_site = str(contest.get("source_site") or contest.get("sourceSite") or fallback_source or "기타").strip() or "기타"
    return {
        "title": title,
        "organizer": organizer,
        "category": str(contest.get("category", "")).strip() or "공모전",
        "start_date": str(start_date_raw).strip() if start_date_raw else None,
        "end_date": str(end_date_raw).strip() if end_date_raw else None,
        "source_site": source_site,
        "original_link": original_link,
        "description": str(contest.get("description", "")).strip() or f"{title} 관련 공모전입니다.",
        "required_skills": str(contest.get("required_skills", "")).strip(),
    }


def write_contests_csv(rows: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=CSV_HEADERS)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "정보 없음") for header in CSV_HEADERS})


def read_contests_csv() -> list[dict]:
    if not CSV_PATH.exists():
        return []
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def contest_model_to_csv_row(contest: Contest) -> dict[str, str]:
    return {
        "공모전이름": contest.title,
        "주최사": contest.organizer or "정보 없음",
        "마감일": contest.end_date.isoformat() if contest.end_date else "정보 없음",
        "링크": contest.original_link or "정보 없음",
    }


def export_db_contests_to_csv(db: Session) -> list[dict]:
    contests = [contest for contest in db.query(Contest).all() if is_valid_contest_title(contest.title)]
    contests.sort(key=lambda item: (item.end_date is None, item.end_date or date.max, item.id))
    rows = [contest_model_to_csv_row(contest) for contest in contests]
    write_contests_csv(rows)
    return rows


def cleanup_invalid_contests(db: Session) -> int:
    invalid_rows = [contest for contest in db.query(Contest).all() if invalid_title_reason(contest.title)]
    deleted_count = len(invalid_rows)
    for row in invalid_rows:
        db.delete(row)
    if deleted_count:
        db.commit()
    return deleted_count


def seed_quests(db: Session) -> None:
    quests = [
        ("첫 회원가입 완료", "회원가입을 완료하고 ConQuest 여정을 시작하세요.", 50, "signup"),
        ("관심 분야 최초 입력", "마이페이지에서 관심 분야를 처음 입력하세요.", 30, "profile_interest"),
        ("첫 공모전 스크랩", "마음에 드는 공모전을 처음 스크랩해보세요.", 40, "first_scrap"),
        ("AI 추천 공모전 확인하기", "추천 페이지에서 맞춤 공모전을 확인하세요.", 40, "view_recommendation"),
        ("전체 캘린더 최초 확인", "전체 캘린더에서 마감 일정을 확인하세요.", 20, "view_calendar_all"),
        ("개인 캘린더 최초 확인", "내 캘린더에서 스크랩 일정만 모아보세요.", 20, "view_calendar_my"),
        ("커뮤니티 첫 글 작성", "커뮤니티에 첫 게시글을 작성하세요.", 50, "first_post"),
        ("마감 임박 공모전 스크랩", "7일 이내 마감 공모전을 스크랩해보세요.", 60, "urgent_scrap"),
        ("공모전 3개 이상 스크랩", "공모전을 3개 이상 스크랩하세요.", 70, "scrap_three"),
        ("프로필 꾸미기 아이템 최초 적용", "프로필 아이템을 한 번 장착해보세요.", 30, "equip_item"),
    ]
    for title, description, reward_points, condition_type in quests:
        exists = db.query(Quest).filter(Quest.condition_type == condition_type).first()
        if not exists:
            db.add(Quest(title=title, description=description, reward_points=reward_points, condition_type=condition_type))
    db.commit()


def seed_profile_items(db: Session) -> None:
    items = [
        ("Sky Quest", "theme", 0, "sky"),
        ("Aurora Night", "theme", 120, "aurora"),
        ("Glow Ring", "border", 0, "glow"),
        ("Pixel Frame", "border", 80, "pixel"),
        ("Rookie Badge", "badge", 0, "rookie"),
        ("Data Hero", "badge", 150, "data-hero"),
        ("탐험가", "title", 0, "탐험가"),
        ("퀘스트 마스터", "title", 200, "퀘스트 마스터"),
    ]
    for name, item_type, required_points, value in items:
        exists = db.query(ProfileItem).filter(ProfileItem.name == name, ProfileItem.type == item_type).first()
        if not exists:
            db.add(ProfileItem(name=name, type=item_type, required_points=required_points, value=value))
    db.commit()


def insert_contests(db: Session, contests: list[dict]) -> int:
    inserted = 0
    for raw_contest in contests:
        contest = normalize_contest_payload(raw_contest)
        if not is_valid_contest_title(contest["title"]):
            continue
        exists = (
            db.query(Contest)
            .filter(Contest.title == contest["title"], Contest.source_site == contest["source_site"])
            .first()
        )
        if exists:
            continue
        db.add(
            Contest(
                title=contest["title"],
                organizer=contest["organizer"],
                category=contest["category"],
                start_date=parse_date_or_none(contest["start_date"]),
                end_date=parse_date_or_none(contest["end_date"]),
                source_site=contest["source_site"],
                original_link=contest["original_link"],
                description=contest["description"],
                required_skills=contest["required_skills"],
            )
        )
        inserted += 1
    db.commit()
    return inserted


def load_sample_contests(db: Session, force: bool = False) -> int:
    if not force and db.query(Contest).count() > 0:
        return 0
    inserted = insert_contests(db, load_sample_payload())
    export_db_contests_to_csv(db)
    return inserted


def ensure_user_quest_rows(db: Session, user: User) -> None:
    quest_ids = {row.quest_id for row in db.query(UserQuest).filter(UserQuest.user_id == user.id).all()}
    for quest in db.query(Quest).all():
        if quest.id not in quest_ids:
            db.add(UserQuest(user_id=user.id, quest_id=quest.id))
    db.commit()


def ensure_user_items(db: Session, user: User) -> None:
    owned_ids = {row.item_id for row in db.query(UserProfileItem).filter(UserProfileItem.user_id == user.id).all()}
    for item in db.query(ProfileItem).filter(ProfileItem.required_points == 0).all():
        if item.id not in owned_ids:
            db.add(UserProfileItem(user_id=user.id, item_id=item.id, is_equipped=False))
    db.commit()


def complete_quest_if_needed(db: Session, user: User, condition_type: str) -> None:
    quest = db.query(Quest).filter(Quest.condition_type == condition_type).first()
    if not quest:
        return
    user_quest = db.query(UserQuest).filter(UserQuest.user_id == user.id, UserQuest.quest_id == quest.id).first()
    if user_quest and not user_quest.is_completed:
        user_quest.is_completed = True
        user_quest.completed_at = datetime.utcnow()
        user.points += quest.reward_points
        db.commit()


def unlock_items(db: Session, user: User) -> None:
    owned_ids = {row.item_id for row in db.query(UserProfileItem).filter(UserProfileItem.user_id == user.id).all()}
    for item in db.query(ProfileItem).all():
        if user.points >= item.required_points and item.id not in owned_ids:
            db.add(UserProfileItem(user_id=user.id, item_id=item.id, is_equipped=False))
    db.commit()


def contest_to_schema(contest: Contest, scrapped_ids: set[int]) -> ContestOut:
    return ContestOut(
        id=contest.id,
        title=contest.title,
        organizer=contest.organizer,
        category=contest.category,
        start_date=contest.start_date,
        end_date=contest.end_date,
        source_site=contest.source_site,
        original_link=contest.original_link,
        description=contest.description,
        required_skills=contest.required_skills,
        is_scrapped=contest.id in scrapped_ids,
    )


def build_calendar_events(contests: list[Contest]) -> list[CalendarEvent]:
    events: list[CalendarEvent] = []
    for contest in contests:
        if not contest.end_date:
            continue
        events.append(
            CalendarEvent(
                contest_id=contest.id,
                title=contest.title,
                end_date=contest.end_date,
                source_site=contest.source_site,
                color=SITE_COLORS.get(contest.source_site, SITE_COLORS["기타"]),
                organizer=contest.organizer,
                category=contest.category,
                description=contest.description,
                original_link=contest.original_link,
            )
        )
    return events


def ensure_contests_exist(db: Session) -> None:
    if db.query(Contest).count() == 0:
        load_sample_contests(db, force=True)
    elif not CSV_PATH.exists():
        export_db_contests_to_csv(db)


def build_posts_summary(posts: list[CommunityPost]) -> list[CommunityPostSummary]:
    return [
        CommunityPostSummary(
            id=post.id,
            title=post.title,
            content=post.content,
            category=post.category,
            created_at=post.created_at,
            likes=post.likes,
            user_name=post.user.name,
            comment_count=len(post.comments),
        )
        for post in posts
    ]


def get_current_user(
    x_user_id: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = x_user_id
    if not token and authorization:
        scheme, _, value = authorization.partition(" ")
        token = value if scheme.lower() == "bearer" else authorization
    if not token:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    user = db.query(User).filter(User.id == int(token)).first()
    if not user:
        raise HTTPException(status_code=401, detail="유효하지 않은 사용자입니다.")
    ensure_user_quest_rows(db, user)
    ensure_user_items(db, user)
    unlock_items(db, user)
    return user


def run_crawl_pipeline(db: Session) -> dict[str, object]:
    crawler_results = [fetch_linkareer(), fetch_thinkgood(), fetch_webity()]
    per_site_logs: list[str] = []
    total_inserted = 0
    total_valid_items = 0
    fallback_used = False

    deleted_before = cleanup_invalid_contests(db)
    if deleted_before:
        per_site_logs.append(f"cleanup_before={deleted_before}")

    for result in crawler_results:
        site_name = result["site"]
        normalized_items = [normalize_contest_payload(item, fallback_source=site_name) for item in result.get("items", [])]
        valid_items = [item for item in normalized_items if is_valid_contest_title(item["title"])]
        inserted = insert_contests(db, valid_items) if valid_items else 0
        total_inserted += inserted
        total_valid_items += len(valid_items)

        log_line = (
            f"{site_name} "
            f"urls={len(result.get('requested_urls', []))} "
            f"status={result.get('status_codes', [])} "
            f"html={result.get('html_lengths', [])} "
            f"candidates={result.get('candidate_count', len(normalized_items))} "
            f"valid={len(valid_items)} "
            f"filtered={result.get('filtered_out_count', 0)} "
            f"db_saved={inserted}"
        )
        if result.get("error"):
            log_line += f" error={result['error']}"
        per_site_logs.append(log_line)
        print(f"[crawl] {log_line}")

    if total_valid_items == 0:
        sample_items = [normalize_contest_payload(item) for item in load_sample_payload()]
        valid_sample_items = [item for item in sample_items if is_valid_contest_title(item["title"])]
        inserted = insert_contests(db, valid_sample_items)
        total_inserted += inserted
        fallback_used = True
        per_site_logs.append(f"fallback=sample_contests.json valid={len(valid_sample_items)} db_saved={inserted}")
        print(f"[crawl] fallback=sample_contests.json valid={len(valid_sample_items)} db_saved={inserted}")

    deleted_after = cleanup_invalid_contests(db)
    csv_rows = export_db_contests_to_csv(db)
    per_site_logs.append(f"csv_saved={len(csv_rows)} fallback_used={fallback_used} cleanup_after={deleted_after}")
    print(f"[crawl] csv_saved={len(csv_rows)} fallback_used={fallback_used} cleanup_after={deleted_after}")

    return {
        "message": " | ".join(per_site_logs),
        "inserted": total_inserted,
        "csv_saved_count": len(csv_rows),
        "fallback_used": fallback_used,
        "deleted_before": deleted_before,
        "deleted_after": deleted_after,
        "site_logs": per_site_logs,
    }


def initialize_application_data() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_quests(db)
        seed_profile_items(db)
        load_sample_contests(db)
        demo_user = db.query(User).filter(User.username == "demo").first()
        if not demo_user:
            demo_user = User(
                username="demo",
                password="demo1234",
                name="데모 유저",
                email="demo@conquest.app",
                interests="AI, 데이터, 공공문제",
                major="컴퓨터공학",
                skills="Python, React, SQL",
                certificates="빅데이터분석기사",
                awards="해커톤 수상",
                preferred_fields="앱개발, 데이터",
                desired_career="서비스 기획자",
            )
            db.add(demo_user)
            db.commit()
            db.refresh(demo_user)
        ensure_user_quest_rows(db, demo_user)
        ensure_user_items(db, demo_user)
        complete_quest_if_needed(db, demo_user, "signup")
        ensure_contests_exist(db)
    finally:
        db.close()


@app.on_event("startup")
def on_startup() -> None:
    initialize_application_data()


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "ConQuest backend is running"}


@app.post("/api/v1/auth/signup", response_model=AuthResponse)
@app.post("/auth/register", response_model=AuthResponse)
def register(payload: UserRegister, db: Session = Depends(get_db)) -> AuthResponse:
    username = payload.username or payload.id
    email = payload.email or f"{username}@conquest.local"
    if not username:
        raise HTTPException(status_code=400, detail="아이디를 입력해주세요.")
    duplicate = db.query(User).filter(or_(User.username == username, User.email == email)).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="이미 존재하는 아이디 또는 이메일입니다.")
    user = User(username=username, password=payload.password, name=payload.name, email=email)
    db.add(user)
    db.commit()
    db.refresh(user)
    ensure_user_quest_rows(db, user)
    ensure_user_items(db, user)
    complete_quest_if_needed(db, user, "signup")
    token = str(user.id)
    return AuthResponse(token=token, accessToken=token, user=user)


@app.post("/api/v1/auth/login", response_model=AuthResponse)
@app.post("/auth/login", response_model=AuthResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> AuthResponse:
    username = payload.username or payload.id
    user = db.query(User).filter(User.username == username, User.password == payload.password).first()
    if not user:
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")
    token = str(user.id)
    return AuthResponse(token=token, accessToken=token, user=user)


@app.get("/api/v1/users/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return current_user


@app.patch("/api/v1/users/me", response_model=UserOut)
def patch_me(payload: MyPageUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserOut:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    if current_user.interests:
        complete_quest_if_needed(db, current_user, "profile_interest")
    return current_user


@app.patch("/api/v1/user/xp")
def patch_user_xp(
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    delta = int(payload.get("deltaXp") or payload.get("delta_xp") or 0)
    current_user.points = max(0, int(current_user.points or 0) + delta)
    db.commit()
    db.refresh(current_user)
    unlock_items(db, current_user)
    return {"ok": True, "totalXp": current_user.points, "totalXpDelta": delta}


@app.get("/api/v1/contests", response_model=ContestSearchResponse)
@app.get("/contests", response_model=ContestSearchResponse)
def get_contests(
    source: Optional[str] = None,
    category: Optional[str] = None,
    sort: str = "latest",
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None),
) -> ContestSearchResponse:
    ensure_contests_exist(db)
    query = db.query(Contest)
    if source and source != "전체":
        query = query.filter(Contest.source_site == source)
    if category:
        query = query.filter(Contest.category.contains(category))
    if search:
        query = query.filter(
            or_(
                Contest.title.contains(search),
                Contest.organizer.contains(search),
                Contest.description.contains(search),
            )
        )
    contests = [contest for contest in query.all() if is_valid_contest_title(contest.title)]
    if sort == "deadline":
        contests.sort(key=lambda item: (item.end_date is None, item.end_date or date.max))
    else:
        contests.sort(key=lambda item: (item.start_date or date.min, item.id), reverse=True)
    scrapped_ids: set[int] = set()
    if x_user_id and x_user_id.isdigit():
        scrapped_ids = {row.contest_id for row in db.query(Scrap).filter(Scrap.user_id == int(x_user_id)).all()}
    items = [contest_to_schema(contest, scrapped_ids) for contest in contests]
    return ContestSearchResponse(total=len(items), items=items)


@app.get("/contests/search", response_model=ContestSearchResponse)
def search_contests(
    keyword: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None),
) -> ContestSearchResponse:
    return get_contests(search=keyword, db=db, x_user_id=x_user_id)


@app.post("/api/v1/contests/crawl", response_model=MessageResponse)
@app.post("/contests/crawl", response_model=MessageResponse)
def crawl_contests(db: Session = Depends(get_db)) -> MessageResponse:
    result = run_crawl_pipeline(db)
    return MessageResponse(message=result["message"])


@app.post("/contests/cleanup", response_model=MessageResponse)
def cleanup_contests(db: Session = Depends(get_db)) -> MessageResponse:
    deleted_count = cleanup_invalid_contests(db)
    export_db_contests_to_csv(db)
    return MessageResponse(message=f"정리 완료: 잘못된 공모전 {deleted_count}건 삭제")


@app.get("/contests/csv", response_model=list[CsvContestRow])
def get_contests_csv(db: Session = Depends(get_db)) -> list[CsvContestRow]:
    ensure_contests_exist(db)
    rows = read_contests_csv()
    if not rows:
        rows = export_db_contests_to_csv(db)
    return [CsvContestRow(**row) for row in rows]


@app.get("/api/v1/contests/{contest_id}", response_model=ContestOut)
@app.get("/contests/{contest_id}", response_model=ContestOut)
def get_contest(contest_id: int, db: Session = Depends(get_db), x_user_id: Optional[str] = Header(default=None)) -> ContestOut:
    contest = db.query(Contest).filter(Contest.id == contest_id).first()
    if not contest or not is_valid_contest_title(contest.title):
        raise HTTPException(status_code=404, detail="공모전을 찾을 수 없습니다.")
    scrapped_ids: set[int] = set()
    if x_user_id and x_user_id.isdigit():
        scrapped_ids = {row.contest_id for row in db.query(Scrap).filter(Scrap.user_id == int(x_user_id)).all()}
    return contest_to_schema(contest, scrapped_ids)


@app.post("/api/v1/users/me/bookmarks/{contest_id}", response_model=MessageResponse)
@app.post("/scraps/{contest_id}", response_model=MessageResponse)
def add_scrap(contest_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MessageResponse:
    contest = db.query(Contest).filter(Contest.id == contest_id).first()
    if not contest or not is_valid_contest_title(contest.title):
        raise HTTPException(status_code=404, detail="공모전을 찾을 수 없습니다.")
    exists = db.query(Scrap).filter(Scrap.user_id == current_user.id, Scrap.contest_id == contest_id).first()
    if exists:
        return MessageResponse(message="이미 스크랩한 공모전입니다.")
    db.add(Scrap(user_id=current_user.id, contest_id=contest_id))
    db.commit()
    complete_quest_if_needed(db, current_user, "first_scrap")
    if contest.end_date and (contest.end_date - date.today()).days <= 7:
        complete_quest_if_needed(db, current_user, "urgent_scrap")
    if db.query(Scrap).filter(Scrap.user_id == current_user.id).count() >= 3:
        complete_quest_if_needed(db, current_user, "scrap_three")
    unlock_items(db, current_user)
    return MessageResponse(message="스크랩에 추가되었습니다.")


@app.delete("/api/v1/users/me/bookmarks/{contest_id}", response_model=MessageResponse)
@app.delete("/scraps/{contest_id}", response_model=MessageResponse)
def delete_scrap(contest_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MessageResponse:
    scrap = db.query(Scrap).filter(Scrap.user_id == current_user.id, Scrap.contest_id == contest_id).first()
    if not scrap:
        raise HTTPException(status_code=404, detail="스크랩 정보를 찾을 수 없습니다.")
    db.delete(scrap)
    db.commit()
    return MessageResponse(message="스크랩을 취소했습니다.")


@app.get("/api/v1/users/me/bookmarks", response_model=list[ContestOut])
@app.get("/scraps/me", response_model=list[ContestOut])
def get_my_scraps(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[ContestOut]:
    contests = (
        db.query(Contest)
        .join(Scrap, Scrap.contest_id == Contest.id)
        .filter(Scrap.user_id == current_user.id)
        .order_by(Contest.end_date.asc())
        .all()
    )
    contests = [contest for contest in contests if is_valid_contest_title(contest.title)]
    scrapped_ids = {contest.id for contest in contests}
    return [contest_to_schema(contest, scrapped_ids) for contest in contests]


@app.get("/api/v1/calendar/all", response_model=list[CalendarEvent])
@app.get("/calendar/all", response_model=list[CalendarEvent])
def get_all_calendar(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[CalendarEvent]:
    complete_quest_if_needed(db, current_user, "view_calendar_all")
    contests = db.query(Contest).filter(Contest.end_date.is_not(None)).order_by(Contest.end_date.asc()).all()
    contests = [contest for contest in contests if is_valid_contest_title(contest.title)]
    return build_calendar_events(contests)


@app.get("/api/v1/calendar/my", response_model=list[CalendarEvent])
@app.get("/calendar/my", response_model=list[CalendarEvent])
def get_my_calendar(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[CalendarEvent]:
    complete_quest_if_needed(db, current_user, "view_calendar_my")
    contests = (
        db.query(Contest)
        .join(Scrap, Scrap.contest_id == Contest.id)
        .filter(Scrap.user_id == current_user.id, Contest.end_date.is_not(None))
        .order_by(Contest.end_date.asc())
        .all()
    )
    contests = [contest for contest in contests if is_valid_contest_title(contest.title)]
    return build_calendar_events(contests)


def _build_recommendation_response(
    payload: RecommendationRequest,
    current_user: User,
    db: Session,
) -> list[RecommendationItem]:
    ensure_contests_exist(db)
    contests = [contest for contest in db.query(Contest).all() if is_valid_contest_title(contest.title)]
    if not contests:
        return []
    recommendation_payload = [
        {
            "id": contest.id,
            "title": contest.title,
            "organizer": contest.organizer,
            "category": contest.category,
            "start_date": contest.start_date,
            "end_date": contest.end_date,
            "source_site": contest.source_site,
            "original_link": contest.original_link,
            "description": contest.description,
            "required_skills": contest.required_skills,
        }
        for contest in contests
    ]
    results = calculate_recommendation(payload.model_dump(), recommendation_payload)[:6]
    complete_quest_if_needed(db, current_user, "view_recommendation")
    scrapped_ids = {row.contest_id for row in db.query(Scrap).filter(Scrap.user_id == current_user.id).all()}
    return [
        RecommendationItem(
            contest=ContestOut(**item["contest"], is_scrapped=item["contest"]["id"] in scrapped_ids),
            score=item["score"],
            reason=item["reason"],
            matched_points=item["matched_points"],
        )
        for item in results
    ]


@app.post("/api/v1/recommendations", response_model=list[RecommendationItem])
@app.post("/recommendations", response_model=list[RecommendationItem])
def get_recommendations(
    payload: RecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RecommendationItem]:
    return _build_recommendation_response(payload, current_user, db)


@app.post("/api/v1/recommend", response_model=list[RecommendationItem])
@app.post("/recommend", response_model=list[RecommendationItem])
def recommend_alias(
    payload: RecommendationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RecommendationItem]:
    return _build_recommendation_response(payload, current_user, db)


@app.get("/api/v1/quests", response_model=list[QuestOut])
@app.get("/quests", response_model=list[QuestOut])
def get_quests(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[QuestOut]:
    quest_map = {row.quest_id: row for row in db.query(UserQuest).filter(UserQuest.user_id == current_user.id).all()}
    return [
        QuestOut(
            id=quest.id,
            title=quest.title,
            description=quest.description,
            reward_points=quest.reward_points,
            condition_type=quest.condition_type,
            is_completed=quest_map.get(quest.id).is_completed if quest.id in quest_map else False,
            completed_at=quest_map.get(quest.id).completed_at if quest.id in quest_map else None,
        )
        for quest in db.query(Quest).all()
    ]


@app.get("/api/v1/quests/me", response_model=list[QuestOut])
@app.get("/quests/me", response_model=list[QuestOut])
def get_my_quests(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[QuestOut]:
    return get_quests(current_user=current_user, db=db)


@app.post("/api/v1/quests/check", response_model=list[QuestOut])
@app.post("/quests/check", response_model=list[QuestOut])
def check_quests(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[QuestOut]:
    if current_user.interests:
        complete_quest_if_needed(db, current_user, "profile_interest")
    if db.query(CommunityPost).filter(CommunityPost.user_id == current_user.id).count() > 0:
        complete_quest_if_needed(db, current_user, "first_post")
    unlock_items(db, current_user)
    return get_quests(current_user=current_user, db=db)


@app.post("/api/v1/quests/complete/{quest_id}", response_model=MessageResponse)
@app.post("/quests/complete/{quest_id}", response_model=MessageResponse)
def complete_quest(quest_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MessageResponse:
    user_quest = db.query(UserQuest).filter(UserQuest.user_id == current_user.id, UserQuest.quest_id == quest_id).first()
    if not user_quest:
        raise HTTPException(status_code=404, detail="퀘스트를 찾을 수 없습니다.")
    if user_quest.is_completed:
        return MessageResponse(message="이미 완료한 퀘스트입니다.")
    quest = db.query(Quest).filter(Quest.id == quest_id).first()
    user_quest.is_completed = True
    user_quest.completed_at = datetime.utcnow()
    current_user.points += quest.reward_points
    db.commit()
    unlock_items(db, current_user)
    return MessageResponse(message="퀘스트를 완료하고 포인트를 획득했습니다.")


@app.get("/api/v1/posts", response_model=list[CommunityPostSummary])
@app.get("/posts", response_model=list[CommunityPostSummary])
def get_posts(db: Session = Depends(get_db)) -> list[CommunityPostSummary]:
    posts = db.query(CommunityPost).order_by(CommunityPost.created_at.desc()).all()
    return build_posts_summary(posts)


@app.post("/api/v1/posts", response_model=CommunityPostSummary)
@app.post("/posts", response_model=CommunityPostSummary)
def create_post(payload: CommunityPostCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> CommunityPostSummary:
    post = CommunityPost(user_id=current_user.id, **payload.model_dump())
    db.add(post)
    db.commit()
    db.refresh(post)
    complete_quest_if_needed(db, current_user, "first_post")
    unlock_items(db, current_user)
    return CommunityPostSummary(
        id=post.id,
        title=post.title,
        content=post.content,
        category=post.category,
        created_at=post.created_at,
        likes=post.likes,
        user_name=current_user.name,
        comment_count=0,
    )


@app.get("/api/v1/posts/{post_id}", response_model=CommunityPostDetail)
@app.get("/posts/{post_id}", response_model=CommunityPostDetail)
def get_post(post_id: int, db: Session = Depends(get_db)) -> CommunityPostDetail:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    return CommunityPostDetail(
        id=post.id,
        title=post.title,
        content=post.content,
        category=post.category,
        created_at=post.created_at,
        likes=post.likes,
        user_name=post.user.name,
        comment_count=len(post.comments),
        comments=[
            CommentOut(id=comment.id, content=comment.content, created_at=comment.created_at, user_name=comment.user.name)
            for comment in post.comments
        ],
    )


@app.post("/api/v1/posts/{post_id}/comments", response_model=CommentOut)
@app.post("/posts/{post_id}/comments", response_model=CommentOut)
def create_comment(
    post_id: int,
    payload: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommentOut:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    comment = Comment(post_id=post_id, user_id=current_user.id, content=payload.content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return CommentOut(id=comment.id, content=comment.content, created_at=comment.created_at, user_name=current_user.name)


@app.post("/api/v1/posts/{post_id}/like", response_model=MessageResponse)
@app.post("/posts/{post_id}/like", response_model=MessageResponse)
def like_post(post_id: int, db: Session = Depends(get_db)) -> MessageResponse:
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    post.likes += 1
    db.commit()
    return MessageResponse(message="좋아요를 반영했습니다.")


@app.get("/api/v1/mypage", response_model=MyPageResponse)
@app.get("/mypage", response_model=MyPageResponse)
def get_mypage(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MyPageResponse:
    owned_map = {row.item_id: row for row in db.query(UserProfileItem).filter(UserProfileItem.user_id == current_user.id).all()}
    items = [
        ProfileItemOut(
            id=item.id,
            name=item.name,
            type=item.type,
            required_points=item.required_points,
            value=item.value,
            is_owned=item.id in owned_map,
            is_equipped=owned_map[item.id].is_equipped if item.id in owned_map else False,
        )
        for item in db.query(ProfileItem).order_by(ProfileItem.type, ProfileItem.required_points).all()
    ]
    return MyPageResponse(
        user=current_user,
        scraps_count=db.query(Scrap).filter(Scrap.user_id == current_user.id).count(),
        completed_quests_count=db.query(UserQuest).filter(UserQuest.user_id == current_user.id, UserQuest.is_completed.is_(True)).count(),
        items=items,
    )


@app.put("/api/v1/mypage", response_model=UserOut)
@app.put("/mypage", response_model=UserOut)
def update_mypage(payload: MyPageUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserOut:
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    if current_user.interests:
        complete_quest_if_needed(db, current_user, "profile_interest")
    return current_user


@app.post("/mypage/equip-item", response_model=MessageResponse)
def equip_item(payload: EquipItemRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MessageResponse:
    row = db.query(UserProfileItem).filter(UserProfileItem.user_id == current_user.id, UserProfileItem.item_id == payload.item_id).first()
    if not row:
        raise HTTPException(status_code=400, detail="보유하지 않은 아이템입니다.")
    item = db.query(ProfileItem).filter(ProfileItem.id == payload.item_id).first()
    all_items = db.query(UserProfileItem).filter(UserProfileItem.user_id == current_user.id).all()
    for candidate in all_items:
        candidate_item = db.query(ProfileItem).filter(ProfileItem.id == candidate.item_id).first()
        if candidate_item and candidate_item.type == item.type:
            candidate.is_equipped = False
    row.is_equipped = True
    if item.type == "theme":
        current_user.profile_theme = item.value
    elif item.type == "border":
        current_user.profile_border = item.value
    elif item.type == "badge":
        current_user.profile_badge = item.value
    elif item.type == "title":
        current_user.profile_title = item.value
    db.commit()
    complete_quest_if_needed(db, current_user, "equip_item")
    unlock_items(db, current_user)
    return MessageResponse(message="프로필 아이템을 장착했습니다.")
