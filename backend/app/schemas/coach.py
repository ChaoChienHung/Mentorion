from __future__ import annotations

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field

from .quiz import BloomLevel, QuizQuestionItem


# 1. Smart Rescheduler (Dry-run -> Apply)
class RescheduleMove(BaseModel):
    task_id: int
    note_title: Optional[str] = None
    old_date: Optional[str] = None
    new_date: str
    reason: str


class ReschedulePlanRequest(BaseModel):
    instruction: str = Field(..., min_length=2)
    horizon_days: int = Field(default=14, ge=1, le=60)


class ReschedulePlanResponse(BaseModel):
    summary: str
    moves: List[RescheduleMove] = Field(default_factory=list)


class RescheduleApplyRequest(BaseModel):
    moves: List[RescheduleMove] = Field(default_factory=list)


# 2. Weak-Spot Remediation
class RemediateRequest(BaseModel):
    note_id: int
    missed_prompt: str
    user_answer: str = ""
    gap_notes: str = ""
    count: int = Field(default=2, ge=1, le=5)


class RemediateResponse(BaseModel):
    target_gap: str
    added_questions: List[QuizQuestionItem] = Field(default_factory=list)
    skipped_duplicates: int = 0


# 3. Bloom's Taxonomy Audit & Dedup
class QuestionAuditRequest(BaseModel):
    note_id: int
    apply_changes: bool = True


class QuestionAuditResponse(BaseModel):
    note_id: int
    bloom_tags: Dict[str, BloomLevel] = Field(default_factory=dict)
    dropped_duplicate_ids: List[str] = Field(default_factory=list)
    summary: str


# 4. Socratic Oral Exam Loop
class SocraticRequest(BaseModel):
    note_id: Optional[int] = None
    task_id: Optional[int] = None
    title: str
    content: str
    prompt: str
    user_answer: str = Field(..., min_length=1)
    reference_points: List[str] = Field(default_factory=list)
    round_number: int = Field(default=1, ge=1, le=4)


class SocraticResponse(BaseModel):
    action: Literal["hint", "commit"]
    hint: Optional[str] = None
    followup_question: Optional[str] = None
    missing_points: List[str] = Field(default_factory=list)
    sm2_rating: Optional[int] = Field(default=None, ge=0, le=5)
    summary: str
    strengths: List[str] = Field(default_factory=list)


# 5. Weekly Study Coach & Leech Diagnosis
class LeechNoteItem(BaseModel):
    note_id: int
    title: str
    ease_factor: float
    repetitions: int
    reason: str


class ProposedCramTask(BaseModel):
    note_id: int
    title: Optional[str] = None
    scheduled_date: str
    reason: str


class WeeklyDiagnosisResponse(BaseModel):
    headline: str
    diagnosis: str
    leech_notes: List[LeechNoteItem] = Field(default_factory=list)
    proposed_tasks: List[ProposedCramTask] = Field(default_factory=list)


class ApplyCramTasksRequest(BaseModel):
    tasks: List[ProposedCramTask] = Field(default_factory=list)
