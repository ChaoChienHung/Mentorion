from typing import List
from pydantic import BaseModel, Field
from backend.schemas.question import ShortAnswer as QA

class Note(BaseModel):
    title: str = Field(description="The title of the extracted note.")
    success: bool = Field(description="Indicates whether the extraction was successful.")
    summary: str = Field(description="A concise summary of the note's content.")
    content: str = Field(description="A well-structured markdown note containing the detailed content.")
    related_concepts: List[str] = Field(description="Other related concepts mentioned in the note.")
    qa: List[QA] = Field(default_factory=list, description="A list of question-answer pairs generated from the note.")
    error_messages: List[str] = Field(default_factory=list, description="A list of error messages encountered during extraction, if any.")

class NoteRequest(BaseModel):
    url: str = Field(default="", description="The URL of the note to be scraped.")
    raw_content: str = Field(default="", description="The raw content of the note to be parsed.")