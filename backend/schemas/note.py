from typing import List
from pydantic import BaseModel, Field

class Note(BaseModel):
    title: str = Field(description="The title of the extracted note.")
    success: bool = Field(description="Indicates whether the extraction was successful.")
    summary: str = Field(description="A concise summary of the note's content.")
    content: str = Field(description="The full content of the note.")
    related_concepts: List[str] = Field(description="Other related concepts mentioned in the note.")
    questions: List[str] = Field(default_factory=list, description="A list of questions generated from the note's content.")
    answers: List[str] = Field(default_factory=list, description="A list of answers corresponding to the generated questions.")
    error_messages: List[str] = Field(default_factory=list, description="A list of error messages encountered during extraction, if any.")

class NoteRequest(BaseModel):
    url: str = Field(default="", description="The URL of the note to be scraped.")
    raw_content: str = Field(description="The raw content of the note to be parsed.")