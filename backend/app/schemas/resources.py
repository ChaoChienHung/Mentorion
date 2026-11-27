from __future__ import annotations

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class LLMProviderInfo(BaseModel):
    id: str
    name: str
    configured: bool
    model: str
    supports_function_calling: bool
    supports_web_search: bool


class LLMCapabilitiesStatus(BaseModel):
    quiz_generation: bool
    essay_grading: bool
    study_mentor: bool
    resource_discovery: bool
    resource_summarize: bool


class LLMLockReasons(BaseModel):
    llm: Optional[str] = None
    resource_discovery: Optional[str] = None


class LLMStatusResponse(BaseModel):
    available: bool
    active_provider: Optional[str] = None
    active_provider_name: Optional[str] = None
    active_model: Optional[str] = None
    providers: List[LLMProviderInfo] = Field(default_factory=list)
    capabilities: LLMCapabilitiesStatus
    lock_reasons: LLMLockReasons


class LLMProviderSwitchRequest(BaseModel):
    provider: str = Field(..., description="'gemini', 'openai', 'anthropic', or 'auto'")


class LLMKeySaveRequest(BaseModel):
    provider: str = Field(..., description="'gemini', 'openai', or 'anthropic'")
    api_key: str = Field(..., description="API key string (empty string clears the key)")


ResourceSourceType = Literal["paper", "docs", "video", "blog", "web"]


class DiscoveredResourceItem(BaseModel):
    title: str
    url: str
    source_type: ResourceSourceType = "web"
    relevance_note: str = ""


class ResourceDiscoverRequest(BaseModel):
    note_id: Optional[int] = None
    topic: Optional[str] = None
    query: str = ""
    max_results: int = Field(default=5, ge=1, le=10)


class ResourceDiscoverResponse(BaseModel):
    synthesis: str
    resources: List[DiscoveredResourceItem] = Field(default_factory=list)
    provider: str
    model: str


class NoteResourceCreate(BaseModel):
    note_id: Optional[int] = None
    topic: Optional[str] = None
    title: str = Field(..., min_length=1)
    url: str = Field(..., min_length=4)
    source_type: ResourceSourceType = "web"
    relevance_note: str = ""
    summary: Optional[str] = None


class NoteResourceResponse(BaseModel):
    id: int
    note_id: Optional[int] = None
    topic: Optional[str] = None
    title: str
    url: str
    source_type: str
    relevance_note: str
    summary: Optional[str] = None
    created_at: str


class CrossSourceQuizRequest(BaseModel):
    note_id: int
    resource_ids: List[int] = Field(default_factory=list)
    count: int = Field(default=3, ge=1, le=8)
