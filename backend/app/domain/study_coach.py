from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from google.genai import types

from ..core.ai_client import create_gemini_client
from ..core.config import settings
from ..core.llm import ToolSpec, require_active_provider
from ..core.llm import ToolSpec, require_active_provider
from ..core.llm import ToolSpec, require_active_provider
from ..schemas.coach import (
    LeechNoteItem,
    ProposedCramTask,
    RescheduleMove,
    ReschedulePlanResponse,
    SocraticResponse,
    WeeklyDiagnosisResponse,
)
from ..schemas.quiz import BloomLevel, QuizQuestionItem
from .quiz_engine import QUIZ_FUNCTION_DECLARATION, validate_questions


# 1. Smart Rescheduler Tool
PROPOSE_RESCHEDULE_DECL = types.FunctionDeclaration(
    name="propose_reschedule",
    description="Propose rescheduled dates for pending study tasks according to the user's request.",
    parameters={
        "type": "OBJECT",
        "properties": {
            "summary": {"type": "STRING", "description": "Short rationale explaining the rescheduling plan."},
            "moves": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "task_id": {"type": "INTEGER"},
                        "new_date": {"type": "STRING", "description": "Target date in YYYY-MM-DD format."},
                        "reason": {"type": "STRING"},
                    },
                    "required": ["task_id", "new_date", "reason"],
                },
            },
        },
        "required": ["summary", "moves"],
    },
)


# 2. Question Bank Bloom Audit Tool
SUBMIT_AUDIT_DECL = types.FunctionDeclaration(
    name="submit_question_audit",
    description="Classify each question by Bloom's taxonomy level and identify redundant duplicate IDs.",
    parameters={
        "type": "OBJECT",
        "properties": {
            "summary": {"type": "STRING"},
            "classifications": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "question_id": {"type": "STRING"},
                        "bloom_level": {
                            "type": "STRING",
                            "enum": ["recall", "understand", "apply", "analyze"],
                        },
                    },
                    "required": ["question_id", "bloom_level"],
                },
            },
            "drop_duplicate_ids": {
                "type": "ARRAY",
                "items": {"type": "STRING"},
                "description": "Question IDs that are semantically redundant duplicates of another kept question.",
            },
        },
        "required": ["summary", "classifications", "drop_duplicate_ids"],
    },
)


# 3. Socratic Oral Exam Tools (LLM chooses between hint vs commit)
ASK_FOLLOWUP_HINT_DECL = types.FunctionDeclaration(
    name="ask_followup_hint",
    description="Use when the student's answer is incomplete or partially incorrect and can be guided with a Socratic hint.",
    parameters={
        "type": "OBJECT",
        "properties": {
            "hint": {"type": "STRING", "description": "Gentle conceptual nudge without giving away the full answer."},
            "followup_question": {"type": "STRING", "description": "One focused follow-up question probing the missing concept."},
            "missing_points": {"type": "ARRAY", "items": {"type": "STRING"}},
            "strengths": {"type": "ARRAY", "items": {"type": "STRING"}},
            "summary": {"type": "STRING"},
        },
        "required": ["hint", "followup_question", "summary"],
    },
)

COMMIT_REVIEW_RATING_DECL = types.FunctionDeclaration(
    name="commit_review_rating",
    description="Use when the student's answer is sufficiently complete (or final round reached) to finalize an SM-2 score (0-5).",
    parameters={
        "type": "OBJECT",
        "properties": {
            "sm2_rating": {"type": "INTEGER", "description": "0 (blackout) to 5 (perfect mastery)."},
            "summary": {"type": "STRING"},
            "strengths": {"type": "ARRAY", "items": {"type": "STRING"}},
            "missing_points": {"type": "ARRAY", "items": {"type": "STRING"}},
        },
        "required": ["sm2_rating", "summary"],
    },
)


