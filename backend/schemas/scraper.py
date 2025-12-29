from typing import List
from pydantic import BaseModel, Field

class ExtractedArticle(BaseModel):
    title: str = Field(description="The title of the article.")
    success: bool = Field(description="Indicates whether the extraction was successful.")
    summary: str = Field(description="A concise summary and overview of the article's content.")
    content: str = Field(description="The main content of the article covering all important main points (general concepts, explanation, formulas, and details). Please ensure that the content is comprehensive and captures the essence of the topic discussed in the article.")
    related_concepts: List[str] = Field(description="Other related technologies, methods, or systems.")
    error_messages: List[str] = Field(default_factory=list, description="A list of error messages encountered during extraction, if any.")