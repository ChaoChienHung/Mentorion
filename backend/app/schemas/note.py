from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict
from .question import ShortAnswer as QA, QuizQuestion

class Note(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "title": "Python Basics",
                    "success": True,
                    "summary": "Python is a general-purpose programming language.",
                    "content": "Python is a general-purpose programming language...",
                    "related_concepts": ["Interpreter", "Dynamic typing"],
                    "qa": [{"question": "What is Python?", "answer": "A programming language."}],
                    "quizzes": [
                        {
                            "question": "What is Python?",
                            "a": "A snake",
                            "b": "A programming language",
                            "answer": "b",
                            "explanation": "Python is a general-purpose programming language."
                        }
                    ],
                    "qprompt": "You are given a set of notes...",
                    "raw_markdown": "<meta>...</meta>\n\nPython Basics...",
                    "error_messages": [],
                }
            ]
        }
    )
    title: str = Field(description="The title of the extracted note.")
    success: bool = Field(description="Indicates whether the extraction was successful.")
    summary: str = Field(description="A concise summary of the note's content.")
    content: str = Field(description="A well-structured markdown note containing the detailed content.")
    related_concepts: List[str] = Field(description="Other related concepts mentioned in the note.")
    qa: List[QA] = Field(default_factory=list, description="A list of question-answer pairs generated from the note.")
    quizzes: List[QuizQuestion] = Field(default_factory=list, description="A list of multiple choice questions generated from the note.")
    qprompt: Optional[str] = Field(None, description="The quiz generation prompt text.")
    raw_markdown: Optional[str] = Field(None, description="The raw markdown string representation of the note.")
    error_messages: List[str] = Field(default_factory=list, description="A list of error messages encountered during extraction, if any.")

class NoteRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"url": "https://en.wikipedia.org/wiki/Python_(programming_language)", "raw_content": ""}
            ]
        }
    )
    url: str = Field(default="", description="The URL of the note to be scraped.")
    raw_content: str = Field(default="", description="The raw content of the note to be parsed.")

