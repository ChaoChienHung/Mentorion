import tempfile
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.db.base import Base
from backend.app.db.models import Note as DBNote
from backend.app.domain.question_bank import (
    append_questions_for_note,
    get_questions_for_note,
    verify_bidirectional_consistency,
)
from backend.app.domain.quiz_engine import grade_essay_via_function_calling
from backend.app.schemas.quiz import MCQQuestion, ShortEssayQuestion


def _make_memory_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def _create_note(db, title="Clustering Foundations", source_doc_id="doc.clustering"):
    note = DBNote(
        user_id=1,
        source_doc_id=source_doc_id,
        file_path="wiki/AI/clustering/index.md",
        question_ids=[],
        title=title,
        content="Clustering groups unlabeled points by similarity.",
        category="AI / ML",
        type="new",
        pattern="C",
        created_at="2026-11-26T00:00:00Z",
        first_date="2026-11-26",
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def test_bidirectional_question_ownership_and_deduplication():
    db = _make_memory_db()
    note = _create_note(db)
    with tempfile.TemporaryDirectory() as tmp:
        bank_path = Path(tmp) / "questions.json"
        q1 = MCQQuestion(
            prompt="Which learning paradigm does clustering belong to?",
            options=["Supervised", "Unsupervised"],
            answer="Unsupervised",
            source="llm",
        )
        q2 = ShortEssayQuestion(
            prompt="Explain why distance metrics matter in k-means clustering.",
            reference_points=["assign points to nearest centroid", "scale sensitivity"],
            source="llm",
        )
        dup_q1 = MCQQuestion(
            prompt="Which learning paradigm does clustering belong to",
            options=["Supervised", "Unsupervised"],
            answer="Unsupervised",
            source="llm",
        )

        added, skipped = append_questions_for_note(db, note, [q1, q2, dup_q1], bank_path)
        assert len(added) == 2
        assert skipped == 1
        assert len(note.question_ids) == 2

        # Verify bidirectional consistency: note.question_ids <-> questions.json.owner_note_id
        errors = verify_bidirectional_consistency(db, bank_path)
        assert errors == []


def test_fallback_reconciles_question_ids_from_ownership():
    db = _make_memory_db()
    note = _create_note(db)
    with tempfile.TemporaryDirectory() as tmp:
        bank_path = Path(tmp) / "questions.json"
        q1 = MCQQuestion(
            prompt="What is the objective of clustering?",
            options=["Group similar unlabeled points", "Predict continuous labels"],
            answer="Group similar unlabeled points",
            source="llm",
        )
        append_questions_for_note(db, note, [q1], bank_path)

        # Simulate drift: wipe note.question_ids in SQLite while questions.json retains owner_note_id
        note.question_ids = []
        db.add(note)
        db.commit()
        assert len(verify_bidirectional_consistency(db, bank_path)) == 1

        # Fallback filters questions.json by owner_note_id and self-heals note.question_ids
        recovered = get_questions_for_note(db, note, bank_path)
        assert len(recovered) == 1
        assert recovered[0].owner_note_id == note.id
        assert verify_bidirectional_consistency(db, bank_path) == []


def test_grade_essay_via_function_calling_mock():
    class FakeModels:
        def generate_content(self, model, contents, config):
            return SimpleNamespace(
                function_calls=[
                    SimpleNamespace(
                        name="grade_essay_answer",
                        args={
                            "score": 4,
                            "correct_points": ["Correctly explained centroid assignment."],
                            "corrections": ["Did not mention feature scaling sensitivity."],
                            "suggestions": ["Add a brief example of standardization before k-means."],
                            "summary_feedback": "Solid core understanding; add feature scaling next time.",
                        },
                    )
                ]
            )

    fake_client = SimpleNamespace(models=FakeModels())
    res = grade_essay_via_function_calling(
        title="Clustering",
        content="K-means assigns points to nearest centroids and is sensitive to feature scaling.",
        prompt="Why do distance metrics matter in k-means?",
        user_answer="Because k-means computes distance to assign each point to the nearest centroid.",
        reference_points=["centroid assignment", "feature scaling"],
        client=fake_client,
    )
    assert res.score == 4
    assert len(res.correct_points) == 1
    assert len(res.corrections) == 1
    assert len(res.suggestions) == 1
