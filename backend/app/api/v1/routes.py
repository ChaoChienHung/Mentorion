from fastapi import APIRouter, Depends, HTTPException
from typing import Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta

from ...schemas.note import Note, NoteRequest
from ...schemas.error import ErrorResponse
from ...schemas.quiz import (
    EssayGradeRequest,
    EssayGradeResponse,
    QuestionSource,
    QuizGenerateRequest,
    QuizLoadRequest,
    QuizQuestionItem,
    QuizResponse,
)
from ...domain.schema_source import (
    DocumentSchemaMapping,
    list_available_schemas,
    load_schema_by_name,
    scan_markdown_source,
    scan_markdown_source_with_report,
)
from ...domain.question_bank import (
    append_questions_for_note,
    get_questions_for_note,
)
from ...domain.quiz_engine import (
    generate_questions_via_function_calling,
    grade_essay_via_function_calling,
    load_inline_schema_questions,
    load_sidecar_questions,
)
from pydantic import BaseModel, Field
from .dependencies import note_service, get_current_user_optional, get_current_user_required
from ...db.dependency import get_db
from ...db.models import (
    Note as DBNote,
    Task as DBTask,
    ReviewLog as DBReviewLog,
    JournalEvent as DBJournalEvent,
    User as DBUser,
    SchemaSource as DBSchemaSource,
    NoteResource as DBNoteResource,
)
from ...core.llm import (
    LLMNotConfiguredError,
    UnsupportedCapabilityError,
    get_llm_status,
    save_provider_api_key,
    set_runtime_provider,
)
from ...domain.resource_researcher import (
    discover_related_resources,
    summarize_scraped_resource,
)
from ...domain.scraper import Scraper
from ...schemas.resources import (
    CrossSourceQuizRequest,
    ExternalReviewRecordRequest,
    ExternalReviewRecordResponse,
    LLMKeySaveRequest,
    LLMProviderSwitchRequest,
    LLMStatusResponse,
    NoteResourceCreate,
    NoteResourceResponse,
    ResourceDiscoverRequest,
    ResourceDiscoverResponse,
    TrackedSourceItem,
    VaultStatusResponse,
)
from ...schemas.user import UserCreate, UserUpdate, UserResponse, Token
from ...core.security import verify_password, get_password_hash, create_access_token
from fastapi.security import OAuth2PasswordRequestForm

router = APIRouter()

def add_days(date_str: str, days: int) -> str:
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    new_dt = dt + timedelta(days=days)
    return new_dt.strftime("%Y-%m-%d")

# -------------
# Auth Endpoints
# -------------

@router.post("/auth/register", response_model=UserResponse, status_code=201)
def register_user(payload: UserCreate, db: Session = Depends(get_db)):
    user = db.query(DBUser).filter((DBUser.email == payload.email) | (DBUser.username == payload.username)).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="A user with this email or username already exists.",
        )
    
    user = DBUser(
        username=payload.username,
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        is_active=True,
        created_at=datetime.utcnow().isoformat()
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/auth/login", response_model=Token)
def login_access_token(
    db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()
):
    user = db.query(DBUser).filter((DBUser.email == form_data.username) | (DBUser.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username/email or password")
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    from datetime import timedelta
    from ...core.config import settings
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": create_access_token(
            user.id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }

@router.post("/auth/test-token", response_model=UserResponse)
def test_token(current_user: DBUser = Depends(get_current_user_required)):
    return current_user

@router.put("/auth/me", response_model=UserResponse)
def update_user(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: DBUser = Depends(get_current_user_required),
):
    if payload.username:
        existing = db.query(DBUser).filter(DBUser.username == payload.username).first()
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = payload.username
    if payload.password:
        current_user.hashed_password = get_password_hash(payload.password)
    db.commit()
    db.refresh(current_user)
    return current_user

@router.delete("/auth/me")
def delete_user(
    db: Session = Depends(get_db),
    current_user: DBUser = Depends(get_current_user_required),
):
    db.delete(current_user)
    db.commit()
    return {"success": True}

# -------------
# Define Routes
# -------------


# --------------------
# Scrape Note from URL
# --------------------

@router.post(
    "/notes/scrape",
    response_model=Note,
    responses={429: {"model": ErrorResponse}},
)
async def scrape_note(request: NoteRequest) -> Note:
    return await note_service.create_note_from_url(request.url)

# ---------------------------
# Parse Note from Raw Content
# ---------------------------
@router.post(
    "/notes/parse",
    response_model=Note,
    responses={429: {"model": ErrorResponse}},
)
def parse_note(request: NoteRequest) -> Note:
    return note_service.parse_note_content(request.raw_content)

# ----------------------------
# Generate Questions from Note
# ----------------------------
@router.post(
    "/notes/generate-questions",
    response_model=Note,
    responses={429: {"model": ErrorResponse}},
)
def generate_questions(note: Note) -> Note:
    return note_service.generate_questions(note)

# ------------------------------
# Format Note to Markdown String
# ------------------------------
@router.post(
    "/notes/format",
    responses={429: {"model": ErrorResponse}},
)
def format_note(note: Note) -> dict:
    from ...domain.parser import format_note_to_markdown
    markdown_content = format_note_to_markdown(note)
    return {"markdown": markdown_content}

# --------------------------
# Get All Notes with Task Counts
# --------------------------
@router.get("/notes")
def get_notes(db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user_optional)):
    sql = """
        SELECT n.id, n.title, n.content, n.category, n.type, n.pattern,
               n.created_at, n.first_date, n.ease_factor, n.interval_days, n.repetitions,
               n.last_reviewed_at, n.next_review_date, n.file_path, n.source_doc_id,
               (SELECT COUNT(*) FROM tasks t WHERE t.note_id = n.id AND t.is_completed = 1) as completed_tasks,
               (SELECT COUNT(*) FROM tasks t WHERE t.note_id = n.id AND t.is_completed = 0) as pending_tasks
        FROM notes n
        WHERE n.user_id = :user_id
        ORDER BY n.created_at DESC
    """
    result = db.execute(text(sql), {"user_id": current_user.id}).mappings().all()
    return [dict(r) for r in result]

# ---------------------
# Create Note & Tasks
# ---------------------
@router.post("/notes", status_code=201)
def create_note_endpoint(payload: dict, db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user_optional)):
    title = payload.get("title")
    content = payload.get("content", "")
    category = payload.get("category", "Other")
    type_val = payload.get("type", "new")
    pattern = payload.get("pattern", "C")
    first_date = payload.get("first_date")
    time_start = payload.get("time_start")
    time_end = payload.get("time_end")
    
    if not title:
        raise HTTPException(status_code=400, detail="Title is required.")
        
    now_str = datetime.now().isoformat()
    target_date = first_date if first_date else now_str.split("T")[0]
    
    # 1. Insert note
    db_note = DBNote(
        user_id=current_user.id,
        title=title,
        content=content,
        category=category,
        type=type_val,
        pattern=pattern,
        created_at=now_str,
        first_date=target_date,
        ease_factor=2.5,
        interval_days=0,
        repetitions=0
    )
    db.add(db_note)
    db.commit()
    db.refresh(db_note)
    
    # 2. Insert primary task
    primary_task = DBTask(
        note_id=db_note.id,
        type=type_val,
        scheduled_date=target_date,
        revision_number=0,
        time_start=time_start,
        time_end=time_end,
        is_completed=0,
        is_archived=0
    )
    db.add(primary_task)
    
    # 3. Pre-schedule revisions
    if type_val == "new":
        if pattern == "A":
            intervals = [2, 4, 8, 16, 32]
            for idx, days in enumerate(intervals):
                rev_date = add_days(target_date, days)
                db_task = DBTask(
                    note_id=db_note.id,
                    type="revision",
                    scheduled_date=rev_date,
                    revision_number=idx + 1,
                    time_start=time_start,
                    time_end=time_end,
                    is_completed=0,
                    is_archived=0
                )
                db.add(db_task)
        elif pattern == "B":
            intervals = [3, 9, 27, 81, 243]
            for idx, days in enumerate(intervals):
                rev_date = add_days(target_date, days)
                db_task = DBTask(
                    note_id=db_note.id,
                    type="revision",
                    scheduled_date=rev_date,
                    revision_number=idx + 1,
                    time_start=time_start,
                    time_end=time_end,
                    is_completed=0,
                    is_archived=0
                )
                db.add(db_task)
        elif pattern == "C":
            rev_date = add_days(target_date, 1)
            db_task = DBTask(
                note_id=db_note.id,
                type="revision",
                scheduled_date=rev_date,
                revision_number=1,
                time_start=time_start,
                time_end=time_end,
                is_completed=0,
                is_archived=0
            )
            db.add(db_task)
            
    # 4. Create journal event
    db_event = DBJournalEvent(
        user_id=current_user.id,
        type="note_created",
        title=f"新增{'筆記' if type_val == 'new' else '練習'}: {title}",
        remarks=f"建立了主題「{title}」，分類：{category}，模式：{pattern}",
        event_date=target_date,
        note_id=db_note.id,
        created_at=now_str
    )
    db.add(db_event)
    db.commit()
    
    return {
        "id": db_note.id,
        "title": title,
        "category": category,
        "type": type_val,
        "pattern": pattern,
        "targetDate": target_date
    }