# 4. Weekly Study Health & Leech Diagnosis Tool
SUBMIT_WEEKLY_DIAGNOSIS_DECL = types.FunctionDeclaration(
    name="submit_weekly_diagnosis",
    description="Diagnose study health, highlight leech (low ease-factor) notes, and propose remedial review tasks.",
    parameters={
        "type": "OBJECT",
        "properties": {
            "headline": {"type": "STRING"},
            "diagnosis": {"type": "STRING"},
            "leech_notes": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "note_id": {"type": "INTEGER"},
                        "reason": {"type": "STRING"},
                    },
                    "required": ["note_id", "reason"],
                },
            },
            "proposed_tasks": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "note_id": {"type": "INTEGER"},
                        "scheduled_date": {"type": "STRING", "description": "YYYY-MM-DD"},
                        "reason": {"type": "STRING"},
                    },
                    "required": ["note_id", "scheduled_date", "reason"],
                },
            },
        },
        "required": ["headline", "diagnosis", "leech_notes", "proposed_tasks"],
    },
)


def _invoke_fc(
    prompt: str,
    declarations: Sequence[types.FunctionDeclaration],
    allowed_names: Sequence[str],
    temperature: float = 0.2,
    client: Any = None,
    model: Optional[str] = None,
) -> Tuple[str, Dict[str, Any]]:
    """
    Invoke structured Function/Tool Calling via either an injected mock Gemini client
    (backward-compatible with unit tests) or the active unified LLM provider
    (Gemini, OpenAI, or Anthropic).
    """
    if client is not None:
        response = client.models.generate_content(
            model=model or settings.MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(function_declarations=list(declarations))],
                tool_config=types.ToolConfig(
                    function_calling_config=types.FunctionCallingConfig(
                        mode=types.FunctionCallingConfigMode.ANY,
                        allowed_function_names=list(allowed_names),
                    )
                ),
                temperature=temperature,
            ),
        )
        return _extract_first_fc(response)

    provider = require_active_provider()
    specs = [
        ToolSpec(
            name=str(d.name),
            description=str(d.description or ""),
            parameters=d.parameters,  # type: ignore[arg-type]
        )
        for d in declarations
    ]
    res = provider.call_tool(
        prompt=prompt,
        tools=specs,
        allowed_tool_names=list(allowed_names),
        temperature=temperature,
        model=model,
    )
    return res.name, res.args


def _extract_first_fc(response: Any) -> Tuple[str, Dict[str, Any]]:
    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        content_obj = getattr(cand, "content", None)
        parts = getattr(content_obj, "parts", None) or []
        for part in parts:
            fc = getattr(part, "function_call", None)
            if fc is not None:
                return str(fc.name), dict(fc.args or {})
    raise RuntimeError("Gemini response did not include a Function Calling result.")


def plan_reschedule_via_fc(
    instruction: str,
    pending_tasks: Sequence[Dict[str, Any]],
    today_str: Optional[str] = None,
    client: Any = None,
    model: Optional[str] = None,
) -> ReschedulePlanResponse:
    today = today_str or datetime.now().strftime("%Y-%m-%d")
    task_lines = "\n".join(
        f"- task_id={t['id']} | date={t['scheduled_date']} | title={t['note_title']} | ease={t.get('ease_factor', 2.5)} | type={t['type']}"
        for t in pending_tasks
    )
    prompt = (
        f"Today is {today}. You are Mentorion's spaced-repetition scheduling mentor.\n"
        f"User instruction: {instruction}\n\n"
        f"Pending tasks:\n{task_lines or '(none)'}\n\n"
        "Call `propose_reschedule` with ONLY valid task_ids from the list above and YYYY-MM-DD dates. "
        "Preserve high-priority or low-ease tasks earlier when balancing load."
    )
    _, args = _invoke_fc(
        prompt=prompt,
        declarations=[PROPOSE_RESCHEDULE_DECL],
        allowed_names=["propose_reschedule"],
        temperature=0.2,
        client=client,
        model=model,
    )
    by_id = {int(t["id"]): t for t in pending_tasks}
    moves: List[RescheduleMove] = []
    for m in args.get("moves") or []:
        tid = int(m["task_id"])
        if tid not in by_id:
            continue
        moves.append(
            RescheduleMove(
                task_id=tid,
                note_title=str(by_id[tid].get("note_title", "")),
                old_date=str(by_id[tid].get("scheduled_date", "")),
                new_date=str(m["new_date"]),
                reason=str(m.get("reason", "")),
            )
        )
    return ReschedulePlanResponse(summary=str(args.get("summary", "")), moves=moves)


