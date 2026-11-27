import json
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from backend.app.domain.quiz_engine import (
    generate_questions_via_function_calling,
    load_inline_schema_questions,
    load_sidecar_questions,
    validate_questions,
)


def test_source_1_loads_questions_json_sidecar_from_wiki_bundle():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        bundle = vault / "wiki" / "AI" / "clustering"
        bundle.mkdir(parents=True)
        (bundle / "index.md").write_text(
            "---\nid: doc.clustering\ntitle: Clustering\n---\n\n# Clustering\nUnsupervised.\n",
            encoding="utf-8",
        )
        (bundle / "questions.json").write_text(
            json.dumps(
                {
                    "version": 1,
                    "doc_id": "doc.clustering",
                    "questions": [
                        {
                            "type": "mcq",
                            "prompt": "Which paradigm does clustering belong to?",
                            "options": ["Supervised", "Unsupervised", "Reinforcement"],
                            "answer": "Unsupervised",
                            "explanation": "Clustering discovers groups without labels.",
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )

        questions = load_sidecar_questions(str(vault), "doc.clustering")
        assert len(questions) == 1
        assert questions[0].type == "mcq"
        assert questions[0].source == "sidecar"
        assert len(questions[0].options) == 3
        assert questions[0].answer == "Unsupervised"


def test_source_2_loads_inline_schema_questions():
    inline = [
        {
            "type": "short_answer",
            "prompt": "Why does k-means need a distance metric?",
            "answer": "To assign points to the nearest centroid.",
            "rubric": ["distance", "centroid"],
        },
        {
            "type": "true_false",
            "prompt": "Clustering requires labeled training data.",
            "answer": False,
            "explanation": "Clustering is unsupervised.",
        },
    ]
    questions = load_inline_schema_questions(inline)
    assert len(questions) == 2
    assert questions[0].source == "inline_schema"
    assert questions[1].type == "true_false"
    assert questions[1].answer is False


def test_source_3_generates_questions_via_llm_function_calling_mock():
    class FakeModels:
        def generate_content(self, model, contents, config):
            return SimpleNamespace(
                function_calls=[
                    SimpleNamespace(
                        name="submit_quiz_questions",
                        args={
                            "questions": [
                                {
                                    "type": "mcq",
                                    "prompt": "What does SM-2 adjust after each review?",
                                    "options": [
                                        "Ease factor and interval",
                                        "Font size",
                                    ],
                                    "answer": "Ease factor and interval",
                                    "explanation": "SM-2 scales intervals by ease factor.",
                                },
                                {
                                    "type": "open",
                                    "prompt": "Compare SM-2 with fixed 2^n intervals.",
                                    "reference_points": ["adaptive ease", "fixed exponential"],
                                },
                            ]
                        },
                    )
                ]
            )

    fake_client = SimpleNamespace(models=FakeModels())
    questions = generate_questions_via_function_calling(
        title="Spaced Repetition",
        content="SM-2 adapts intervals based on ease factor.",
        count=2,
        question_types=("mcq", "open"),
        client=fake_client,
    )
    assert len(questions) == 2
    assert questions[0].type == "mcq"
    assert questions[0].source == "llm"
    assert len(questions[0].options) == 2
    assert questions[1].type == "open"


def test_mcq_validation_rejects_answer_not_in_options():
    with pytest.raises(ValidationError):
        validate_questions(
            [
                {
                    "type": "mcq",
                    "prompt": "Pick one",
                    "options": ["A", "B"],
                    "answer": "C",
                }
            ],
            "llm",
        )


def test_generate_questions_with_related_concepts_context():
    captured_prompts = []

    class FakeModels:
        def generate_content(self, model, contents, config):
            captured_prompts.append(contents)
            return SimpleNamespace(
                function_calls=[
                    SimpleNamespace(
                        name="submit_quiz_questions",
                        args={
                            "questions": [
                                {
                                    "type": "short_answer",
                                    "prompt": "Compare Attention with RNN sequence processing.",
                                    "answer": "Attention computes pairwise token interactions in parallel, unlike RNN recurrence.",
                                    "explanation": "Cross-concept contrast.",
                                }
                            ]
                        },
                    )
                ]
            )

    fake_client = SimpleNamespace(models=FakeModels())
    qs = generate_questions_via_function_calling(
        title="Attention",
        content="Scaled dot-product attention computes weighted sums.",
        count=1,
        question_types=("short_answer",),
        related_concepts=[
            {"label": "RNN", "relation": "contrasts_with", "summary": "Sequential hidden state update"}
        ],
        client=fake_client,
    )
    assert len(qs) == 1
    assert "Related Neighbor Concepts" in captured_prompts[0]
    assert "RNN (contrasts_with)" in captured_prompts[0]