# -----------------
# Delete Note & Tasks
# -----------------
@router.delete("/notes/{id}")
def delete_note_endpoint(id: int, db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user_optional)):
    db_note = db.query(DBNote).filter(DBNote.id == id, DBNote.user_id == current_user.id).first()
    if not db_note:
        raise HTTPException(status_code=404, detail="Note not found.")
    
    db.delete(db_note)
    db.commit()
    return {"success": True, "message": "Note and associated tasks deleted."}

# ---------------------
# Get Tasks with Filters
# ---------------------
@router.get("/tasks")
def get_tasks(
    date: Optional[str] = None,
    noteId: Optional[int] = None,
    overdue: Optional[str] = None,
    hideArchived: Optional[str] = "1",
    db: Session = Depends(get_db),
    current_user: DBUser = Depends(get_current_user_optional)
):
    query = """
        SELECT t.id, t.note_id, t.type, t.scheduled_date, t.revision_number,
               t.time_start, t.time_end, t.is_completed, t.completed_at, t.is_archived,
               t.user_rating, t.gcal_event_id,
               n.title as note_title, n.content as note_content, n.category as note_category, 
               n.type as note_type, n.pattern as note_pattern, n.first_date as note_first_date,
               n.ease_factor, n.repetitions, n.interval_days,
               (SELECT COUNT(*) FROM tasks t2 WHERE t2.note_id = t.note_id AND t2.is_completed = 1) as series_completed_count,
               (SELECT MAX(t2.completed_at) FROM tasks t2 WHERE t2.note_id = t.note_id AND t2.is_completed = 1 AND t2.id != t.id) as prev_completed_at
        FROM tasks t
        JOIN notes n ON t.note_id = n.id
        WHERE n.user_id = :user_id
    """
    params = {"user_id": current_user.id}
    if date:
        query += " AND t.scheduled_date = :date"
        params["date"] = date
    if noteId:
        query += " AND t.note_id = :noteId"
        params["noteId"] = noteId
    if overdue == "1":
        today_str = datetime.now().strftime("%Y-%m-%d")
        query += " AND t.is_completed = 0 AND t.scheduled_date <= :today"
        params["today"] = today_str
    if hideArchived == "1":
        query += " AND t.is_archived = 0"
        
    query += " ORDER BY t.scheduled_date ASC, t.time_start ASC, t.id ASC"
    
    result = db.execute(text(query), params).mappings().all()
    return [dict(r) for r in result]

# -------------------------
# Complete Task & Schedule Next
# -------------------------
@router.post("/tasks/{id}/complete")
def complete_task_endpoint(id: int, payload: dict, db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user_optional)):
    rating = payload.get("rating")
    next_interval_days = payload.get("nextIntervalDays")
    anchor_option = payload.get("anchorOption", "B")
    actual_date = payload.get("actualDate", datetime.now().strftime("%Y-%m-%d"))
    gcal_event_id = payload.get("gcalEventId")
    
    task = db.query(DBTask).join(DBNote).filter(DBTask.id == id, DBNote.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
        
    note = db.query(DBNote).filter(DBNote.id == task.note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
        
    now_str = datetime.now().isoformat()
    already_completed = bool(task.is_completed)

    # 1. Mark task as completed, preserving the EARLIEST completion date
    task.is_completed = 1
    if not task.completed_at:
        task.completed_at = now_str
    if rating is not None:
        task.user_rating = int(rating)
    if gcal_event_id is not None:
        task.gcal_event_id = gcal_event_id

    # If this exact task was already completed once, do not double-count or spawn duplicate next tasks
    if already_completed:
        db.commit()
        return {"ok": True, "already_completed": True}

    MAX_SM2_INTERVAL_DAYS = 365

    # 2. Spaced Repetition calculation (explicit +Xd quick interval OR SM-2 rating)
    if next_interval_days is not None:
        interval_days = max(1, min(MAX_SM2_INTERVAL_DAYS, int(next_interval_days)))
        note.repetitions = int(note.repetitions or 0) + 1
        note.interval_days = interval_days
        note.last_reviewed_at = task.completed_at
        anchor_date = actual_date if anchor_option == "A" else task.scheduled_date
        next_review_date = add_days(anchor_date, interval_days)
        note.next_review_date = next_review_date

        db.add(
            DBTask(
                note_id=note.id,
                type="revision",
                scheduled_date=next_review_date,
                revision_number=task.revision_number + 1,
                time_start=task.time_start,
                time_end=task.time_end,
                is_completed=0,
                is_archived=0,
            )
        )
        db.add(
            DBReviewLog(
                note_id=note.id,
                time=now_str,
                grade=int(rating) if rating is not None else 4,
                feedback=f"快速完成複習，排程 +{interval_days} 天後再次複習（{next_review_date}）",
            )
        )
    elif note.pattern == "C" and rating is not None:
        grade = int(rating)
        ease_factor = note.ease_factor
        repetitions = note.repetitions
        interval_days = note.interval_days
        
        if grade >= 3:
            if repetitions == 0:
                interval_days = 1
            elif repetitions == 1:
                interval_days = 6
            else:
                interval_days = min(MAX_SM2_INTERVAL_DAYS, int(round(interval_days * ease_factor)))
            repetitions += 1
        else:
            repetitions = 0
            interval_days = 1
            
        ease_factor = ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
        if ease_factor < 1.3:
            ease_factor = 1.3
            
        note.ease_factor = ease_factor
        note.repetitions = repetitions
        note.interval_days = interval_days
        note.last_reviewed_at = task.completed_at
        
        anchor_date = actual_date if anchor_option == "A" else task.scheduled_date
        next_review_date = add_days(anchor_date, interval_days)
        note.next_review_date = next_review_date
        
        # Schedule single next Revision Task
        next_task = DBTask(
            note_id=note.id,
            type="revision",
            scheduled_date=next_review_date,
            revision_number=task.revision_number + 1,
            time_start=task.time_start,
            time_end=task.time_end,
            is_completed=0,
            is_archived=0
        )
        db.add(next_task)
        
        # Create log entry in review_logs
        review_log = DBReviewLog(
            note_id=note.id,
            time=now_str,
            grade=grade,
            feedback=f"第 {task.revision_number} 次複習（評分: {grade}，下一間隔: {interval_days}天）"
        )
        db.add(review_log)
        
    # 3. Create a journal event
    db_event = DBJournalEvent(
        user_id=current_user.id,
        type="review_done",
        title=f"完成任務: {note.title}",
        remarks=f"完成了類型「{task.type}」的學習任務，分類：{note.category}，評分：{rating if rating is not None else 'N/A'}",
        event_date=actual_date,
        note_id=note.id,
        created_at=now_str
    )
    db.add(db_event)
    db.commit()
    
    return {
        "success": True,
        "nextInterval": note.interval_days if note.pattern == "C" else None
    }

# -----------------
# Uncomplete Task
# -----------------
@router.post("/tasks/{id}/uncomplete")
def uncomplete_task_endpoint(id: int, db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user_optional)):
    task = db.query(DBTask).join(DBNote).filter(DBTask.id == id, DBNote.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
        
    note = db.query(DBNote).filter(DBNote.id == task.note_id).first()
    
    # 1. Uncomplete task
    task.is_completed = 0
    task.completed_at = None
    task.user_rating = None
    
    # 2. Delete generated subsequent task
    if note and note.pattern == "C":
        db.query(DBTask).filter(
            DBTask.note_id == task.note_id,
            DBTask.revision_number == task.revision_number + 1,
            DBTask.is_completed == 0
        ).delete()
        
    db.commit()
    return {"success": True}

# ---------------------
# Clear Completed Tasks
# ---------------------
@router.post("/tasks/clear-completed")
def clear_completed_endpoint(db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user_optional)):
    db.query(DBTask).filter(
        DBTask.is_completed == 1,
        DBTask.note_id.in_(db.query(DBNote.id).filter(DBNote.user_id == current_user.id))
    ).update({DBTask.is_archived: 1}, synchronize_session=False)
    db.commit()
    return {"success": True}

# -----------------------
# Shift Note Trajectory
# -----------------------
@router.post("/tasks/shift-trajectory")
def shift_trajectory_endpoint(payload: dict, db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user_optional)):
    note_id = payload.get("noteId")
    shift_days = payload.get("shiftDays")
    
    if not note_id or shift_days is None:
        raise HTTPException(status_code=400, detail="noteId and shiftDays are required.")
        
    note = db.query(DBNote).filter(DBNote.id == note_id, DBNote.user_id == current_user.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
        
    shift_val = int(shift_days)
    uncompleted_tasks = db.query(DBTask).filter(
        DBTask.note_id == note_id,
        DBTask.is_completed == 0
    ).all()
    
    for t in uncompleted_tasks:
        t.scheduled_date = add_days(t.scheduled_date, shift_val)
        
    # Update note first_date if no tasks are completed yet
    completed_count = db.query(DBTask).filter(
        DBTask.note_id == note_id,
        DBTask.is_completed == 1
    ).count()
    
    if completed_count == 0:
        note.first_date = add_days(note.first_date, shift_val)
            
    db.commit()
    return {"success": True, "shifted": len(uncompleted_tasks)}

# --------------------
# Get Journal Events
# --------------------
@router.get("/events")
def get_events(db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user_optional)):
    sql = """
        SELECT e.id, e.type, e.title, e.remarks, e.event_date, e.note_id, e.created_at,
               n.title as note_title 
        FROM journal_events e
        LEFT JOIN notes n ON e.note_id = n.id
        WHERE e.user_id = :user_id
        ORDER BY e.event_date ASC, e.id ASC
    """
    result = db.execute(text(sql), {"user_id": current_user.id}).mappings().all()
    return [dict(r) for r in result]

