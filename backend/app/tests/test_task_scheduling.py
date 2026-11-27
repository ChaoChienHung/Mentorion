from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.db.base import Base
from backend.app.db.dependency import get_db
from backend.app.db.models import Note as DBNote, Task as DBTask, User as DBUser
from backend.app.main import app


def _make_test_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), TestingSessionLocal


def _seed_note_and_task(SessionLocal, scheduled_date: str = "2026-11-20"):
    db = SessionLocal()
    try:
        user = db.query(DBUser).filter(DBUser.email == "local@mentorion.app").first()
        if not user:
            user = DBUser(
                username="local",
                email="local@mentorion.app",
                hashed_password="local",
                is_active=True,
                created_at=datetime.now().isoformat(),
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        note = DBNote(
            user_id=user.id,
            title="Anchor Date Test Note",
            content="Spaced repetition scheduling test.",
            category="AI",
            type="new",
            pattern="C",
            first_date=scheduled_date,
            ease_factor=2.5,
            interval_days=0,
            repetitions=0,
            created_at=datetime.now().isoformat(),
        )
        db.add(note)
        db.commit()
        db.refresh(note)

        task = DBTask(
            note_id=note.id,
            type="new",
            scheduled_date=scheduled_date,
            revision_number=0,
            is_completed=0,
            is_archived=0,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return note.id, task.id
    finally:
        db.close()


def test_complete_task_defaults_to_scheduled_date_anchor():
    client, SessionLocal = _make_test_client()
    try:
        note_id, task_id = _seed_note_and_task(SessionLocal, scheduled_date="2026-11-20")

        # Omit anchorOption -> should default to "B" (scheduled_date: 2026-11-20 + 7d = 2026-11-27)
        res = client.post(
            f"/api/tasks/{task_id}/complete",
            json={
                "nextIntervalDays": 7,
                "actualDate": "2026-11-25",
            },
        )
        assert res.status_code == 200

        db = SessionLocal()
        try:
            note = db.query(DBNote).filter(DBNote.id == note_id).first()
            assert note.next_review_date == "2026-11-27"
            next_task = (
                db.query(DBTask)
                .filter(DBTask.note_id == note_id, DBTask.is_completed == 0)
                .first()
            )
            assert next_task is not None
            assert next_task.scheduled_date == "2026-11-27"
        finally:
            db.close()
    finally:
        app.dependency_overrides.clear()


def test_complete_task_actual_date_anchor_option_a():
    client, SessionLocal = _make_test_client()
    try:
        note_id, task_id = _seed_note_and_task(SessionLocal, scheduled_date="2026-11-20")

        # Explicit anchorOption="A" -> should add from actualDate (2026-11-25 + 7d = 2026-12-02)
        res = client.post(
            f"/api/tasks/{task_id}/complete",
            json={
                "nextIntervalDays": 7,
                "anchorOption": "A",
                "actualDate": "2026-11-25",
            },
        )
        assert res.status_code == 200

        db = SessionLocal()
        try:
            note = db.query(DBNote).filter(DBNote.id == note_id).first()
            assert note.next_review_date == "2026-12-02"
            next_task = (
                db.query(DBTask)
                .filter(DBTask.note_id == note_id, DBTask.is_completed == 0)
                .first()
            )
            assert next_task is not None
            assert next_task.scheduled_date == "2026-12-02"
        finally:
            db.close()
    finally:
        app.dependency_overrides.clear()


def test_complete_task_sm2_defaults_to_scheduled_date_anchor():
    client, SessionLocal = _make_test_client()
    try:
        note_id, task_id = _seed_note_and_task(SessionLocal, scheduled_date="2026-11-20")

        # SM-2 first repetition (repetitions=0, rating=4 -> interval=1 day from 2026-11-20 = 2026-11-21)
        res = client.post(
            f"/api/tasks/{task_id}/complete",
            json={
                "rating": 4,
                "actualDate": "2026-11-25",
            },
        )
        assert res.status_code == 200

        db = SessionLocal()
        try:
            note = db.query(DBNote).filter(DBNote.id == note_id).first()
            assert note.next_review_date == "2026-11-21"
        finally:
            db.close()
    finally:
        app.dependency_overrides.clear()
