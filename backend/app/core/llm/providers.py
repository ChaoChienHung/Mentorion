from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Sequence

import requests
from google import genai
from google.genai import types as genai_types

from ..config import settings
from .base import (
    BaseLLMProvider,
    GroundedSearchResult,
    LLMNotConfiguredError,
    ProviderCapabilities,
    ToolCallResult,
    ToolSpec,
    WebSource,
    normalize_schema_for_gemini,
    normalize_schema_for_json,
)


def _env_or_setting(env_name: str, setting_val: Optional[str]) -> Optional[str]:
    val = os.getenv(env_name)
    if val is not None:
        return val.strip() or None
    return (setting_val or "").strip() or None


class GeminiProvider(BaseLLMProvider):
    provider_id = "gemini"
    display_name = "Google Gemini"
    capabilities = ProviderCapabilities(function_calling=True, web_search=True)

    def _api_key(self) -> Optional[str]:
        return _env_or_setting("GEMINI_API_KEY", settings.GEMINI_API_KEY)

    def is_configured(self) -> bool:
        return bool(self._api_key())

    def get_model_name(self, override: Optional[str] = None) -> str:
        return override or os.getenv("GEMINI_MODEL") or settings.MODEL or "gemini-2.5-flash"

    def _client(self) -> Any:
        key = self._api_key()
        if not key:
            raise LLMNotConfiguredError("GEMINI_API_KEY is not configured.")
        return genai.Client(api_key=key)

    def call_tool(
        self,
        prompt: str,
        tools: Sequence[ToolSpec],
        allowed_tool_names: Optional[Sequence[str]] = None,
        temperature: float = 0.2,
        model: Optional[str] = None,
    ) -> ToolCallResult:
        client = self._client()
        declarations = [
            genai_types.FunctionDeclaration(
                name=t.name,
                description=t.description,
                parameters=normalize_schema_for_gemini(t.parameters),
            )
            for t in tools
        ]
        allowed = list(allowed_tool_names) if allowed_tool_names else [t.name for t in tools]
        config = genai_types.GenerateContentConfig(
            tools=[genai_types.Tool(function_declarations=declarations)],
            tool_config=genai_types.ToolConfig(
                function_calling_config=genai_types.FunctionCallingConfig(
                    mode="ANY",
                    allowed_function_names=allowed,
                )
            ),
            temperature=temperature,
        )
        response = client.models.generate_content(
            model=self.get_model_name(model),
            contents=prompt,
            config=config,
        )

        # Check top-level response.function_calls first
        function_calls = getattr(response, "function_calls", None) or []
        for call in function_calls:
            name = getattr(call, "name", None)
            if name:
                return ToolCallResult(name=str(name), args=dict(getattr(call, "args", {}) or {}))

        # Fallback: inspect candidates[].content.parts[].function_call
        for cand in getattr(response, "candidates", None) or []:
            content_obj = getattr(cand, "content", None)
            for part in getattr(content_obj, "parts", None) or []:
                fc = getattr(part, "function_call", None)
                if fc is not None and getattr(fc, "name", None):
                    return ToolCallResult(name=str(fc.name), args=dict(getattr(fc, "args", {}) or {}))

        raise RuntimeError("Gemini response did not include a function call.")

    def generate_text(
        self,
        prompt: str,
        temperature: float = 0.3,
        model: Optional[str] = None,
    ) -> str:
        client = self._client()
        response = client.models.generate_content(
            model=self.get_model_name(model),
            contents=prompt,
            config=genai_types.GenerateContentConfig(temperature=temperature),
        )
        return str(getattr(response, "text", "") or "").strip()

    def search_web_grounded(
        self,
        prompt: str,
        temperature: float = 0.3,
        model: Optional[str] = None,
    ) -> GroundedSearchResult:
        client = self._client()
        config = genai_types.GenerateContentConfig(
            tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
            temperature=temperature,
        )
        response = client.models.generate_content(
            model=self.get_model_name(model),
            contents=prompt,
            config=config,
        )
        text = str(getattr(response, "text", "") or "").strip()
        sources: List[WebSource] = []
        seen_urls: set[str] = set()

        for cand in getattr(response, "candidates", None) or []:
            meta = getattr(cand, "grounding_metadata", None)
            if not meta:
                continue
            for chunk in getattr(meta, "grounding_chunks", None) or []:
                web = getattr(chunk, "web", None)
                if not web:
                    continue
                url = str(getattr(web, "uri", "") or "").strip()
                title = str(getattr(web, "title", "") or url).strip()
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    sources.append(WebSource(title=title, url=url))

        return GroundedSearchResult(text=text, sources=sources)