# -------------------------
# Create Manual Journal Event
# -------------------------
@router.post("/events/manual", status_code=201)
def create_manual_event(payload: dict, db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user_optional)):
    title = payload.get("title")
    remarks = payload.get("remarks")
    event_date = payload.get("event_date")
    note_id = payload.get("noteId")
    
    if not title or not event_date:
        raise HTTPException(status_code=400, detail="Title and event_date are required.")
        
    if note_id:
        note = db.query(DBNote).filter(DBNote.id == note_id, DBNote.user_id == current_user.id).first()
        if not note:
            raise HTTPException(status_code=400, detail="Associated note not found.")
            
    now_str = datetime.now().isoformat()
    db_event = DBJournalEvent(
        user_id=current_user.id,
        type="manual_review",
        title=title,
        remarks=remarks,
        event_date=event_date,
        note_id=note_id,
        created_at=now_str
    )
    db.add(db_event)
    db.commit()
    return {"success": True}

# ----------------------
# Get Rich Statistics
# ----------------------
@router.get("/stats")
def get_stats(db: Session = Depends(get_db), current_user: DBUser = Depends(get_current_user_optional)):
    completed_new = db.query(DBTask).join(DBNote).filter(DBTask.type == "new", DBTask.is_completed == 1, DBNote.user_id == current_user.id).count()
    completed_revision = db.query(DBTask).join(DBNote).filter(DBTask.type == "revision", DBTask.is_completed == 1, DBNote.user_id == current_user.id).count()
    completed_practice = db.query(DBTask).join(DBNote).filter(DBTask.type == "practice", DBTask.is_completed == 1, DBNote.user_id == current_user.id).count()
    
    total_notes = db.query(DBNote).filter(DBNote.user_id == current_user.id).count()
    
    category_sql = """
        SELECT n.category,
               SUM(CASE WHEN t.is_completed = 1 THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN t.is_completed = 0 THEN 1 ELSE 0 END) as uncompleted,
               COUNT(t.id) as total
        FROM notes n
        JOIN tasks t ON n.id = t.note_id
        WHERE n.user_id = :user_id
        GROUP BY n.category
    """
    category_stats = db.execute(text(category_sql), {"user_id": current_user.id}).mappings().all()
    
    completed_tasks_sql = """
        SELECT n.category, t.type, t.time_start, t.time_end
        FROM tasks t
        JOIN notes n ON t.note_id = n.id
        WHERE t.is_completed = 1 AND n.user_id = :user_id
    """
    completed_tasks = db.execute(text(completed_tasks_sql), {"user_id": current_user.id}).mappings().all()
    
    category_time = {}
    for task in completed_tasks:
        duration = 0
        if task["time_start"] and task["time_end"]:
            try:
                sh, sm = map(int, task["time_start"].split(":"))
                eh, em = map(int, task["time_end"].split(":"))
                diff = (eh * 60 + em) - (sh * 60 + sm)
                if diff > 0:
                    duration = diff
            except Exception:
                pass
                
        if duration == 0:
            if task["type"] == "new":
                duration = 45
            elif task["type"] == "revision":
                duration = 20
            elif task["type"] == "practice":
                duration = 30
                
        cat = task["category"]
        category_time[cat] = category_time.get(cat, 0) + duration
        
    categories_with_time = []
    for c in category_stats:
        cat = c["category"]
        categories_with_time.append({
            "category": cat,
            "completed": int(c["completed"] or 0),
            "uncompleted": int(c["uncompleted"] or 0),
            "total": int(c["total"] or 0),
            "timeSpentMinutes": category_time.get(cat, 0)
        })
        
    today_str = datetime.now().strftime("%Y-%m-%d")
    overdue_count = db.query(DBTask).join(DBNote).filter(
        DBTask.type == "revision",
        DBTask.is_completed == 0,
        DBTask.scheduled_date < today_str,
        DBNote.user_id == current_user.id
    ).count()
    
    points_sql = """
        SELECT t.scheduled_date,
               SUM(CASE WHEN t.type = 'new' AND t.is_completed = 1 THEN 1.0
                        WHEN t.type = 'practice' AND t.is_completed = 1 THEN 0.5
                        ELSE 0.0 END) as points
        FROM tasks t
        JOIN notes n ON t.note_id = n.id
        WHERE t.scheduled_date <= :today AND n.user_id = :user_id
        GROUP BY t.scheduled_date
    """
    daily_completed_points = db.execute(text(points_sql), {"today": today_str, "user_id": current_user.id}).mappings().all()
    
    DAILY_GOAL = 5.0
    deficit_points = 0.0
    for day in daily_completed_points:
        pts = float(day["points"] or 0.0)
        if pts < DAILY_GOAL:
            deficit_points += (DAILY_GOAL - pts)
            
    daily_points_sql = """
        SELECT t.scheduled_date,
               SUM(CASE WHEN t.type = 'new' THEN 1.0
                        WHEN t.type = 'practice' THEN 0.5
                        ELSE 0.0 END) as scheduled_points,
               SUM(CASE WHEN t.type = 'new' AND t.is_completed = 1 THEN 1.0
                        WHEN t.type = 'practice' AND t.is_completed = 1 THEN 0.5
                        ELSE 0.0 END) as completed_points
        FROM tasks t
        JOIN notes n ON t.note_id = n.id
        WHERE n.user_id = :user_id
        GROUP BY t.scheduled_date
        ORDER BY t.scheduled_date ASC
    """
    daily_points_list = db.execute(text(daily_points_sql), {"user_id": current_user.id}).mappings().all()
    
    return {
        "totalCompletedNew": completed_new,
        "totalCompletedRevision": completed_revision,
        "totalCompletedPractice": completed_practice,
        "totalNotes": total_notes,
        "categories": categories_with_time,
        "overdueCount": overdue_count,
        "deficitPoints": round(deficit_points, 1),
        "dailyPoints": [
            {
                "scheduled_date": d["scheduled_date"],
                "scheduled_points": float(d["scheduled_points"] or 0.0),
                "completed_points": float(d["completed_points"] or 0.0)
            }
            for d in daily_points_list
        ]
    }


# -------------------------------------------
# User-Customizable Schema Source Sync Routes
# -------------------------------------------

class SchemaMappingRequest(BaseModel):
    source_dir: str
    schema_name: Optional[str] = None
    id_field: str = "id"
    title_field: str = "title"
    summary_field: str = "summary"
    category_field: str = "category"
    review_field: str = "review"
    filename_pattern: str = "*.md"
    only_fresh: bool = True
    create_tasks: bool = False


def _build_mapping(req: SchemaMappingRequest) -> DocumentSchemaMapping:
    if req.schema_name and req.schema_name.strip():
        return load_schema_by_name(req.schema_name.strip())
    return DocumentSchemaMapping(
        id_field=req.id_field.strip() or "id",
        title_field=req.title_field.strip() or "title",
        summary_field=req.summary_field.strip() or "summary",
        category_field=req.category_field.strip() or "category",
        review_field=req.review_field.strip() or "review",
        filename_pattern=req.filename_pattern.strip() or "*.md",
    )


@router.get("/schemas")
def get_available_schemas():
    """Returns all file-driven schemas registered under `Mentorion/schemas/`."""
    return {"schemas": list_available_schemas()}


