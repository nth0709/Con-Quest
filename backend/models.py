from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    name = Column(String(100), nullable=False)
    birth_date = Column(Date, nullable=True)
    email = Column(String(255), unique=True, nullable=False)
    major = Column(String(100), default="")
    interests = Column(Text, default="")
    skills = Column(Text, default="")
    certificates = Column(Text, default="")
    awards = Column(Text, default="")
    preferred_fields = Column(Text, default="")
    desired_career = Column(String(100), default="")
    available_period = Column(String(100), default="")
    points = Column(Integer, default=0)
    profile_theme = Column(String(50), default="sky")
    profile_border = Column(String(50), default="glow")
    profile_badge = Column(String(50), default="rookie")
    profile_title = Column(String(50), default="탐험가")

    scraps = relationship("Scrap", back_populates="user", cascade="all, delete-orphan")
    quests = relationship("UserQuest", back_populates="user", cascade="all, delete-orphan")
    posts = relationship("CommunityPost", back_populates="user")
    comments = relationship("Comment", back_populates="user")


class Contest(Base):
    __tablename__ = "contests"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    organizer = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    source_site = Column(String(50), nullable=False)
    original_link = Column(String(500), nullable=False)
    description = Column(Text, default="")
    required_skills = Column(Text, default="")

    scraps = relationship("Scrap", back_populates="contest", cascade="all, delete-orphan")


class Scrap(Base):
    __tablename__ = "scraps"
    __table_args__ = (UniqueConstraint("user_id", "contest_id", name="uq_user_contest_scrap"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    contest_id = Column(Integer, ForeignKey("contests.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="scraps")
    contest = relationship("Contest", back_populates="scraps")


class Quest(Base):
    __tablename__ = "quests"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    reward_points = Column(Integer, default=0)
    condition_type = Column(String(100), nullable=False, unique=True)

    users = relationship("UserQuest", back_populates="quest", cascade="all, delete-orphan")


class UserQuest(Base):
    __tablename__ = "user_quests"
    __table_args__ = (UniqueConstraint("user_id", "quest_id", name="uq_user_quest"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    quest_id = Column(Integer, ForeignKey("quests.id"), nullable=False)
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="quests")
    quest = relationship("Quest", back_populates="users")


class CommunityPost(Base):
    __tablename__ = "community_posts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    category = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    likes = Column(Integer, default=0)

    user = relationship("User", back_populates="posts")
    comments = relationship("Comment", back_populates="post", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("community_posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    post = relationship("CommunityPost", back_populates="comments")
    user = relationship("User", back_populates="comments")


class ProfileItem(Base):
    __tablename__ = "profile_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)
    required_points = Column(Integer, default=0)
    value = Column(String(100), nullable=False)


class UserProfileItem(Base):
    __tablename__ = "user_profile_items"
    __table_args__ = (UniqueConstraint("user_id", "item_id", name="uq_user_item"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("profile_items.id"), nullable=False)
    is_equipped = Column(Boolean, default=False)
