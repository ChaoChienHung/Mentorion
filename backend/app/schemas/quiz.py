from __future__ import annotations

from typing import Annotated, List, Literal, Optional, Union
from pydantic import BaseModel, Field, model_validator

QuestionSource = Literal["sidecar", "inline_schema", "llm", "bank", "manual"]
QuestionType = Literal[
    "mcq",
    "short_answer",
    "true_false",
    "open",
    "short_essay",
    "essay",
    "fill_in_blank",
]
BloomLevel = Literal["recall", "understand", "apply", "analyze"]


class BaseQuizQuestion(BaseModel):
    id: Optional[str] = None
    owner_note_id: Optional[int] = None
    source_doc_id: Optional[str] = None
    category: Optional[str] = None
    bloom_level: Optional[BloomLevel] = None
    prompt: str = Field(..., min_length=1)
    explanation: Optional[str] = None
    source: QuestionSource = "llm"


class MCQQuestion(BaseQuizQuestion):
    type: Literal["mcq"] = "mcq"
    options: List[str] = Field(..., min_length=2)
    answer: str = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_answer_in_options(self) -> "MCQQuestion":
        if self.answer not in self.options:
            if self.answer.isdigit():
                idx = int(self.answer)
                if 0 <= idx < len(self.options):
                    self.answer = self.options[idx]
                    return self
            raise ValueError("MCQ answer must match one of the provided options")
        return self


class ShortAnswerQuestion(BaseQuizQuestion):
    type: Literal["short_answer"] = "short_answer"
    answer: str = Field(..., min_length=1)
    rubric: List[str] = Field(default_factory=list)


class TrueFalseQuestion(BaseQuizQuestion):
    type: Literal["true_false"] = "true_false"
    answer: bool


class OpenQuestion(BaseQuizQuestion):
    type: Literal["open"] = "open"
    reference_points: List[str] = Field(default_factory=list)


class ShortEssayQuestion(BaseQuizQuestion):
    type: Literal["short_essay"] = "short_essay"
    reference_points: List[str] = Field(default_factory=list)
    rubric: List[str] = Field(default_factory=list)


class EssayQuestion(BaseQuizQuestion):
    type: Literal["essay"] = "essay"
    reference_points: List[str] = Field(default_factory=list)
    rubric: List[str] = Field(default_factory=list)


class FillInBlankQuestion(BaseQuizQuestion):
    type: Literal["fill_in_blank"] = "fill_in_blank"
    blanks: List[str] = Field(..., min_length=1)


QuizQuestionItem = Annotated[
    Union[
        MCQQuestion,
        ShortAnswerQuestion,
        TrueFalseQuestion,
        OpenQuestion,
        ShortEssayQuestion,
        EssayQuestion,
        FillInBlankQuestion,
    ],
    Field(discriminator="type"),
]


class QuestionsSidecarFile(BaseModel):
    version: int = 1
    doc_id: Optional[str] = None
    questions: List[QuizQuestionItem] = Field(default_factory=list)


class QuizLoadRequest(BaseModel):
    note_id: Optional[int] = None
    title: Optional[str] = None
    content: Optional[str] = None
    source_doc_id: Optional[str] = None
    source_dir: Optional[str] = None
    inline_questions: Optional[List[dict]] = None
    generate_if_empty: bool = False
    count: int = Field(default=3, ge=1, le=10)
    question_types: List[QuestionType] = Field(
        default_factory=lambda: ["mcq", "short_answer", "short_essay"]
    )


class QuizGenerateRequest(BaseModel):
    note_id: Optional[int] = None
    title: str
    content: str
    count: int = Field(default=3, ge=1, le=10)
    question_types: List[QuestionType] = Field(
        default_factory=lambda: ["mcq", "short_answer", "short_essay"]
    )


class QuizResponse(BaseModel):
    questions: List[QuizQuestionItem]
    sources_used: List[QuestionSource]


class EssayGradeRequest(BaseModel):
    note_id: Optional[int] = None
    title: str
    content: str
    prompt: str
    user_answer: str = Field(..., min_length=1)
    reference_points: List[str] = Field(default_factory=list)


class EssayGradeResponse(BaseModel):
    score: int = Field(..., ge=0, le=5)
    correct_points: List[str] = Field(default_factory=list)
    corrections: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)
    summary_feedback: str
