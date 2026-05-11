from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class UserRegister(BaseModel):
    username: str
    password: str
    name: str
    email: EmailStr


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    name: str
    birth_date: Optional[date]
    email: str
    major: str
    interests: str
    certificates: str
    awards: str
    preferred_fields: str
    desired_career: str
    points: int
    profile_theme: str
    profile_border: str
    profile_badge: str
    profile_title: str

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class ContestOut(BaseModel):
    id: int
    title: str
    organizer: str
    category: str
    start_date: Optional[date]
    end_date: Optional[date]
    source_site: str
    original_link: str
    description: str
    required_skills: str
    is_scrapped: bool = False

    model_config = ConfigDict(from_attributes=True)


class ContestSearchResponse(BaseModel):
    total: int
    items: List[ContestOut]


class CsvContestRow(BaseModel):
    공모전이름: str
    주최사: str
    마감일: str
    링크: str


class MessageResponse(BaseModel):
    message: str


class CalendarEvent(BaseModel):
    contest_id: int
    title: str
    end_date: Optional[date]
    source_site: str
    color: str
    organizer: str
    category: str
    description: str
    original_link: str


class RecommendationRequest(BaseModel):
    name: str = ""
    interests: str = ""
    major: str = ""
    skills: str = ""
    certificates: str = ""
    awards: str = ""
    desired_career: str = ""
    preferred_fields: str = ""


class RecommendationItem(BaseModel):
    contest: ContestOut
    score: int
    reason: str
    matched_points: List[str]


class QuestOut(BaseModel):
    id: int
    title: str
    description: str
    reward_points: int
    condition_type: str
    is_completed: bool = False
    completed_at: Optional[datetime] = None


class CommunityPostCreate(BaseModel):
    title: str
    content: str
    category: str


class CommentCreate(BaseModel):
    content: str


class CommentOut(BaseModel):
    id: int
    content: str
    created_at: datetime
    user_name: str


class CommunityPostSummary(BaseModel):
    id: int
    title: str
    content: str
    category: str
    created_at: datetime
    likes: int
    user_name: str
    comment_count: int


class CommunityPostDetail(CommunityPostSummary):
    comments: List[CommentOut]


class MyPageUpdate(BaseModel):
    name: Optional[str] = None
    birth_date: Optional[date] = None
    email: Optional[EmailStr] = None
    major: Optional[str] = None
    interests: Optional[str] = None
    certificates: Optional[str] = None
    awards: Optional[str] = None
    preferred_fields: Optional[str] = None
    desired_career: Optional[str] = None


class EquipItemRequest(BaseModel):
    item_id: int


class ProfileItemOut(BaseModel):
    id: int
    name: str
    type: str
    required_points: int
    value: str
    is_owned: bool
    is_equipped: bool


class MyPageResponse(BaseModel):
    user: UserOut
    scraps_count: int
    completed_quests_count: int
    items: List[ProfileItemOut]