def generate_remediation_via_fc(
    title: str,
    content: str,
    missed_prompt: str,
    user_answer: str = "",
    gap_notes: str = "",
    existing_prompts: Sequence[str] = (),
    count: int = 2,
    client: Any = None,
    model: Optional[str] = None,
) -> Tuple[str, List[QuizQuestionItem]]:
    dedup_block = (
        "\nExisting questions to AVOID duplicating:\n"
        + "\n".join(f"- {p}" for p in existing_prompts[:25])
        if existing_prompts
        else ""
    )
    prompt = (
        f"You are Mentorion's weak-spot remediation mentor.\n"
        f"The learner struggled on this question for note '{title}':\n"
        f"- Missed Question: {missed_prompt}\n"
        f"- Learner's Answer: {user_answer or '(blank / incorrect)'}\n"
        f"- Identified Gap: {gap_notes or 'Concept misunderstanding'}\n\n"
        f"Generate exactly {count} targeted scaffolding / counter-example remediation questions "
        f"(mix of mcq, short_answer, or short_essay) to close this specific gap. "
        f"Call `submit_quiz_questions`.{dedup_block}\n\n"
        f"Note content:\n{content[:10000]}"
    )
    _, args = _invoke_fc(
        prompt=prompt,
        declarations=[QUIZ_FUNCTION_DECLARATION],
        allowed_names=["submit_quiz_questions"],
        temperature=0.3,
        client=client,
        model=model,
    )
    qs = validate_questions(args.get("questions") or [], "llm")
    target_gap = gap_notes or f"Targeted remediation for: {missed_prompt[:80]}"
    return target_gap, qs


def audit_question_bank_via_fc(
    note_title: str,
    questions: Sequence[QuizQuestionItem],
    client: Any = None,
    model: Optional[str] = None,
) -> Tuple[Dict[str, BloomLevel], List[str], str]:
    q_lines = "\n".join(
        f"- id={q.id} | type={q.type} | prompt={q.prompt}"
        for q in questions
        if q.id
    )
    prompt = (
        f"Audit the question bank for note '{note_title}'.\n"
        "1. Tag every question with a Bloom's taxonomy level: recall, understand, apply, or analyze.\n"
        "2. List any semantically duplicate question IDs in `drop_duplicate_ids` (keep the clearest one).\n"
        f"Call `submit_question_audit`.\n\nQuestions:\n{q_lines}"
    )
    _, args = _invoke_fc(
        prompt=prompt,
        declarations=[SUBMIT_AUDIT_DECL],
        allowed_names=["submit_question_audit"],
        temperature=0.1,
        client=client,
        model=model,
    )
    valid_ids = {q.id for q in questions if q.id}
    bloom_tags: Dict[str, BloomLevel] = {}
    for item in args.get("classifications") or []:
        qid = str(item.get("question_id", ""))
        lvl = str(item.get("bloom_level", ""))
        if qid in valid_ids and lvl in ("recall", "understand", "apply", "analyze"):
            bloom_tags[qid] = lvl  # type: ignore[assignment]
    drop_ids = [
        str(qid)
        for qid in (args.get("drop_duplicate_ids") or [])
        if str(qid) in valid_ids
    ]
    return bloom_tags, drop_ids, str(args.get("summary", ""))


