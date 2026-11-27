from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from .base import BaseLLMProvider, LLMNotConfiguredError
from .providers import AnthropicProvider, GeminiProvider, OpenAIProvider

_PROVIDERS: Dict[str, BaseLLMProvider] = {
    "gemini": GeminiProvider(),
    "openai": OpenAIProvider(),
    "anthropic": AnthropicProvider(),
}

_PRIORITY_ORDER = ("gemini", "openai", "anthropic")
_RUNTIME_PROVIDER_OVERRIDE: Optional[str] = None


def list_providers() -> List[BaseLLMProvider]:
    return [_PROVIDERS[pid] for pid in _PRIORITY_ORDER]


def get_provider_by_id(provider_id: str) -> Optional[BaseLLMProvider]:
    return _PROVIDERS.get(provider_id.strip().lower())


def set_runtime_provider(provider_id: Optional[str]) -> Optional[str]:
    """Set or clear the runtime active provider preference ('gemini'|'openai'|'anthropic'|'auto'|None)."""
    global _RUNTIME_PROVIDER_OVERRIDE
    if not provider_id or provider_id.strip().lower() == "auto":
        _RUNTIME_PROVIDER_OVERRIDE = None
        return None
    pid = provider_id.strip().lower()
    if pid not in _PROVIDERS:
        raise ValueError(f"Unknown LLM provider '{provider_id}'. Valid options: {', '.join(_PRIORITY_ORDER)}, auto")
    if not _PROVIDERS[pid].is_configured():
        raise LLMNotConfiguredError(f"Provider '{pid}' is not configured (missing API key).")
    _RUNTIME_PROVIDER_OVERRIDE = pid
    return _RUNTIME_PROVIDER_OVERRIDE


def get_active_provider(preferred_provider: Optional[str] = None) -> Optional[BaseLLMProvider]:
    """
    Resolve the active configured LLM provider.
    Priority: explicit argument -> runtime UI override -> LLM_PROVIDER env -> auto (gemini -> openai -> anthropic).
    """
    choice = (
        preferred_provider
        or _RUNTIME_PROVIDER_OVERRIDE
        or os.getenv("LLM_PROVIDER")
        or "auto"
    ).strip().lower()

    if choice and choice != "auto":
        prov = _PROVIDERS.get(choice)
        if prov and prov.is_configured():
            return prov
        return None

    for pid in _PRIORITY_ORDER:
        prov = _PROVIDERS[pid]
        if prov.is_configured():
            return prov
    return None


def require_active_provider(preferred_provider: Optional[str] = None) -> BaseLLMProvider:
    prov = get_active_provider(preferred_provider)
    if prov is None:
        raise LLMNotConfiguredError(
            "No LLM API key detected. Configure GEMINI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY."
        )
    return prov


def get_llm_status() -> Dict[str, Any]:
    active = get_active_provider()
    providers_info = []
    for pid in _PRIORITY_ORDER:
        prov = _PROVIDERS[pid]
        providers_info.append(
            {
                "id": prov.provider_id,
                "name": prov.display_name,
                "configured": prov.is_configured(),
                "model": prov.get_model_name(),
                "supports_function_calling": prov.capabilities.function_calling,
                "supports_web_search": prov.capabilities.web_search,
            }
        )

    available = active is not None
    supports_fc = bool(active and active.capabilities.function_calling)
    supports_web = bool(active and active.capabilities.web_search)

    llm_lock_reason = (
        None
        if available
        else "未偵測到任何 LLM API Key（請設定 GEMINI_API_KEY、OPENAI_API_KEY 或 ANTHROPIC_API_KEY）"
    )
    web_lock_reason = (
        None
        if supports_web
        else (
            llm_lock_reason
            if not available
            else f"目前使用 {active.display_name}；探索外部資源需要 Gemini（Google Search Grounding），請切換至 Gemini 或設定 GEMINI_API_KEY。"
        )
    )

    return {
        "available": available,
        "active_provider": active.provider_id if active else None,
        "active_provider_name": active.display_name if active else None,
        "active_model": active.get_model_name() if active else None,
        "providers": providers_info,
        "capabilities": {
            "quiz_generation": supports_fc,
            "essay_grading": supports_fc,
            "study_mentor": supports_fc,
            "resource_discovery": supports_web,
            "resource_summarize": available,
        },
        "lock_reasons": {
            "llm": llm_lock_reason,
            "resource_discovery": web_lock_reason,
        },
    }