class OpenAIProvider(BaseLLMProvider):
    provider_id = "openai"
    display_name = "OpenAI (GPT / Codex)"
    capabilities = ProviderCapabilities(function_calling=True, web_search=False)

    def _api_key(self) -> Optional[str]:
        return _env_or_setting("OPENAI_API_KEY", settings.OPENAI_API_KEY)

    def is_configured(self) -> bool:
        return bool(self._api_key())

    def get_model_name(self, override: Optional[str] = None) -> str:
        return override or os.getenv("OPENAI_MODEL") or settings.OPENAI_MODEL or "gpt-4o-mini"

    def _client(self) -> Any:
        from openai import OpenAI

        key = self._api_key()
        if not key:
            raise LLMNotConfiguredError("OPENAI_API_KEY is not configured.")
        base_url = _env_or_setting("OPENAI_BASE_URL", settings.OPENAI_BASE_URL)
        if base_url:
            return OpenAI(api_key=key, base_url=base_url)
        return OpenAI(api_key=key)

    def call_tool(
        self,
        prompt: str,
        tools: Sequence[ToolSpec],
        allowed_tool_names: Optional[Sequence[str]] = None,
        temperature: float = 0.2,
        model: Optional[str] = None,
    ) -> ToolCallResult:
        client = self._client()
        allowed_set = set(allowed_tool_names) if allowed_tool_names else None
        selected = [t for t in tools if allowed_set is None or t.name in allowed_set]
        openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": normalize_schema_for_json(t.parameters),
                },
            }
            for t in selected
        ]
        tool_choice: Any = (
            {"type": "function", "function": {"name": selected[0].name}}
            if len(selected) == 1
            else "required"
        )
        completion = client.chat.completions.create(
            model=self.get_model_name(model),
            messages=[{"role": "user", "content": prompt}],
            tools=openai_tools,
            tool_choice=tool_choice,
            temperature=temperature,
        )
        choices = getattr(completion, "choices", None) or []
        for ch in choices:
            msg = getattr(ch, "message", None)
            tool_calls = getattr(msg, "tool_calls", None) or []
            for tc in tool_calls:
                fn = getattr(tc, "function", None)
                if fn is not None and getattr(fn, "name", None):
                    raw_args = getattr(fn, "arguments", "{}") or "{}"
                    parsed_args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
                    return ToolCallResult(name=str(fn.name), args=parsed_args)

        raise RuntimeError("OpenAI response did not include a tool call.")

    def generate_text(
        self,
        prompt: str,
        temperature: float = 0.3,
        model: Optional[str] = None,
    ) -> str:
        client = self._client()
        completion = client.chat.completions.create(
            model=self.get_model_name(model),
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )
        choices = getattr(completion, "choices", None) or []
        if not choices:
            return ""
        return str(getattr(choices[0].message, "content", "") or "").strip()


class AnthropicProvider(BaseLLMProvider):
    provider_id = "anthropic"
    display_name = "Anthropic Claude"
    capabilities = ProviderCapabilities(function_calling=True, web_search=False)

    def _api_key(self) -> Optional[str]:
        return _env_or_setting("ANTHROPIC_API_KEY", settings.ANTHROPIC_API_KEY)

    def is_configured(self) -> bool:
        return bool(self._api_key())

    def get_model_name(self, override: Optional[str] = None) -> str:
        return override or os.getenv("ANTHROPIC_MODEL") or settings.ANTHROPIC_MODEL or "claude-3-5-sonnet-latest"

    def _post_messages(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        key = self._api_key()
        if not key:
            raise LLMNotConfiguredError("ANTHROPIC_API_KEY is not configured.")
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()

    def call_tool(
        self,
        prompt: str,
        tools: Sequence[ToolSpec],
        allowed_tool_names: Optional[Sequence[str]] = None,
        temperature: float = 0.2,
        model: Optional[str] = None,
    ) -> ToolCallResult:
        allowed_set = set(allowed_tool_names) if allowed_tool_names else None
        selected = [t for t in tools if allowed_set is None or t.name in allowed_set]
        anthropic_tools = [
            {
                "name": t.name,
                "description": t.description,
                "input_schema": normalize_schema_for_json(t.parameters),
            }
            for t in selected
        ]
        tool_choice = (
            {"type": "tool", "name": selected[0].name}
            if len(selected) == 1
            else {"type": "any"}
        )
        data = self._post_messages(
            {
                "model": self.get_model_name(model),
                "max_tokens": 4096,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
                "tools": anthropic_tools,
                "tool_choice": tool_choice,
            }
        )
        for block in data.get("content") or []:
            if block.get("type") == "tool_use" and block.get("name"):
                return ToolCallResult(
                    name=str(block["name"]),
                    args=dict(block.get("input") or {}),
                )
        raise RuntimeError("Anthropic response did not include a tool_use block.")

    def generate_text(
        self,
        prompt: str,
        temperature: float = 0.3,
        model: Optional[str] = None,
    ) -> str:
        data = self._post_messages(
            {
                "model": self.get_model_name(model),
                "max_tokens": 4096,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
        )
        chunks = [
            str(block.get("text", ""))
            for block in (data.get("content") or [])
            if block.get("type") == "text"
        ]
        return "\n".join(chunks).strip()