def socratic_probe_via_fc(
    title: str,
    content: str,
    question_prompt: str,
    user_answer: str,
    reference_points: Sequence[str] = (),
    round_number: int = 1,
    client: Any = None,
    model: Optional[str] = None,
) -> SocraticResponse:
    ref_text = "\n".join(f"- {p}" for p in reference_points) if reference_points else "(derive from note)"
    prompt = (
        f"You are Mentorion's Socratic Oral Exam Tutor (Round {round_number} of 3).\n"
        f"Note Title: {title}\n"
        f"Question: {question_prompt}\n"
        f"Reference Points:\n{ref_text}\n\n"
        f"Student Answer:\n{user_answer}\n\n"
        "Decide:\n"
        "- If the answer is missing key concepts AND round_number < 3, call `ask_followup_hint` with a concise nudge and 1 focused follow-up question.\n"
        "- Otherwise (answer is solid, OR round_number >= 3), call `commit_review_rating` with an SM-2 rating (0-5).\n\n"
        f"Source Note Excerpt:\n{content[:8000]}"
    )
    allowed = ["commit_review_rating"] if round_number >= 3 else ["ask_followup_hint", "commit_review_rating"]
    name, args = _invoke_fc(
        prompt=prompt,
        declarations=[ASK_FOLLOWUP_HINT_DECL, COMMIT_REVIEW_RATING_DECL],
        allowed_names=allowed,
        temperature=0.25,
        client=client,
        model=model,
    )
    if name == "ask_followup_hint":
        return SocraticResponse(
            action="hint",
            hint=str(args.get("hint", "")),
            followup_question=str(args.get("followup_question", "")),
            missing_points=[str(x) for x in (args.get("missing_points") or [])],
            strengths=[str(x) for x in (args.get("strengths") or [])],
            summary=str(args.get("summary", "")),
        )
    rating = max(0, min(5, int(args.get("sm2_rating", 3))))
    return SocraticResponse(
        action="commit",
        sm2_rating=rating,
        missing_points=[str(x) for x in (args.get("missing_points") or [])],
        strengths=[str(x) for x in (args.get("strengths") or [])],
        summary=str(args.get("summary", "")),
    )


def diagnose_study_health_via_fc(
    notes_summary: Sequence[Dict[str, Any]],
    overdue_count: int,
    deficit_points: float,
    today_str: Optional[str] = None,
    client: Any = None,
    model: Optional[str] = None,
) -> WeeklyDiagnosisResponse:
    today = today_str or datetime.now().strftime("%Y-%m-%d")
    note_lines = "\n".join(
        f"- note_id={n['id']} | title={n['title']} | category={n['category']} | ease={n['ease_factor']:.2f} | reps={n['repetitions']} | interval={n['interval_days']}d"
        for n in notes_summary
    )
    prompt = (
        f"Today is {today}. You are Mentorion's Weekly Study Mentor.\n"
        f"Metrics: overdue_tasks={overdue_count}, deficit_points={deficit_points}.\n"
        f"Library Notes:\n{note_lines or '(none)'}\n\n"
        "Identify leech notes (low ease_factor or stalled repetitions), write a concise diagnosis, "
        "and propose up to 3 remedial review tasks with YYYY-MM-DD dates using `submit_weekly_diagnosis`."
    )
    _, args = _invoke_fc(
        prompt=prompt,
        declarations=[SUBMIT_WEEKLY_DIAGNOSIS_DECL],
        allowed_names=["submit_weekly_diagnosis"],
        temperature=0.25,
        client=client,
        model=model,
    )
    by_id = {int(n["id"]): n for n in notes_summary}

    leeches: List[LeechNoteItem] = []
    for item in args.get("leech_notes") or []:
        nid = int(item["note_id"])
        if nid not in by_id:
            continue
        meta = by_id[nid]
        leeches.append(
            LeechNoteItem(
                note_id=nid,
                title=str(meta["title"]),
                ease_factor=float(meta["ease_factor"]),
                repetitions=int(meta["repetitions"]),
                reason=str(item.get("reason", "")),
            )
        )

    proposed: List[ProposedCramTask] = []
    for t in args.get("proposed_tasks") or []:
        nid = int(t["note_id"])
        if nid not in by_id:
            continue
        proposed.append(
            ProposedCramTask(
                note_id=nid,
                title=str(by_id[nid]["title"]),
                scheduled_date=str(t["scheduled_date"]),
                reason=str(t.get("reason", "")),
            )
        )

    return WeeklyDiagnosisResponse(
        headline=str(args.get("headline", "Study Health Diagnosis")),
        diagnosis=str(args.get("diagnosis", "")),
        leech_notes=leeches,
        proposed_tasks=proposed,
    )
