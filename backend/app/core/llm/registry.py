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
_PROVIDER_ENV_MAP: Dict[str, str] = {
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}
_RUNTIME_PROVIDER_OVERRIDE: Optional[str] = None


def _upsert_env_local(env_key: str, env_value: str) -> None:
    """Persist an API key to gitignored `<repo_root>/.env.local` without disturbing other lines."""
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[4]
    env_path = repo_root / ".env.local"
    lines: List[str] = []
    if env_path.is_file():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    prefix = f"{env_key}="
    replaced = False
    new_lines: List[str] = []
    for line in lines:
        if line.strip().startswith(prefix):
            if env_value:
                new_lines.append(f"{env_key}={env_value}")
            replaced = True
        else:
            new_lines.append(line)

    if not replaced and env_value:
        new_lines.append(f"{env_key}={env_value}")

    env_path.write_text("\n".join(new_lines) + ("\n" if new_lines else ""), encoding="utf-8")


def save_provider_api_key(
    provider_id: str,
    api_key: str,
    persist_env_file: bool = True,
) -> Dict[str, Any]:
    """Save or clear a provider API key at runtime and optionally persist to `.env.local`."""
    from ..config import settings

    pid = provider_id.strip().lower()
    if pid not in _PROVIDER_ENV_MAP:
        raise ValueError(f"Unknown LLM provider '{provider_id}'. Valid options: {', '.join(_PRIORITY_ORDER)}")

    env_key = _PROVIDER_ENV_MAP[pid]
    cleaned = api_key.strip()

    if cleaned:
        os.environ[env_key] = cleaned
        setattr(settings, env_key, cleaned)
        set_runtime_provider(pid)
    else:
        os.environ.pop(env_key, None)
        setattr(settings, env_key, None)
        if _RUNTIME_PROVIDER_OVERRIDE == pid:
            set_runtime_provider(None)

    if persist_env_file:
        _upsert_env_local(env_key, cleaned)

    return get_llm_status()


def save_provider_model(provider_id: str, model: str, persist_env_file: bool = True) -> Dict[str, Any]:
    """Set a provider model without changing its API key or active provider."""
    import re
    from ..config import settings

    pid = provider_id.strip().lower()
    if pid not in _PROVIDER_ENV_MAP:
        raise ValueError("Unknown LLM provider")
    cleaned = model.strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}", cleaned):
        raise ValueError("Invalid model ID")
    env_key = f"{pid.upper()}_MODEL"
    if persist_env_file:
        _upsert_env_local(env_key, cleaned)
    os.environ[env_key] = cleaned
    setattr(settings, "MODEL" if pid == "gemini" else env_key, cleaned)
    return get_llm_status()


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

    llm_lock_reason = None if available else "未偵測到任何 LLM API Key"
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
