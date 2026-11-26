from .base import Base
from sqlalchemy.types import JSON
from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean

class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    data = Column(JSON)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(String, nullable=False)

class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, server_default="1")
    source_doc_id = Column(String, nullable=True, index=True)
    title = Column(String, nullable=False, index=True)
    content = Column(String, nullable=False, default="")
    category = Column(String, nullable=False, default="Other")
    type = Column(String, nullable=False, default="new")
    pattern = Column(String, nullable=False, default="C")
    created_at = Column(String, nullable=False)
    first_date = Column(String, nullable=False)
    ease_factor = Column(Float, nullable=False, default=2.5)
    interval_days = Column(Integer, nullable=False, default=0)
    repetitions = Column(Integer, nullable=False, default=0)

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)
    scheduled_date = Column(String, nullable=False)
    revision_number = Column(Integer, nullable=False, default=0)
    time_start = Column(String, nullable=True)
    time_end = Column(String, nullable=True)
    is_completed = Column(Integer, nullable=False, default=0)
    completed_at = Column(String, nullable=True)
    is_archived = Column(Integer, nullable=False, default=0)
    user_rating = Column(Integer, nullable=True)
    gcal_event_id = Column(String, nullable=True)

class ReviewLog(Base):
    __tablename__ = "review_logs"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="SET NULL"), nullable=True)
    time = Column(String, nullable=False)
    grade = Column(Integer, nullable=False)
    feedback = Column(String, nullable=True)

class JournalEvent(Base):
    __tablename__ = "journal_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, server_default="1")
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    remarks = Column(String, nullable=True)
    event_date = Column(String, nullable=False)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(String, nullable=False)

