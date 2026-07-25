from typing import Optional
from pydantic import BaseModel, Field

class ShortAnswer(BaseModel):
    answer: str = Field(..., description="The answer corresponding to the question.")
    question: str = Field(..., description="A question generated from the note's content.")

class QuizQuestion(BaseModel):
    question: str = Field(..., description="The multiple-choice question text.")
    a: str = Field(..., description="Option A.")
    responsea: Optional[str] = Field(None, description="Response feedback for Option A.")
    b: str = Field(..., description="Option B.")
    responseb: Optional[str] = Field(None, description="Response feedback for Option B.")
    c: Optional[str] = Field(None, description="Option C.")
    responsec: Optional[str] = Field(None, description="Response feedback for Option C.")
    d: Optional[str] = Field(None, description="Option D.")
    responsed: Optional[str] = Field(None, description="Response feedback for Option D.")
    answer: str = Field(..., description="The correct answer (A, B, C, or D).")
    explanation: Optional[str] = Field(None, description="Explanation for the correct answer.")

class MultipleChoiceQuestion(BaseModel):
    question: str = Field(..., description="A multiple-choice question generated from the note's content.")
    options: list[str] = Field(..., description="A list of answer options for the multiple-choice question.")
    correct_option: str = Field(..., description="The correct answer option for the multiple-choice question.")

class FillInTheBlankQuestion(BaseModel):
    question: str = Field(..., description="A fill-in-the-blank question generated from the note's content.")
    answer: str = Field(..., description="The correct answer for the fill-in-the-blank question.")

class TrueFalseQuestion(BaseModel):
    question: str = Field(..., description="A true/false question generated from the note's content.")
    answer: bool = Field(..., description="The correct answer (True or False) for the true/false question.")