@router.post("/schema-sync/preview")
def preview_schema_sync(payload: SchemaMappingRequest):
    """Preview valid & schema-failed documents from a file or folder using the selected schema."""
    try:
        docs, failed = scan_markdown_source_with_report(
            payload.source_dir,
            mapping=_build_mapping(payload),
            only_fresh=payload.only_fresh,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "count": len(docs),
        "failed_count": len(failed),
        "documents": [
            {
                "source_doc_id": d.source_doc_id,
                "title": d.title,
                "summary": d.summary,
                "category": d.category,
                "review_status": d.review_status,
                "rel_path": d.rel_path,
            }
            for d in docs
        ],
        "failed": [{"path": f.path, "reason": f.reason} for f in failed],
    }


@router.post("/schema-sync/import")
def import_schema_sync(
    payload: SchemaMappingRequest,
    db: Session = Depends(get_db),
    current_user: Optional[DBUser] = Depends(get_current_user_optional),
):
    """Import valid notes into Mentorion's Library (without auto-creating tasks unless create_tasks=True)."""
    try:
        docs, failed = scan_markdown_source_with_report(
            payload.source_dir,
            mapping=_build_mapping(payload),
            only_fresh=payload.only_fresh,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    user_id = current_user.id if current_user else 1
    today_str = datetime.now().strftime("%Y-%m-%d")
    now_iso = datetime.utcnow().isoformat()
    created_count = 0
    updated_count = 0

    for doc in docs:
        existing = (
            db.query(DBNote)
            .filter(
                DBNote.user_id == user_id,
                DBNote.source_doc_id == doc.source_doc_id,
            )
            .first()
        )
        if existing:
            existing.title = doc.title
            existing.content = doc.body
            existing.category = doc.category
            existing.file_path = doc.abs_path or doc.rel_path
            updated_count += 1
        else:
            note = DBNote(
                user_id=user_id,
                source_doc_id=doc.source_doc_id,
                file_path=doc.abs_path or doc.rel_path,
                question_ids=[],
                title=doc.title,
                content=doc.body,
                category=doc.category,
                type="new",
                pattern="C",
                created_at=now_iso,
                first_date=today_str,
            )
            db.add(note)
            db.flush()
            if payload.create_tasks:
                task = DBTask(
                    note_id=note.id,
                    type="new",
                    scheduled_date=today_str,
                    revision_number=0,
                )
                db.add(task)
            created_count += 1

    db.commit()
    return {
        "ok": True,
        "created": created_count,
        "updated": updated_count,
        "total": len(docs),
        "failed_count": len(failed),
        "failed": [{"path": f.path, "reason": f.reason} for f in failed],
    }


class LibraryNoteCreate(BaseModel):
    title: str
    content: str = ""
    category: str = "General"


@router.post("/library/notes", status_code=201)
def create_library_note(
    payload: LibraryNoteCreate,
    db: Session = Depends(get_db),
    current_user: Optional[DBUser] = Depends(get_current_user_optional),
):
    """
    Creates a standalone flat Markdown note inside Mentorion's `library/` directory
    and indexes it in SQLite (without creating a review task yet).
    """
    import re
    from pathlib import Path
    from ...core.config import settings

    user_id = current_user.id if current_user else 1
    today_str = datetime.now().strftime("%Y-%m-%d")
    now_iso = datetime.utcnow().isoformat()
    clean_title = payload.title.strip()
    clean_category = payload.category.strip() or "General"

    # Persist flat Markdown file under Mentorion/library/<slug>.md
    lib_dir = Path(settings.LIBRARY_DIR)
    lib_dir.mkdir(parents=True, exist_ok=True)
    base_slug = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", clean_title.lower()).strip("-") or "untitled"
    slug = base_slug
    md_path = lib_dir / f"{slug}.md"
    suffix = 2
    while md_path.exists():
        slug = f"{base_slug}-{suffix}"
        md_path = lib_dir / f"{slug}.md"
        suffix += 1

    doc_id = f"note.{slug.replace('-', '_')}"
    fm_lines = [
        "---",
        f"id: {doc_id}",
        f'title: "{clean_title.replace(chr(34), chr(39))}"',
        f'category: "{clean_category.replace(chr(34), chr(39))}"',
        f"created: {today_str}",
        f"updated: {today_str}",
        "---",
        "",
        payload.content or "",
    ]
    md_path.write_text("\n".join(fm_lines).rstrip() + "\n", encoding="utf-8")

    note = DBNote(
        user_id=user_id,
        source_doc_id=doc_id,
        file_path=str(md_path.resolve()),
        question_ids=[],
        title=clean_title,
        content=payload.content,
        category=clean_category,
        type="new",
        pattern="C",
        created_at=now_iso,
        first_date=today_str,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "title": note.title,
        "category": note.category,
        "file_path": note.file_path,
        "source_doc_id": note.source_doc_id,
    }


class ScheduleFromLibraryRequest(BaseModel):
    note_id: int
    type: str = "new"
    pattern: str = "C"
    first_date: str
    time_start: Optional[str] = None
    time_end: Optional[str] = None


@router.post("/tasks/from-note", status_code=201)
def schedule_task_from_library_note(
    payload: ScheduleFromLibraryRequest,
    db: Session = Depends(get_db),
    current_user: Optional[DBUser] = Depends(get_current_user_optional),
):
    """Creates a review schedule/task linked to an existing Library note."""
    user_id = current_user.id if current_user else 1
    note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Library note not found")

    note.type = payload.type
    note.pattern = payload.pattern
    note.first_date = payload.first_date
    note.next_review_date = payload.first_date

    # Schedule ONLY ONE task at a time; increment series counter monotonically (+1)
    max_rev = (
        db.query(DBTask.revision_number)
        .filter(DBTask.note_id == note.id)
        .order_by(DBTask.revision_number.desc())
        .first()
    )
    next_rev_num = (int(max_rev[0]) + 1) if max_rev is not None else 0

    initial_task = DBTask(
        note_id=note.id,
        type=payload.type if next_rev_num == 0 else "revision",
        scheduled_date=payload.first_date,
        revision_number=next_rev_num,
        time_start=payload.time_start,
        time_end=payload.time_end,
    )
    db.add(initial_task)

    db.add(
        DBJournalEvent(
            user_id=user_id,
            type="note_created",
            title=f"Scheduled: {note.title}",
            remarks=f"Pattern {payload.pattern}",
            event_date=payload.first_date,
            note_id=note.id,
            created_at=datetime.utcnow().isoformat(),
        )
    )
    db.commit()
    db.refresh(initial_task)
    return {
        "ok": True,
        "note_id": note.id,
        "task_id": initial_task.id,
        "scheduled_date": payload.first_date,
    }


class MarkReviewedRequest(BaseModel):
    source_doc_id: str
    grade: int = 4
    feedback: str = "Reviewed in Nexus"


@router.post("/schema-sync/mark-reviewed")
def mark_source_doc_reviewed(
    payload: MarkReviewedRequest,
    db: Session = Depends(get_db),
    current_user: Optional[DBUser] = Depends(get_current_user_optional),
):
    """Record a review event in Mentorion when a linked note is marked reviewed in Nexus."""
    user_id = current_user.id if current_user else 1
    note = (
        db.query(DBNote)
        .filter(
            DBNote.user_id == user_id,
            DBNote.source_doc_id == payload.source_doc_id,
        )
        .first()
    )
    if not note:
        return {"ok": True, "synced": False, "reason": "note_not_registered"}

    now_iso = datetime.utcnow().isoformat()
    today_str = datetime.now().strftime("%Y-%m-%d")

    pending_task = (
        db.query(DBTask)
        .filter(DBTask.note_id == note.id, DBTask.is_completed == 0)
        .order_by(DBTask.scheduled_date.asc())
        .first()
    )
    if pending_task:
        pending_task.is_completed = 1
        pending_task.completed_at = now_iso
        pending_task.user_rating = payload.grade

    # Advance SM-2 counters conservatively
    note.repetitions = (note.repetitions or 0) + 1
    if note.repetitions == 1:
        note.interval_days = 1
    elif note.repetitions == 2:
        note.interval_days = 6
    else:
        note.interval_days = max(1, round((note.interval_days or 6) * (note.ease_factor or 2.5)))

    log = DBReviewLog(
        note_id=note.id,
        time=now_iso,
        grade=payload.grade,
        feedback=payload.feedback,
    )
    db.add(log)
    db.add(
        DBJournalEvent(
            user_id=user_id,
            type="review_done",
            title=f"Reviewed: {note.title}",
            remarks=payload.feedback,
            event_date=today_str,
            note_id=note.id,
            created_at=now_iso,
        )
    )
    db.commit()
    return {
        "ok": True,
        "synced": True,
        "note_id": note.id,
        "interval_days": note.interval_days,
        "repetitions": note.repetitions,
    }


# ------------------------------------------------------------------
# Quiz Engine Routes (Centralized Bank + Sidecar + LLM Tools + Essay)
# ------------------------------------------------------------------

@router.post("/quiz/load", response_model=QuizResponse)
def load_quiz_questions(
    payload: QuizLoadRequest,
    db: Session = Depends(get_db),
):
    """
    Loads quiz questions across Mentorion's centralized question bank (`questions.json`
    indexed bidirectionally with `notes.question_ids`), optional read-only sidecars,
    inline schema questions, and LLM Function Calling (`submit_quiz_questions`) with dedup.
    """
    questions: list[QuizQuestionItem] = []
    sources_used: list[QuestionSource] = []

    title = payload.title or ""
    content = payload.content or ""
    source_doc_id = payload.source_doc_id
    db_note: Optional[DBNote] = None

    if payload.note_id is not None:
        db_note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
        if db_note:
            title = title or db_note.title
            content = content or db_note.content
            source_doc_id = source_doc_id or db_note.source_doc_id

            bank_qs = get_questions_for_note(db, db_note)
            if bank_qs:
                questions.extend(bank_qs)
                sources_used.append("bank")

    if payload.source_dir and source_doc_id:
        try:
            sidecar_qs = load_sidecar_questions(payload.source_dir, source_doc_id)
            if sidecar_qs:
                if db_note:
                    added, _ = append_questions_for_note(db, db_note, sidecar_qs)
                    questions.extend(added)
                else:
                    questions.extend(sidecar_qs)
                sources_used.append("sidecar")
        except Exception:
            pass

    if payload.inline_questions:
        inline_qs = load_inline_schema_questions(payload.inline_questions)
        if inline_qs:
            if db_note:
                added, _ = append_questions_for_note(db, db_note, inline_qs)
                questions.extend(added)
            else:
                questions.extend(inline_qs)
            sources_used.append("inline_schema")

    if not questions and payload.generate_if_empty:
        if not content.strip():
            raise HTTPException(status_code=400, detail="Note content is required for LLM quiz generation.")
        try:
            llm_qs = generate_questions_via_function_calling(
                title=title or "Study Note",
                content=content,
                count=payload.count,
                question_types=payload.question_types,
                existing_prompts=[q.prompt for q in questions],
            )
            if db_note:
                added, _ = append_questions_for_note(db, db_note, llm_qs)
                questions.extend(added)
            else:
                questions.extend(llm_qs)
            sources_used.append("llm")
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))

    return QuizResponse(questions=questions, sources_used=sources_used)


