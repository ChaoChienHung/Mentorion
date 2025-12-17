from typing import List
from pydantic import BaseModel, Field

class ExtractedArticle(BaseModel):
    title: str = Field(description="The title of the article.")
    summary: str = Field(description="A concise summary and overview of the article's content.")
    content: str = Field(description="The main content of the article covering all the important knowledge and main points. Please ensure that the content is comprehensive and captures the essence of the topic discussed in the article.")
    related_concepts: str = Field(description="Other related technologies, methods, or systems.")
