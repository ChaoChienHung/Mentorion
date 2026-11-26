from types import SimpleNamespace

from backend.app.domain.study_coach import (
    audit_question_bank_via_fc,
    diagnose_study_health_via_fc,
    generate_remediation_via_fc,
    plan_reschedule_via_fc,
    socratic_probe_via_fc,
)
from backend.app.schemas.quiz import MCQQuestion, ShortEssayQuestion


def _mock_client(fn_name: str, args: dict):
    fc = SimpleNamespace(name=fn_name, args=args)
    part = SimpleNamespace(function_call=fc)
    cand = SimpleNamespace(content=SimpleNamespace(parts=[part]))
    resp = SimpleNamespace(candidates=[cand])

    class _FakeModels:
        def generate_content(self, **_kwargs):
            return resp

    return SimpleNamespace(models=_FakeModels())


def test_plan_reschedule_via_fc_filters_valid_ids():
    client = _mock_client(
        "propose_reschedule",
        {
            "summary": "Moved Thursday tasks to Saturday.",
            "moves": [
                {"task_id": 10, "new_date": "2026-11-28", "reason": "Deadline relief"},
                {"task_id": 999, "new_date": "2026-11-29", "reason": "Invalid id should drop"},
            ],
        },
    )
    res = plan_reschedule_via_fc(
        instruction="Move Thursday tasks to Saturday",
        pending_tasks=[{"id": 10, "scheduled_date": "2026-11-26", "note_title": "Transformers", "type": "revision"}],
        today_str="2026-11-26",
        client=client,
    )
    assert len(res.moves) == 1
    assert res.moves[0].task_id == 10
    assert res.moves[0].new_date == "2026-11-28"
    assert res.moves[0].old_date == "2026-11-26"


def test_generate_remediation_via_fc():
    client = _mock_client(
        "submit_quiz_questions",
        {
            "questions": [
                {
                    "type": "short_answer",
                    "prompt": "Why does scaling dot-product attention by sqrt(d_k) prevent vanishing gradients?",
                    "answer": "It keeps softmax inputs in a moderate variance regime.",
                }
            ]
        },
    )
    gap, qs = generate_remediation_via_fc(
        title="Attention",
        content="Scaled dot-product attention divides by sqrt(d_k).",
        missed_prompt="Explain attention scaling",
        gap_notes="Forgot variance stabilization",
        client=client,
    )
    assert "variance" in gap
    assert len(qs) == 1
    assert qs[0].type == "short_answer"


def test_audit_question_bank_via_fc():
    q1 = MCQQuestion(id="q_1", prompt="What is K-means?", options=["A", "B"], answer="A")
    q2 = ShortEssayQuestion(id="q_2", prompt="Compare K-means and GMM on elliptical clusters.")
    client = _mock_client(
        "submit_question_audit",
        {
            "summary": "Tagged 2 questions, no duplicates.",
            "classifications": [
                {"question_id": "q_1", "bloom_level": "recall"},
                {"question_id": "q_2", "bloom_level": "analyze"},
            ],
            "drop_duplicate_ids": [],
        },
    )
    tags, drops, summary = audit_question_bank_via_fc("Clustering", [q1, q2], client=client)
    assert tags == {"q_1": "recall", "q_2": "analyze"}
    assert drops == []
    assert "Tagged" in summary


def test_socratic_probe_hint_and_commit():
    hint_client = _mock_client(
        "ask_followup_hint",
        {
            "hint": "Think about what happens to softmax saturation when d_k is large.",
            "followup_question": "How does the variance of q·k grow with d_k?",
            "missing_points": ["variance grows linearly with d_k"],
            "strengths": ["mentioned softmax"],
            "summary": "Close! Let's check the variance scaling.",
        },
    )
    r1 = socratic_probe_via_fc(
        title="Attention",
        content="...",
        question_prompt="Why divide by sqrt(d_k)?",
        user_answer="Because softmax gets too big.",
        round_number=1,
        client=hint_client,
    )
    assert r1.action == "hint"
    assert r1.followup_question is not None

    commit_client = _mock_client(
        "commit_review_rating",
        {
            "sm2_rating": 4,
            "summary": "Solid grasp after follow-up.",
            "strengths": ["explained variance scaling"],
            "missing_points": [],
        },
    )
    r2 = socratic_probe_via_fc(
        title="Attention",
        content="...",
        question_prompt="Why divide by sqrt(d_k)?",
        user_answer="Variance grows as d_k so dividing by sqrt(d_k) keeps unit variance.",
        round_number=2,
        client=commit_client,
    )
    assert r2.action == "commit"
    assert r2.sm2_rating == 4


def test_diagnose_study_health_via_fc():
    client = _mock_client(
        "submit_weekly_diagnosis",
        {
            "headline": "2 notes need attention",
            "diagnosis": "Clustering Foundations has a dropping ease factor.",
            "leech_notes": [{"note_id": 1, "reason": "Ease factor dropped to 1.6"}],
            "proposed_tasks": [
                {"note_id": 1, "scheduled_date": "2026-11-27", "reason": "Reinforce weak points"}
            ],
        },
    )
    res = diagnose_study_health_via_fc(
        notes_summary=[
            {"id": 1, "title": "Clustering Foundations", "category": "AI", "ease_factor": 1.6, "repetitions": 1, "interval_days": 1}
        ],
        overdue_count=2,
        deficit_points=2.0,
        today_str="2026-11-26",
        client=client,
    )
    assert len(res.leech_notes) == 1
    assert res.leech_notes[0].title == "Clustering Foundations"
    assert len(res.proposed_tasks) == 1
    assert res.proposed_tasks[0].scheduled_date == "2026-11-27"