@router.post("/quiz/generate", response_model=QuizResponse)
def generate_quiz_questions(
    payload: QuizGenerateRequest,
    db: Session = Depends(get_db),
):
    """Invokes Gemini Function Calling (`submit_quiz_questions`) with dedup & persists to centralized question bank."""
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Note content cannot be empty.")

    db_note: Optional[DBNote] = None
    existing_prompts: list[str] = []
    if payload.note_id is not None:
        db_note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
    elif payload.source_doc_id:
        db_note = db.query(DBNote).filter(DBNote.source_doc_id == payload.source_doc_id).first()
    if db_note:
        existing_prompts = [q.prompt for q in get_questions_for_note(db, db_note)]

    try:
        llm_qs = generate_questions_via_function_calling(
            title=payload.title,
            content=payload.content,
            count=payload.count,
            question_types=payload.question_types,
            existing_prompts=existing_prompts,
            related_concepts=[c.model_dump() for c in payload.related_concepts],
            language=payload.language,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if db_note:
        added, _ = append_questions_for_note(db, db_note, llm_qs)
        all_for_note = get_questions_for_note(db, db_note)
        return QuizResponse(questions=added or all_for_note, sources_used=["llm"])

    return QuizResponse(questions=llm_qs, sources_used=["llm"])


@router.post("/quiz/grade-essay", response_model=EssayGradeResponse)
def grade_essay_question(
    payload: EssayGradeRequest,
    db: Session = Depends(get_db),
):
    """Grades a short_essay / essay answer via Gemini Function Calling and records SM-2 review log."""
    try:
        grade_res = grade_essay_via_function_calling(
            title=payload.title,
            content=payload.content,
            prompt=payload.prompt,
            user_answer=payload.user_answer,
            reference_points=payload.reference_points,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if payload.note_id is not None:
        note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
        if note:
            now_iso = datetime.utcnow().isoformat()
            note.last_reviewed_at = now_iso
            db.add(
                DBReviewLog(
                    note_id=note.id,
                    time=now_iso,
                    grade=grade_res.score,
                    feedback=grade_res.summary_feedback,
                )
            )
            db.commit()

    return grade_res


class SchemaSourceCreate(BaseModel):
    name: str
    source_dir: str
    schema_name: str = "nexus"
    default_pattern: str = "C"
    only_fresh: bool = True


@router.get("/schema-sources")
def list_schema_sources(db: Session = Depends(get_db)):
    rows = db.query(DBSchemaSource).order_by(DBSchemaSource.id.asc()).all()
    return {
        "sources": [
            {
                "id": r.id,
                "name": r.name,
                "source_dir": r.source_dir,
                "schema_name": r.schema_name,
                "default_pattern": r.default_pattern,
                "only_fresh": r.only_fresh,
                "enabled": r.enabled,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


@router.post("/schema-sources", status_code=201)
def create_schema_source(payload: SchemaSourceCreate, db: Session = Depends(get_db)):
    existing = db.query(DBSchemaSource).filter(DBSchemaSource.source_dir == payload.source_dir).first()
    if existing:
        existing.name = payload.name
        existing.schema_name = payload.schema_name
        existing.default_pattern = payload.default_pattern
        existing.only_fresh = payload.only_fresh
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "updated": True}

    row = DBSchemaSource(
        name=payload.name,
        source_dir=payload.source_dir,
        schema_name=payload.schema_name,
        default_pattern=payload.default_pattern,
        only_fresh=payload.only_fresh,
        enabled=True,
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "updated": False}


@router.delete("/schema-sources/{source_id}")
def delete_schema_source(source_id: int, db: Session = Depends(get_db)):
    row = db.query(DBSchemaSource).filter(DBSchemaSource.id == source_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Schema source not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/integrity/check")
def check_path_integrity(db: Session = Depends(get_db)):
    """Checks whether SQLite note file_paths and schema_sources paths/schemas still exist on disk."""
    from pathlib import Path
    import os
    from ...domain.schema_source import SCHEMAS_DIR

    missing_notes = []
    for note in db.query(DBNote).all():
        if note.file_path:
            p = Path(os.path.expanduser(note.file_path))
            if not p.is_file():
                missing_notes.append(
                    {
                        "note_id": note.id,
                        "title": note.title,
                        "source_doc_id": note.source_doc_id,
                        "file_path": note.file_path,
                    }
                )

    missing_sources = []
    for src in db.query(DBSchemaSource).all():
        src_path = Path(os.path.expanduser(src.source_dir))
        schema_path = SCHEMAS_DIR / f"{src.schema_name}.json"
        reasons = []
        if not src_path.exists():
            reasons.append(f"Source path missing: {src.source_dir}")
        if not schema_path.is_file():
            reasons.append(f"Schema file missing: schemas/{src.schema_name}.json")
        if reasons:
            missing_sources.append(
                {
                    "source_id": src.id,
                    "name": src.name,
                    "source_dir": src.source_dir,
                    "schema_name": src.schema_name,
                    "reason": "; ".join(reasons),
                }
            )

    return {
        "ok": len(missing_notes) == 0 and len(missing_sources) == 0,
        "missing_notes": missing_notes,
        "missing_sources": missing_sources,
    }


class UpdateNotePathRequest(BaseModel):
    file_path: str


@router.patch("/library/notes/{note_id}/path")
def update_library_note_path(
    note_id: int,
    payload: UpdateNotePathRequest,
    db: Session = Depends(get_db),
):
    """Updates the file_path of a moved note and refreshes its content if the new path exists."""
    from pathlib import Path
    import os
    from ...domain.schema_source import parse_simple_yaml_frontmatter

    note = db.query(DBNote).filter(DBNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    new_path = Path(os.path.expanduser(payload.file_path)).resolve()
    if not new_path.is_file():
        raise HTTPException(status_code=400, detail=f"File not found: {payload.file_path}")

    _, body = parse_simple_yaml_frontmatter(new_path.read_text(encoding="utf-8"))
    note.file_path = str(new_path)
    note.content = body
    db.commit()
    return {"ok": True, "note_id": note.id, "file_path": note.file_path}


@router.delete("/library/notes/{note_id}")
def delete_library_note(note_id: int, db: Session = Depends(get_db)):
    """Deletes a stale note (and its cascaded tasks) from Mentorion SQLite."""
    note = db.query(DBNote).filter(DBNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"ok": True}


@router.delete("/tasks/{task_id}")
def delete_single_task(
    task_id: int,
    scope: str = "single",  # "single" | "future" | "all"
    db: Session = Depends(get_db),
):
    """
    Deletes scheduled review task(s) without EVER deleting the parent Note in Library:
    - scope='single': deletes only this specific task
    - scope='future': deletes this task and all subsequent uncompleted, unarchived tasks of this note (keeps completed history)
    - scope='all': deletes all unarchived tasks of this note series (pending + un-cleared completed tasks on the calendar,
      deducting those un-cleared tasks from stats, while preserving already-cleared/archived historical records and the Library note)
    """
    task = db.query(DBTask).filter(DBTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    note_id = task.note_id
    target_date = task.scheduled_date
    deleted_count = 0

    if scope == "all":
        # Only delete non-archived (calendar-visible) tasks; cleared/archived historical completions remain intact in stats
        deleted_count = (
            db.query(DBTask)
            .filter(DBTask.note_id == note_id, DBTask.is_archived == 0)
            .delete(synchronize_session=False)
        )
    elif scope == "future":
        # Delete this task + any uncompleted, unarchived tasks on or after its scheduled_date (preserving past completed history)
        deleted_count = (
            db.query(DBTask)
            .filter(
                DBTask.note_id == note_id,
                DBTask.is_archived == 0,
                (DBTask.id == task_id) | ((DBTask.is_completed == 0) & (DBTask.scheduled_date >= target_date)),
            )
            .delete(synchronize_session=False)
        )
    else:
        db.delete(task)
        deleted_count = 1

    db.commit()

    # Recompute parent note's next_review_date from remaining earliest pending task
    note = db.query(DBNote).filter(DBNote.id == note_id).first()
    if note:
        next_pending = (
            db.query(DBTask)
            .filter(DBTask.note_id == note_id, DBTask.is_completed == 0, DBTask.is_archived == 0)
            .order_by(DBTask.scheduled_date.asc())
            .first()
        )
        note.next_review_date = next_pending.scheduled_date if next_pending else None
        db.commit()

    return {"ok": True, "scope": scope, "deleted_count": deleted_count, "note_id": note_id}


class EaseFactorUpdateRequest(BaseModel):
    ease_factor: float = Field(..., ge=1.3, le=3.0)


@router.patch("/notes/{note_id}/ease-factor")
def update_note_ease_factor(
    note_id: int,
    payload: EaseFactorUpdateRequest,
    db: Session = Depends(get_db),
):
    """Allows the learner to manually tune a note's SM-2 Ease Factor (1.30 - 3.00)."""
    note = db.query(DBNote).filter(DBNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.ease_factor = round(float(payload.ease_factor), 2)
    db.commit()
    return {"ok": True, "note_id": note.id, "ease_factor": note.ease_factor}


class ManualQuestionRequest(BaseModel):
    note_id: int
    type: str
    prompt: str
    options: Optional[List[str]] = None
    answer: Optional[Any] = None
    blanks: Optional[List[str]] = None
    rubric: Optional[List[str]] = None
    reference_points: Optional[List[str]] = None
    explanation: Optional[str] = None
    bloom_level: Optional[str] = None


@router.post("/questions/manual", status_code=201)
def create_manual_question(
    payload: ManualQuestionRequest,
    db: Session = Depends(get_db),
):
    """Validates and appends a user-authored question (mcq, fill_in_blank, essay, etc.) to data/questions.json."""
    from ...domain.quiz_engine import validate_questions

    note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    raw_item: dict = {
        "type": payload.type,
        "prompt": payload.prompt.strip(),
        "source": "manual",
    }
    if payload.options is not None:
        raw_item["options"] = [o.strip() for o in payload.options if o.strip()]
    if payload.answer is not None:
        raw_item["answer"] = payload.answer
    if payload.blanks is not None:
        raw_item["blanks"] = [b.strip() for b in payload.blanks if b.strip()]
    if payload.rubric is not None:
        raw_item["rubric"] = [r.strip() for r in payload.rubric if r.strip()]
    if payload.reference_points is not None:
        raw_item["reference_points"] = [r.strip() for r in payload.reference_points if r.strip()]
    if payload.explanation and payload.explanation.strip():
        raw_item["explanation"] = payload.explanation.strip()
    if payload.bloom_level in ("recall", "understand", "apply", "analyze"):
        raw_item["bloom_level"] = payload.bloom_level

    try:
        validated = validate_questions([raw_item], "manual")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid question payload: {exc}")

    added, skipped = append_questions_for_note(db, note, validated)
    if skipped > 0 and not added:
        raise HTTPException(status_code=409, detail="A very similar question already exists for this note.")

    return {
        "ok": True,
        "question": added[0].model_dump() if added else validated[0].model_dump(),
        "total_for_note": len(note.question_ids or []),
    }


class PickPathRequest(BaseModel):
    mode: str = "folder"  # "folder" | "file"


@router.post("/fs/pick")
def pick_local_global_path(payload: PickPathRequest):
    """Opens a native macOS Finder picker to return an exact global file or folder path."""
    import subprocess
    import sys

    if sys.platform != "darwin":
        raise HTTPException(
            status_code=501,
            detail="Native path picker is currently supported on macOS only; please enter the global path manually.",
        )

    script = (
        'POSIX path of (choose folder with prompt "Select Notes Folder")'
        if payload.mode == "folder"
        else 'POSIX path of (choose file with prompt "Select Markdown Note")'
    )
    proc = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return {"cancelled": True, "path": None}
    selected = proc.stdout.strip().rstrip("/")
    return {"cancelled": False, "path": selected}


# -------------------------------------------
# LLM Function Calling Study Coach Routes
# -------------------------------------------

from ...schemas.coach import (
    ApplyCramTasksRequest,
    QuestionAuditRequest,
    QuestionAuditResponse,
    RemediateRequest,
    RemediateResponse,
    RescheduleApplyRequest,
    ReschedulePlanRequest,
    ReschedulePlanResponse,
    SocraticRequest,
    SocraticResponse,
    WeeklyDiagnosisResponse,
)
from ...domain.study_coach import (
    audit_question_bank_via_fc,
    diagnose_study_health_via_fc,
    generate_remediation_via_fc,
    plan_reschedule_via_fc,
    socratic_probe_via_fc,
)
from ...domain.question_bank import update_and_dedup_note_questions


@router.post("/coach/reschedule/plan", response_model=ReschedulePlanResponse)
def coach_plan_reschedule(
    payload: ReschedulePlanRequest,
    db: Session = Depends(get_db),
):
    """Dry-run natural-language rescheduling via Gemini Function Calling."""
    pending = (
        db.query(DBTask, DBNote)
        .join(DBNote, DBTask.note_id == DBNote.id)
        .filter(DBTask.is_completed == 0, DBTask.is_archived == 0)
        .order_by(DBTask.scheduled_date.asc())
        .all()
    )
    task_dicts = [
        {
            "id": t.id,
            "scheduled_date": t.scheduled_date,
            "note_title": n.title,
            "ease_factor": n.ease_factor,
            "type": t.type,
        }
        for t, n in pending
    ]
    if not task_dicts:
        return ReschedulePlanResponse(summary="No pending tasks to reschedule.", moves=[])
    try:
        return plan_reschedule_via_fc(instruction=payload.instruction, pending_tasks=task_dicts)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/coach/reschedule/apply")
def coach_apply_reschedule(
    payload: RescheduleApplyRequest,
    db: Session = Depends(get_db),
):
    """Applies user-approved rescheduling moves to SQLite."""
    updated = 0
    for move in payload.moves:
        task = db.query(DBTask).filter(DBTask.id == move.task_id).first()
        if not task:
            continue
        task.scheduled_date = move.new_date
        note = db.query(DBNote).filter(DBNote.id == task.note_id).first()
        if note:
            note.next_review_date = move.new_date
        updated += 1
    db.commit()
    return {"ok": True, "updated": updated}


@router.post("/coach/remediate", response_model=RemediateResponse)
def coach_remediate_weak_spot(
    payload: RemediateRequest,
    db: Session = Depends(get_db),
):
    """Generates targeted weak-spot remediation questions and appends them to data/questions.json."""
    note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    existing_prompts = [q.prompt for q in get_questions_for_note(db, note)]
    try:
        target_gap, qs = generate_remediation_via_fc(
            title=note.title,
            content=note.content or "",
            missed_prompt=payload.missed_prompt,
            user_answer=payload.user_answer,
            gap_notes=payload.gap_notes,
            existing_prompts=existing_prompts,
            count=payload.count,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    added, skipped = append_questions_for_note(db, note, qs)
    return RemediateResponse(
        target_gap=target_gap,
        added_questions=added,
        skipped_duplicates=skipped,
    )


@router.post("/coach/audit-questions", response_model=QuestionAuditResponse)
def coach_audit_questions(
    payload: QuestionAuditRequest,
    db: Session = Depends(get_db),
):
    """Tags a note's questions with Bloom's taxonomy levels and drops semantic duplicates."""
    note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    qs = get_questions_for_note(db, note)
    if not qs:
        return QuestionAuditResponse(
            note_id=note.id,
            bloom_tags={},
            dropped_duplicate_ids=[],
            summary="No questions owned by this note yet.",
        )
    try:
        bloom_tags, drop_ids, summary = audit_question_bank_via_fc(note.title, qs)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    dropped: list[str] = drop_ids
    if payload.apply_changes:
        _, dropped = update_and_dedup_note_questions(db, note, bloom_tags, drop_ids)
    return QuestionAuditResponse(
        note_id=note.id,
        bloom_tags=bloom_tags,
        dropped_duplicate_ids=dropped,
        summary=summary,
    )


@router.post("/coach/socratic", response_model=SocraticResponse)
def coach_socratic_probe(
    payload: SocraticRequest,
    db: Session = Depends(get_db),
):
    """Runs one Socratic oral-exam round: either returns a hint + follow-up or commits an SM-2 score."""
    try:
        res = socratic_probe_via_fc(
            title=payload.title,
            content=payload.content,
            question_prompt=payload.prompt,
            user_answer=payload.user_answer,
            reference_points=payload.reference_points,
            round_number=payload.round_number,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    if res.action == "commit" and payload.note_id is not None and res.sm2_rating is not None:
        note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
        if note:
            now_iso = datetime.utcnow().isoformat()
            note.last_reviewed_at = now_iso
            db.add(
                DBReviewLog(
                    note_id=note.id,
                    time=now_iso,
                    grade=res.sm2_rating,
                    feedback=res.summary,
                )
            )
            db.commit()
    return res


@router.post("/coach/weekly-diagnosis", response_model=WeeklyDiagnosisResponse)
def coach_weekly_diagnosis(db: Session = Depends(get_db)):
    """Diagnoses study health, leech notes, and proposes remedial review tasks."""
    today_str = datetime.now().strftime("%Y-%m-%d")
    notes = db.query(DBNote).all()
    if not notes:
        return WeeklyDiagnosisResponse(
            headline="Library is empty",
            diagnosis="Import or create notes first to run a study health diagnosis.",
            leech_notes=[],
            proposed_tasks=[],
        )
    overdue_count = (
        db.query(DBTask)
        .filter(DBTask.is_completed == 0, DBTask.is_archived == 0, DBTask.scheduled_date < today_str)
        .count()
    )
    notes_summary = [
        {
            "id": n.id,
            "title": n.title,
            "category": n.category,
            "ease_factor": float(n.ease_factor or 2.5),
            "repetitions": int(n.repetitions or 0),
            "interval_days": int(n.interval_days or 0),
        }
        for n in notes
    ]
    try:
        return diagnose_study_health_via_fc(
            notes_summary=notes_summary,
            overdue_count=overdue_count,
            deficit_points=float(overdue_count),
            today_str=today_str,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/coach/weekly-diagnosis/apply")
def coach_apply_cram_tasks(
    payload: ApplyCramTasksRequest,
    db: Session = Depends(get_db),
):
    """Creates proposed remedial review tasks in SQLite after user confirmation."""
    created = 0
    for item in payload.tasks:
        note = db.query(DBNote).filter(DBNote.id == item.note_id).first()
        if not note:
            continue
        db.add(
            DBTask(
                note_id=note.id,
                type="revision",
                scheduled_date=item.scheduled_date,
                revision_number=int(note.repetitions or 0) + 1,
            )
        )
        note.next_review_date = item.scheduled_date
        created += 1
    db.commit()
    return {"ok": True, "created": created}


# ---------------------------------------------------------------------------
# Multi-LLM Status & Provider Switching
# ---------------------------------------------------------------------------


@router.get("/llm/status", response_model=LLMStatusResponse)
def llm_status():
    """Detect configured LLM API keys, active provider, and feature capability locks."""
    return get_llm_status()


@router.post("/llm/provider", response_model=LLMStatusResponse)
def llm_switch_provider(payload: LLMProviderSwitchRequest):
    """Switch active runtime LLM provider ('gemini', 'openai', 'anthropic', or 'auto')."""
    try:
        set_runtime_provider(payload.provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LLMNotConfiguredError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return get_llm_status()


@router.post("/llm/key", response_model=LLMStatusResponse)
def llm_save_api_key(payload: LLMKeySaveRequest):
    """Save or clear an LLM provider API key locally (.env.local) and activate it immediately."""
    try:
        return save_provider_api_key(payload.provider, payload.api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/vault/status", response_model=VaultStatusResponse)
def vault_status(db: Session = Depends(get_db)):
    """Report active Mentorion data vault path, item counts, and Git backup cleanliness."""
    import os
    import subprocess
    from pathlib import Path
    from ...core.config import settings
    from ...domain.question_bank import load_question_bank

    vault_path = Path(settings.DATABASE).resolve()
    repo_root = Path(__file__).resolve().parents[4]
    default_data_path = (repo_root / "data").resolve()
    is_custom = vault_path != default_data_path

    db_path = str(vault_path / "app.db")
    q_path = vault_path / "questions.json"
    lib_dir = str(Path(settings.LIBRARY_DIR).resolve())

    note_count = db.query(DBNote).count()
    resource_count = db.query(DBNoteResource).count()
    try:
        question_count = len(load_question_bank(q_path))
    except Exception:
        question_count = 0

    is_git_repo = (vault_path / ".git").exists()
    git_dirty: Optional[bool] = None
    if is_git_repo:
        try:
            proc = subprocess.run(
                ["git", "-C", str(vault_path), "status", "--porcelain"],
                capture_output=True,
                text=True,
                timeout=3,
                check=False,
            )
            if proc.returncode == 0:
                git_dirty = bool(proc.stdout.strip())
        except Exception:
            git_dirty = None

    return VaultStatusResponse(
        vault_dir=str(vault_path),
        is_custom_vault=is_custom,
        db_path=db_path,
        question_bank_path=str(q_path),
        library_dir=lib_dir,
        note_count=note_count,
        question_count=question_count,
        resource_count=resource_count,
        is_git_repo=is_git_repo,
        git_dirty=git_dirty,
    )


@router.get("/review/tracked-sources", response_model=List[TrackedSourceItem])
def list_tracked_sources(
    db: Session = Depends(get_db),
    current_user: DBUser = Depends(get_current_user_optional),
):
    """List notes already tracked in Mentorion along with whether they have an active pending review task."""
    notes = db.query(DBNote).filter(DBNote.user_id == current_user.id).all()
    pending_note_ids = {
        row[0]
        for row in db.query(DBTask.note_id)
        .filter(DBTask.is_completed == 0, DBTask.is_archived == 0)
        .distinct()
        .all()
    }
    return [
        TrackedSourceItem(
            note_id=n.id,
            source_doc_id=n.source_doc_id,
            file_path=n.file_path,
            has_pending_task=n.id in pending_note_ids,
            next_review_date=n.next_review_date,
        )
        for n in notes
        if n.source_doc_id or n.file_path
    ]


@router.post("/review/record-by-source", response_model=ExternalReviewRecordResponse)
def record_review_by_source(
    payload: ExternalReviewRecordRequest,
    db: Session = Depends(get_db),
    current_user: DBUser = Depends(get_current_user_optional),
):
    """
    Update an EXISTING Mentorion scheduled review by `source_doc_id` or `file_path`.
    Never creates new notes or tasks from external callers: if the note has no active
    scheduled task in Mentorion, treats the action as Practice only.
    """
    today_str = datetime.now().strftime("%Y-%m-%d")
    now_iso = datetime.now().isoformat()

    note = (
        db.query(DBNote)
        .filter(DBNote.source_doc_id == payload.source_doc_id, DBNote.user_id == current_user.id)
        .first()
    )
    if not note and payload.file_path:
        norm_suffix = payload.file_path.replace("\\", "/").lstrip("/")
        candidates = db.query(DBNote).filter(DBNote.user_id == current_user.id, DBNote.file_path.isnot(None)).all()
        note = next(
            (n for n in candidates if (n.file_path or "").replace("\\", "/").endswith(norm_suffix)),
            None,
        )

    pending_task = (
        db.query(DBTask)
        .filter(DBTask.note_id == note.id, DBTask.is_completed == 0, DBTask.is_archived == 0)
        .order_by(DBTask.scheduled_date.asc(), DBTask.id.asc())
        .first()
        if note
        else None
    )

    # Not scheduled in Mentorion -> Practice only (do NOT create a new note or scheduled task)
    if not note or not pending_task:
        return ExternalReviewRecordResponse(
            ok=True,
            scheduled=False,
            note_id=note.id if note else None,
            source_doc_id=payload.source_doc_id,
            mode="practice",
            rating=payload.rating,
            last_reviewed_at=now_iso,
        )

    pending_task.is_completed = 1
    pending_task.completed_at = now_iso
    pending_task.user_rating = payload.rating

    ef = float(note.ease_factor or 2.5)
    reps = int(note.repetitions or 0)
    prev_interval = int(note.interval_days or 0)

    actual_date_str = (payload.actual_date or "").strip() or today_str
    anchor_date = actual_date_str if payload.anchor_option == "A" else pending_task.scheduled_date

    if payload.mode == "custom_date":
        if not payload.next_review_date:
            raise HTTPException(status_code=400, detail="next_review_date (YYYY-MM-DD) is required for custom_date mode.")
        try:
            target_dt = datetime.strptime(payload.next_review_date.strip(), "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="next_review_date must be YYYY-MM-DD.")
        try:
            anchor_dt = datetime.strptime(anchor_date, "%Y-%m-%d")
        except ValueError:
            anchor_dt = datetime.strptime(today_str, "%Y-%m-%d")
        interval_days = max(1, (target_dt - anchor_dt).days)
        reps += 1
        next_review_date = payload.next_review_date.strip()
    else:
        q = payload.rating
        if q < 3:
            reps = 0
            interval_days = 1
        else:
            if reps == 0:
                interval_days = 1
            elif reps == 1:
                interval_days = 6
            else:
                interval_days = max(1, min(365, round(max(1, prev_interval) * ef)))
            reps += 1
        ef = max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
        next_review_date = add_days(anchor_date, interval_days)

    note.ease_factor = round(ef, 4)
    note.repetitions = reps
    note.interval_days = interval_days
    note.last_reviewed_at = now_iso
    note.next_review_date = next_review_date

    existing_next = (
        db.query(DBTask)
        .filter(
            DBTask.note_id == note.id,
            DBTask.is_completed == 0,
            DBTask.is_archived == 0,
            DBTask.scheduled_date == next_review_date,
        )
        .first()
    )
    if not existing_next:
        db.add(
            DBTask(
                note_id=note.id,
                type="revision",
                scheduled_date=next_review_date,
                revision_number=reps + 1,
                is_completed=0,
            )
        )

    db.add(
        DBReviewLog(
            note_id=note.id,
            time=now_iso,
            grade=payload.rating,
            feedback=f"Recorded via external source ({payload.mode})",
        )
    )
    db.add(
        DBJournalEvent(
            user_id=current_user.id,
            type="review_done",
            title=note.title,
            remarks=f"{payload.mode.upper()} · grade={payload.rating} · next={next_review_date}",
            event_date=actual_date_str,
            note_id=note.id,
            created_at=now_iso,
        )
    )
    db.commit()

    return ExternalReviewRecordResponse(
        ok=True,
        scheduled=True,
        note_id=note.id,
        source_doc_id=payload.source_doc_id,
        mode=payload.mode,
        rating=payload.rating,
        last_reviewed_at=now_iso,
        next_review_date=next_review_date,
        interval_days=interval_days,
        ease_factor=note.ease_factor,
        repetitions=reps,
    )


# ---------------------------------------------------------------------------
# AI Mentor Research: Related Resources, Scraping Summary & Cross-Source Quiz
# (All persisted in Mentorion SQLite; external notes remain strictly Read-Only)
# ---------------------------------------------------------------------------


def _serialize_resource(row: DBNoteResource) -> NoteResourceResponse:
    return NoteResourceResponse(
        id=row.id,
        note_id=row.note_id,
        topic=row.topic,
        title=row.title,
        url=row.url,
        source_type=row.source_type,
        relevance_note=row.relevance_note or "",
        summary=row.summary,
        created_at=row.created_at,
    )


@router.post("/resources/discover", response_model=ResourceDiscoverResponse)
def discover_resources_endpoint(
    payload: ResourceDiscoverRequest,
    db: Session = Depends(get_db),
):
    """Discover verified external learning links via Gemini Google Search Grounding."""
    title = (payload.topic or "").strip()
    content = ""

    if payload.note_id is not None:
        note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        title = note.title
        content = note.content or ""

    if not title:
        raise HTTPException(status_code=400, detail="Provide either note_id or topic.")

    try:
        synthesis, items, provider_id, model_name = discover_related_resources(
            title=title,
            content=content,
            query=payload.query,
            max_results=payload.max_results,
        )
    except LLMNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except UnsupportedCapabilityError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Resource discovery failed: {exc}")

    return ResourceDiscoverResponse(
        synthesis=synthesis,
        resources=items,
        provider=provider_id,
        model=model_name,
    )


@router.get("/resources", response_model=List[NoteResourceResponse])
def list_saved_resources(
    note_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """List saved external reference resources stored in Mentorion SQLite."""
    q = db.query(DBNoteResource)
    if note_id is not None:
        q = q.filter(DBNoteResource.note_id == note_id)
    rows = q.order_by(DBNoteResource.id.desc()).all()
    return [_serialize_resource(r) for r in rows]


@router.post("/resources", response_model=NoteResourceResponse, status_code=201)
def save_resource(
    payload: NoteResourceCreate,
    db: Session = Depends(get_db),
):
    """Bookmark a discovered or manual external resource into Mentorion SQLite."""
    url = payload.url.strip()
    existing = (
        db.query(DBNoteResource)
        .filter(DBNoteResource.note_id == payload.note_id, DBNoteResource.url == url)
        .first()
    )
    if existing:
        existing.title = payload.title.strip()
        if payload.relevance_note:
            existing.relevance_note = payload.relevance_note.strip()
        if payload.summary:
            existing.summary = payload.summary
        db.commit()
        db.refresh(existing)
        return _serialize_resource(existing)

    row = DBNoteResource(
        note_id=payload.note_id,
        topic=(payload.topic or "").strip() or None,
        title=payload.title.strip(),
        url=url,
        source_type=payload.source_type,
        relevance_note=payload.relevance_note.strip(),
        summary=payload.summary,
        created_at=datetime.utcnow().isoformat(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_resource(row)


@router.delete("/resources/{resource_id}")
def delete_saved_resource(resource_id: int, db: Session = Depends(get_db)):
    row = db.query(DBNoteResource).filter(DBNoteResource.id == resource_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Resource not found")
    db.delete(row)
    db.commit()
    return {"ok": True, "deleted_id": resource_id}


@router.post("/resources/{resource_id}/summarize", response_model=NoteResourceResponse)
async def summarize_saved_resource(resource_id: int, db: Session = Depends(get_db)):
    """Scrape a saved resource URL and synthesize concise study takeaways with the active LLM."""
    row = db.query(DBNoteResource).filter(DBNoteResource.id == resource_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Resource not found")

    note_title = row.topic or ""
    if row.note_id:
        note = db.query(DBNote).filter(DBNote.id == row.note_id).first()
        if note:
            note_title = note.title

    scraper = Scraper()
    scraped = await scraper.scrape_article(row.url)
    if not scraped.get("success") or not (scraped.get("text") or "").strip():
        raise HTTPException(
            status_code=502,
            detail=f"Failed to scrape resource URL: {scraped.get('error') or 'Empty page content'}",
        )

    try:
        summary_text = summarize_scraped_resource(
            url=row.url,
            scraped_title=str(scraped.get("title") or row.title),
            scraped_text=str(scraped.get("text") or ""),
            note_title=note_title,
        )
    except LLMNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM summarization failed: {exc}")

    row.summary = summary_text
    db.commit()
    db.refresh(row)
    return _serialize_resource(row)


@router.post("/resources/cross-source-quiz", response_model=QuizResponse)
def generate_cross_source_quiz(
    payload: CrossSourceQuizRequest,
    db: Session = Depends(get_db),
):
    """Generate advanced cross-source quiz questions combining a Read-Only note with saved external resources."""
    note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    q = db.query(DBNoteResource)
    if payload.resource_ids:
        q = q.filter(DBNoteResource.id.in_(payload.resource_ids))
    else:
        q = q.filter(DBNoteResource.note_id == note.id)
    resources = q.all()
    if not resources:
        raise HTTPException(status_code=400, detail="No saved external resources selected for this note.")

    context_blocks = []
    for r in resources[:6]:
        body = (r.summary or r.relevance_note or "").strip()
        context_blocks.append(f"- [{r.title}]({r.url}) ({r.source_type}):\n  {body[:1500]}")
    extra_context = "\n".join(context_blocks)

    existing_qs = get_questions_for_note(note.id)
    existing_prompts = [item.prompt for item in existing_qs]

    try:
        generated = generate_questions_via_function_calling(
            title=note.title,
            content=note.content or "",
            count=payload.count,
            existing_prompts=existing_prompts,
            extra_resources_context=extra_context,
        )
    except LLMNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cross-source quiz generation failed: {exc}")

    added_qs, all_ids = append_questions_for_note(
        note_id=note.id,
        category=note.category or "General",
        new_questions=generated,
    )
    note.question_ids = all_ids
    db.commit()

    return QuizResponse(
        note_id=note.id,
        source="llm",
        questions=added_qs,
    )
