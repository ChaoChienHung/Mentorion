from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from google.genai import types
from pydantic import TypeAdapter

from ..core.ai_client import create_gemini_client
from ..core.config import settings
from ..schemas.quiz import (
    QuestionSource,
    QuestionType,
    QuizQuestionItem,
    QuestionsSidecarFile,
)
from .schema_source import DocumentSchemaMapping, scan_markdown_source

_QUESTION_LIST_ADAPTER = TypeAdapter(List[QuizQuestionItem])

QUIZ_FUNCTION_DECLARATION = types.FunctionDeclaration(
    name="submit_quiz_questions",
    description=(
        "Submit structured active-recall quiz questions strictly matching the "
        "Mentorion Question Schema (mcq, short_answer, true_false, or open)."
    ),
    parameters={
        "type": "OBJECT",
        "properties": {
            "questions": {
                "type": "ARRAY",
                "description": "List of quiz questions generated from the study note.",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "type": {
                            "type": "STRING",
                            "enum": ["mcq", "short_answer", "true_false", "open"],
                            "description": "Question type discriminator.",
                        },
                        "prompt": {
                            "type": "STRING",
                            "description": "The question prompt text.",
                        },
                        "options": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                            "description": "Required for mcq: 2 to 6 answer choices.",
                        },
                        "answer": {
                            "type": "STRING",
                            "description": (
                                "For mcq: exact matching string from options. "
                                "For short_answer: concise reference answer. "
                                "For true_false: 'true' or 'false'."
                            ),
                        },
                        "rubric": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                            "description": "Optional key points for short_answer grading.",
                        },
                        "reference_points": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                            "description": "Optional key points for open/scenario questions.",
                        },
                        "explanation": {
                            "type": "STRING",
                            "description": "Optional explanation clarifying why the answer is correct.",
                        },
                    },
                    "required": ["type", "prompt"],
                },
            }
        },
        "required": ["questions"],
    },
)


def _normalize_raw_question(raw: Dict[str, Any], source: QuestionSource, idx: int) -> Dict[str, Any]:
    item = dict(raw)
    item.setdefault("id", f"q_{source}_{idx + 1}")
    item["source"] = source

    if item.get("type") == "true_false" and isinstance(item.get("answer"), str):
        item["answer"] = item["answer"].strip().lower() in ("true", "1", "yes")

    return item


def validate_questions(
    raw_items: Sequence[Dict[str, Any]],
    source: QuestionSource,
) -> List[QuizQuestionItem]:
    normalized = [_normalize_raw_question(item, source, i) for i, item in enumerate(raw_items)]
    return _QUESTION_LIST_ADAPTER.validate_python(normalized)


def load_sidecar_questions(
    source_dir: str,
    source_doc_id: str,
    mapping: Optional[DocumentSchemaMapping] = None,
) -> List[QuizQuestionItem]:
    """
    Source 1: Loads `questions.json` (or `<stem>.questions.json`) located alongside
    the matched Markdown document inside `source_dir` (e.g., `wiki/.../<slug>/questions.json`).
    """
    root = Path(os.path.expanduser(source_dir)).resolve()
    if not root.exists():
        return []

    scan_root = root / "wiki" if (root / "wiki").is_dir() else root
    docs = scan_markdown_source(source_dir, mapping=mapping, only_fresh=False)
    matched = next((d for d in docs if d.source_doc_id == source_doc_id), None)
    if not matched:
        return []

    md_path = scan_root / matched.rel_path
    candidates = [
        md_path.parent / "questions.json",
        md_path.with_suffix(".questions.json"),
    ]
    for q_path in candidates:
        if q_path.is_file():
            raw_json = json.loads(q_path.read_text(encoding="utf-8"))
            if isinstance(raw_json, list):
                return validate_questions(raw_json, "sidecar")
            parsed = QuestionsSidecarFile.model_validate(raw_json)
            return validate_questions(
                [q.model_dump() for q in parsed.questions],
                "sidecar",
            )
    return []


def load_inline_schema_questions(
    raw_questions: Optional[Sequence[Dict[str, Any]]],
) -> List[QuizQuestionItem]:
    """
    Source 2: Loads and validates questions embedded directly in the note's schema/frontmatter.
    """
    if not raw_questions:
        return []
    return validate_questions(raw_questions, "inline_schema")


def generate_questions_via_function_calling(
    title: str,
    content: str,
    count: int = 3,
    question_types: Sequence[QuestionType] = ("mcq", "short_answer"),
    client: Any = None,
    model: Optional[str] = None,
) -> List[QuizQuestionItem]:
    """
    Source 3: Uses Gemini Function Calling (`submit_quiz_questions`) to generate
    schema-validated quiz questions from note content.
    """
    ai_client = client or create_gemini_client()
    if ai_client is None:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured; cannot generate LLM questions."
        )

    types_str = ", ".join(question_types)
    prompt = (
        f"You are an expert spaced-repetition tutor. Generate {count} high-signal "
        f"active-recall questions from the study note below.\n"
        f"Allowed question types: [{types_str}].\n"
        f"- For `mcq`, choose an appropriate number of options (2-5) and ensure `answer` matches one option verbatim.\n"
        f"- Always include a clear, concise `explanation`.\n"
        f"- Call the `submit_quiz_questions` function with the result.\n\n"
        f"Title: {title}\n\n"
        f"Content:\n{content[:12000]}"
    )

    tool = types.Tool(function_declarations=[QUIZ_FUNCTION_DECLARATION])
    config = types.GenerateContentConfig(
        tools=[tool],
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(
                mode="ANY",
                allowed_function_names=["submit_quiz_questions"],
            )
        ),
        temperature=0.3,
    )

    response = ai_client.models.generate_content(
        model=model or settings.MODEL,
        contents=prompt,
        config=config,
    )

    function_calls = getattr(response, "function_calls", None) or []
    for call in function_calls:
        if getattr(call, "name", None) == "submit_quiz_questions":
            args = getattr(call, "args", {}) or {}
            raw_list = args.get("questions", [])
            return validate_questions(raw_list, "llm")

    raise RuntimeError("LLM did not invoke submit_quiz_questions function call.")
