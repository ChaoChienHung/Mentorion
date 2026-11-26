from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from pydantic import TypeAdapter
from sqlalchemy.orm import Session

from ..core.config import settings
from ..db.models import Note as DBNote
from ..schemas.quiz import QuizQuestionItem

DEFAULT_QUESTION_BANK_PATH = Path(settings.DATABASE) / "questions.json"
_QUESTION_LIST_ADAPTER = TypeAdapter(List[QuizQuestionItem])


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\u4e00-\u9fff]+", " ", text.lower())).strip()


def _tokenize(text: str) -> set[str]:
    norm = _normalize_text(text)
    if not norm:
        return set()
    return set(norm.split(" "))


def is_duplicate_prompt(
    candidate_prompt: str,
    existing_prompts: Sequence[str],
    jaccard_threshold: float = 0.72,
) -> bool:
    cand_norm = _normalize_text(candidate_prompt)
    cand_tokens = _tokenize(candidate_prompt)
    if not cand_norm:
        return True

    for existing in existing_prompts:
        ex_norm = _normalize_text(existing)
        if cand_norm == ex_norm:
            return True
        ex_tokens = _tokenize(existing)
        if cand_tokens and ex_tokens:
            union = cand_tokens | ex_tokens
            inter = cand_tokens & ex_tokens
            if len(inter) / len(union) >= jaccard_threshold:
                return True
    return False


def load_question_bank(bank_path: Path = DEFAULT_QUESTION_BANK_PATH) -> List[QuizQuestionItem]:
    if not bank_path.is_file():
        return []
    raw = json.loads(bank_path.read_text(encoding="utf-8"))
    items = raw.get("questions", []) if isinstance(raw, dict) else raw
    return _QUESTION_LIST_ADAPTER.validate_python(items)


def save_question_bank(
    questions: Sequence[QuizQuestionItem],
    bank_path: Path = DEFAULT_QUESTION_BANK_PATH,
) -> None:
    bank_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "questions": [q.model_dump() for q in questions],
    }
    bank_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def get_questions_for_note(
    db: Session,
    note: DBNote,
    bank_path: Path = DEFAULT_QUESTION_BANK_PATH,
) -> List[QuizQuestionItem]:
    """
    Loads questions owned by `note` from Mentorion's centralized `questions.json`:
    1. Primary path: O(1) lookup via `note.question_ids`.
    2. Fallback & self-healing: filters `questions.json` by `owner_note_id == note.id`
       (or matching `source_doc_id`), reconciling `note.question_ids` if drifted.
    """
    all_questions = load_question_bank(bank_path)
    by_id: Dict[str, QuizQuestionItem] = {q.id: q for q in all_questions if q.id}

    stored_ids: List[str] = list(note.question_ids or [])
    matched_by_ids = [by_id[qid] for qid in stored_ids if qid in by_id]

    # Fallback: filter directly by ownership in centralized questions.json
    owned_in_bank = [
        q
        for q in all_questions
        if q.owner_note_id == note.id
        or (note.source_doc_id and q.source_doc_id == note.source_doc_id)
    ]

    # Reconcile if stored_ids is missing or drifted from bank ownership
    reconciled_ids = [q.id for q in owned_in_bank if q.id]
    if reconciled_ids != stored_ids:
        note.question_ids = reconciled_ids
        db.add(note)
        db.commit()
        return owned_in_bank

    return matched_by_ids


def append_questions_for_note(
    db: Session,
    note: DBNote,
    new_questions: Sequence[QuizQuestionItem],
    bank_path: Path = DEFAULT_QUESTION_BANK_PATH,
) -> Tuple[List[QuizQuestionItem], int]:
    """
    Deduplicates `new_questions` against existing questions for `note`,
    stamps ownership (`owner_note_id`, `source_doc_id`, `category`),
    appends to centralized `questions.json`, and updates `note.question_ids` bidirectionally.
    Returns (added_questions, skipped_duplicates_count).
    """
    all_questions = load_question_bank(bank_path)
    existing_for_note = [
        q for q in all_questions if q.owner_note_id == note.id
    ]
    existing_prompts = [q.prompt for q in existing_for_note]
    current_ids = list(note.question_ids or [])

    added: List[QuizQuestionItem] = []
    skipped = 0

    for q in new_questions:
        if is_duplicate_prompt(q.prompt, existing_prompts):
            skipped += 1
            continue

        qid = f"q_{note.id}_{uuid.uuid4().hex[:8]}"
        stamped = q.model_copy(
            update={
                "id": qid,
                "owner_note_id": note.id,
                "source_doc_id": note.source_doc_id,
                "category": note.category,
            }
        )
        all_questions.append(stamped)
        existing_prompts.append(stamped.prompt)
        if qid not in current_ids:
            current_ids.append(qid)
        added.append(stamped)

    if added:
        save_question_bank(all_questions, bank_path)
        note.question_ids = current_ids
        db.add(note)
        db.commit()

    return added, skipped


def verify_bidirectional_consistency(
    db: Session,
    bank_path: Path = DEFAULT_QUESTION_BANK_PATH,
) -> List[str]:
    """
    Verifies bidirectional integrity between SQLite `notes.question_ids`
    and centralized `questions.json` (`owner_note_id`). Returns a list of errors (empty = valid).
    """
    errors: List[str] = []
    all_questions = load_question_bank(bank_path)
    by_id: Dict[str, QuizQuestionItem] = {q.id: q for q in all_questions if q.id}
    notes = db.query(DBNote).all()
    notes_by_id: Dict[int, DBNote] = {n.id: n for n in notes}

    # Forward check: note.question_ids -> questions.json.owner_note_id
    for note in notes:
        for qid in note.question_ids or []:
            q = by_id.get(qid)
            if not q:
                errors.append(f"Note {note.id} references missing question_id: {qid}")
            elif q.owner_note_id != note.id:
                errors.append(
                    f"Note {note.id} lists {qid}, but question.owner_note_id is {q.owner_note_id}"
                )

    # Reverse check: questions.json.owner_note_id -> note.question_ids
    for q in all_questions:
        if q.owner_note_id is None:
            continue
        owner = notes_by_id.get(q.owner_note_id)
        if not owner:
            errors.append(f"Question {q.id} references missing owner_note_id: {q.owner_note_id}")
        elif q.id not in (owner.question_ids or []):
            errors.append(
                f"Question {q.id} is owned by note {owner.id}, but missing from note.question_ids"
            )

    return errors
