from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta

from ...schemas.note import Note, NoteRequest
from ...schemas.error import ErrorResponse
from ...schemas.quiz import (
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
)
from ...domain.quiz_engine import (
    generate_questions_via_function_calling,
    load_inline_schema_questions,
    load_sidecar_questions,
)
from pydantic import BaseModel
from .dependencies import note_service, get_current_user_optional, get_current_user_required
from ...db.dependency import get_db
from ...db.models import Note as DBNote, Task as DBTask, ReviewLog as DBReviewLog, JournalEvent as DBJournalEvent, User as DBUser
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
               n.ease_factor, n.repetitions, n.interval_days
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
    anchor_option = payload.get("anchorOption", "A")
    actual_date = payload.get("actualDate", datetime.now().strftime("%Y-%m-%d"))
    gcal_event_id = payload.get("gcalEventId")
    
    task = db.query(DBTask).join(DBNote).filter(DBTask.id == id, DBNote.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
        
    note = db.query(DBNote).filter(DBNote.id == task.note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
        
    now_str = datetime.now().isoformat()
    
    # 1. Mark task as completed
    task.is_completed = 1
    task.completed_at = now_str
    if rating is not None:
        task.user_rating = int(rating)
    if gcal_event_id is not None:
        task.gcal_event_id = gcal_event_id
        
    # 2. SM-2 Spaced Repetition calculation
    if note.pattern == "C" and rating is not None:
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
                interval_days = int(round(interval_days * ease_factor))
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
        
        anchor_date = actual_date if anchor_option == "A" else task.scheduled_date
        next_review_date = add_days(anchor_date, interval_days)
        
        # Schedule next Revision Task
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
    """Preview documents discovered from a local Markdown folder using a custom schema mapping."""
    try:
        docs = scan_markdown_source(
            payload.source_dir,
            mapping=_build_mapping(payload),
            only_fresh=payload.only_fresh,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "count": len(docs),
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
    }


@router.post("/schema-sync/import")
def import_schema_sync(
    payload: SchemaMappingRequest,
    db: Session = Depends(get_db),
    current_user: Optional[DBUser] = Depends(get_current_user_optional),
):
    """Import or refresh notes from a schema-compatible Markdown folder into Mentorion."""
    try:
        docs = scan_markdown_source(
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
            updated_count += 1
        else:
            note = DBNote(
                user_id=user_id,
                source_doc_id=doc.source_doc_id,
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


# -------------------------------------------------------
# Quiz Engine Routes (Sidecar + Inline Schema + LLM Tools)
# -------------------------------------------------------

@router.post("/quiz/load", response_model=QuizResponse)
def load_quiz_questions(
    payload: QuizLoadRequest,
    db: Session = Depends(get_db),
):
    """
    Loads quiz questions from up to three sources in priority order:
    1. Sidecar `questions.json` alongside the Markdown note in `source_dir`
    2. Inline `questions` embedded in the note schema
    3. LLM Function Calling (`submit_quiz_questions`) when `generate_if_empty=True`
    """
    questions: list[QuizQuestionItem] = []
    sources_used: list[QuestionSource] = []

    title = payload.title or ""
    content = payload.content or ""
    source_doc_id = payload.source_doc_id

    if payload.note_id is not None:
        db_note = db.query(DBNote).filter(DBNote.id == payload.note_id).first()
        if db_note:
            title = title or db_note.title
            content = content or db_note.content
            source_doc_id = source_doc_id or db_note.source_doc_id

    if payload.source_dir and source_doc_id:
        try:
            sidecar_qs = load_sidecar_questions(payload.source_dir, source_doc_id)
            if sidecar_qs:
                questions.extend(sidecar_qs)
                sources_used.append("sidecar")
        except Exception:
            pass

    if payload.inline_questions:
        inline_qs = load_inline_schema_questions(payload.inline_questions)
        if inline_qs:
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
            )
            questions.extend(llm_qs)
            sources_used.append("llm")
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc))

    return QuizResponse(questions=questions, sources_used=sources_used)


@router.post("/quiz/generate", response_model=QuizResponse)
def generate_quiz_questions(payload: QuizGenerateRequest):
    """Explicitly invokes Gemini Function Calling (`submit_quiz_questions`) to generate schema-validated questions."""
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Note content cannot be empty.")
    try:
        llm_qs = generate_questions_via_function_calling(
            title=payload.title,
            content=payload.content,
            count=payload.count,
            question_types=payload.question_types,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return QuizResponse(questions=llm_qs, sources_used=["llm"])


