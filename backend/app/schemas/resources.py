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


class LLMModelSaveRequest(BaseModel):
    provider: str = Field(..., description="Provider ID")
    model: str = Field(..., description="Model ID")


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


class VaultStatusResponse(BaseModel):
    vault_dir: str
    is_custom_vault: bool
    db_path: str
    question_bank_path: str
    library_dir: str
    note_count: int
    question_count: int
    resource_count: int
    is_git_repo: bool
    git_dirty: Optional[bool] = None


class ExternalReviewRecordRequest(BaseModel):
    source_doc_id: str = Field(..., min_length=1)
    file_path: Optional[str] = None
    mode: Literal["sm2", "custom_date"] = "sm2"
    rating: int = Field(default=4, ge=0, le=5)
    next_review_date: Optional[str] = None
    anchor_option: Literal["A", "B"] = "B"
    actual_date: Optional[str] = None


class ExternalReviewRecordResponse(BaseModel):
    ok: bool = True
    scheduled: bool
    note_id: Optional[int] = None
    source_doc_id: str
    mode: Literal["sm2", "custom_date", "practice"]
    rating: int
    last_reviewed_at: str
    next_review_date: Optional[str] = None
    interval_days: Optional[int] = None
    ease_factor: Optional[float] = None
    repetitions: Optional[int] = None


class TrackedSourceItem(BaseModel):
    note_id: int
    source_doc_id: Optional[str] = None
    file_path: Optional[str] = None
    has_pending_task: bool
    next_review_date: Optional[str] = None
