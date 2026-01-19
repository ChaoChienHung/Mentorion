from pydantic import BaseModel, Field

class ShortAnswer(BaseModel):
    answer: str = Field(..., description="The answer corresponding to the question.")
    question: str = Field(..., description="A question generated from the note's content.")

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