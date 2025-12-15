from typing import List
from pydantic import BaseModel, Field

class WikipediaExtraction(BaseModel):
    title: str = Field(description="The title of the article.")
    summary: str = Field(description="A concise summary and overview of the article's content.")
    advantages: str = Field(description="Key advantages and benefits of the method or technology.")
    disadvantages: str = Field(description="Known limitations, drawbacks, or challenges associated with the method or technology.")
    related_concepts: str = Field(description="Other related technologies, methods, or systems.")
    history: str = Field(description="The historical development of the method, including origins, precursor methods, subsequent advancements, and relevant scientific or technological context.")
    references: List[str] = Field(description="A list of references cited in the article.")

class Analysis(BaseModel):
    techs: List[str] = Field(description="A list of technologies described.")
    result: str = Field(description="The output or findings produced by the function.")
    key_points: str = Field(description="Key insights derived from the results.")