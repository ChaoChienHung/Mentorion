from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence


class LLMNotConfiguredError(RuntimeError):
    """Raised when no LLM provider API key is configured."""


class UnsupportedCapabilityError(RuntimeError):
    """Raised when the active LLM provider does not support a requested capability."""


@dataclass(frozen=True)
class ProviderCapabilities:
    function_calling: bool = True
    web_search: bool = False


@dataclass(frozen=True)
class ToolSpec:
    """Provider-agnostic structured tool / function declaration."""

    name: str
    description: str
    parameters: Dict[str, Any]


@dataclass(frozen=True)
class ToolCallResult:
    name: str
    args: Dict[str, Any]


@dataclass(frozen=True)
class WebSource:
    title: str
    url: str
    snippet: str = ""


@dataclass(frozen=True)
class GroundedSearchResult:
    text: str
    sources: List[WebSource] = field(default_factory=list)


def normalize_schema_for_json(schema: Any) -> Any:
    """Convert Gemini-style uppercase JSON schema types (OBJECT/STRING/...) to standard lowercase."""
    if isinstance(schema, dict):
        out: Dict[str, Any] = {}
        for k, v in schema.items():
            if k == "type" and isinstance(v, str):
                out[k] = v.lower()
            else:
                out[k] = normalize_schema_for_json(v)
        return out
    if isinstance(schema, list):
        return [normalize_schema_for_json(item) for item in schema]
    return schema


def normalize_schema_for_gemini(schema: Any) -> Any:
    """Convert standard lowercase JSON schema types to Gemini-style uppercase types."""
    if isinstance(schema, dict):
        out: Dict[str, Any] = {}
        for k, v in schema.items():
            if k == "type" and isinstance(v, str):
                out[k] = v.upper()
            else:
                out[k] = normalize_schema_for_gemini(v)
        return out
    if isinstance(schema, list):
        return [normalize_schema_for_gemini(item) for item in schema]
    return schema


class BaseLLMProvider(ABC):
    """Unified interface implemented by all Mentorion LLM providers."""

    provider_id: str
    display_name: str
    capabilities: ProviderCapabilities

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if this provider's API key is present."""

    @abstractmethod
    def get_model_name(self, override: Optional[str] = None) -> str:
        """Return the effective model name for this provider."""

    @abstractmethod
    def call_tool(
        self,
        prompt: str,
        tools: Sequence[ToolSpec],
        allowed_tool_names: Optional[Sequence[str]] = None,
        temperature: float = 0.2,
        model: Optional[str] = None,
    ) -> ToolCallResult:
        """Invoke structured function/tool calling and return the first tool call."""

    @abstractmethod
    def generate_text(
        self,
        prompt: str,
        temperature: float = 0.3,
        model: Optional[str] = None,
    ) -> str:
        """Generate a plain text response."""

    def search_web_grounded(
        self,
        prompt: str,
        temperature: float = 0.3,
        model: Optional[str] = None,
    ) -> GroundedSearchResult:
        """Perform a web-grounded search returning synthesis text and verified URLs."""
        raise UnsupportedCapabilityError(
            f"Provider '{self.provider_id}' does not support grounded web search. "
            "Configure GEMINI_API_KEY and select the Gemini provider to unlock resource discovery."
        )
