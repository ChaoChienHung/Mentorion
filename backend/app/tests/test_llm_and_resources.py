from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.app.core.config import settings
from backend.app.core.llm import (
    AnthropicProvider,
    BaseLLMProvider,
    GroundedSearchResult,
    OpenAIProvider,
    ProviderCapabilities,
    ToolCallResult,
    ToolSpec,
    UnsupportedCapabilityError,
    WebSource,
    get_llm_status,
    set_runtime_provider,
)
from backend.app.core.llm.base import normalize_schema_for_json
from backend.app.domain.resource_researcher import (
    discover_related_resources,
    summarize_scraped_resource,
)
from backend.app.main import app


@pytest.fixture(autouse=True)
def _reset_llm_env(monkeypatch):
    set_runtime_provider(None)
    for var in ("LLM_PROVIDER", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    yield
    set_runtime_provider(None)


def test_llm_status_locks_all_when_no_api_key():
    status = get_llm_status()
    assert status["available"] is False
    assert status["active_provider"] is None
    assert all(v is False for v in status["capabilities"].values())
    assert status["lock_reasons"]["llm"] is not None
    assert status["lock_reasons"]["resource_discovery"] is not None


def test_llm_status_openai_unlocks_core_but_locks_resource_discovery(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-openai")
    status = get_llm_status()
    assert status["available"] is True
    assert status["active_provider"] == "openai"
    assert status["capabilities"]["quiz_generation"] is True
    assert status["capabilities"]["study_mentor"] is True
    assert status["capabilities"]["resource_summarize"] is True
    assert status["capabilities"]["resource_discovery"] is False
    assert status["lock_reasons"]["llm"] is None
    assert "Gemini" in (status["lock_reasons"]["resource_discovery"] or "")


def test_llm_status_gemini_unlocks_all_capabilities(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "gem-test-key")
    status = get_llm_status()
    assert status["available"] is True
    assert status["active_provider"] == "gemini"
    assert all(v is True for v in status["capabilities"].values())
    assert status["lock_reasons"]["resource_discovery"] is None


def test_llm_status_and_provider_switch_api(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "gem-key")
    monkeypatch.setenv("OPENAI_API_KEY", "oa-key")
    client = TestClient(app)

    res = client.get("/api/llm/status")
    assert res.status_code == 200
    assert res.json()["active_provider"] == "gemini"

    res_switch = client.post("/api/llm/provider", json={"provider": "openai"})
    assert res_switch.status_code == 200
    data = res_switch.json()
    assert data["active_provider"] == "openai"
    assert data["capabilities"]["resource_discovery"] is False

    res_bad = client.post("/api/llm/provider", json={"provider": "anthropic"})
    assert res_bad.status_code == 400


def test_llm_save_api_key_endpoint():
    client = TestClient(app)
    with patch("backend.app.core.llm.registry._upsert_env_local") as mock_upsert:
        res_save = client.post(
            "/api/llm/key",
            json={"provider": "anthropic", "api_key": "sk-ant-mock-123"},
        )
        assert res_save.status_code == 200
        data = res_save.json()
        assert data["available"] is True
        assert data["active_provider"] == "anthropic"
        mock_upsert.assert_called_once_with("ANTHROPIC_API_KEY", "sk-ant-mock-123")

        res_clear = client.post(
            "/api/llm/key",
            json={"provider": "anthropic", "api_key": ""},
        )
        assert res_clear.status_code == 200
        assert res_clear.json()["available"] is False


def test_schema_normalization_and_openai_anthropic_tool_calls(monkeypatch):
    gemini_schema = {
        "type": "OBJECT",
        "properties": {
            "items": {"type": "ARRAY", "items": {"type": "STRING"}},
            "count": {"type": "INTEGER"},
        },
        "required": ["items"],
    }
    normalized = normalize_schema_for_json(gemini_schema)
    assert normalized["type"] == "object"
    assert normalized["properties"]["items"]["type"] == "array"
    assert normalized["properties"]["count"]["type"] == "integer"

    monkeypatch.setenv("OPENAI_API_KEY", "sk-mock")
    oa = OpenAIProvider()
    fake_completion = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    tool_calls=[
                        SimpleNamespace(
                            function=SimpleNamespace(
                                name="submit_quiz_questions",
                                arguments='{"questions": [{"type": "short_answer", "prompt": "What is SM-2?", "answer": "Spaced repetition algorithm"}]}',
                            )
                        )
                    ]
                )
            )
        ]
    )
    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = fake_completion
    with patch.object(oa, "_client", return_value=fake_client):
        res = oa.call_tool(
            prompt="Generate",
            tools=[ToolSpec(name="submit_quiz_questions", description="desc", parameters=gemini_schema)],
        )
    assert res.name == "submit_quiz_questions"
    assert len(res.args["questions"]) == 1

    monkeypatch.setenv("ANTHROPIC_API_KEY", "anth-mock")
    anth = AnthropicProvider()
    with patch.object(
        anth,
        "_post_messages",
        return_value={
            "content": [
                {
                    "type": "tool_use",
                    "name": "grade_essay_answer",
                    "input": {"score": 4, "summary_feedback": "Solid!"},
                }
            ]
        },
    ):
        res_a = anth.call_tool(
            prompt="Grade",
            tools=[ToolSpec(name="grade_essay_answer", description="desc", parameters=gemini_schema)],
        )
    assert res_a.name == "grade_essay_answer"
    assert res_a.args["score"] == 4


class _FakeGeminiProvider(BaseLLMProvider):
    provider_id = "gemini"
    display_name = "Google Gemini"
    capabilities = ProviderCapabilities(function_calling=True, web_search=True)

    def is_configured(self) -> bool:
        return True

    def get_model_name(self, override=None) -> str:
        return "gemini-2.5-flash"

    def call_tool(self, prompt, tools, allowed_tool_names=None, temperature=0.2, model=None):
        return ToolCallResult(name=tools[0].name, args={})

    def generate_text(self, prompt, temperature=0.3, model=None) -> str:
        return "- Key takeaway 1\n- Key takeaway 2"

    def search_web_grounded(self, prompt, temperature=0.3, model=None) -> GroundedSearchResult:
        return GroundedSearchResult(
            text=(
                "```json\n"
                '{"synthesis": "Great references for FlashAttention.", '
                '"resources": [{"title": "FlashAttention Paper", "url": "https://arxiv.org/abs/2205.14135", '
                '"source_type": "paper", "relevance_note": "Original IO-aware attention paper."}]}\n'
                "```"
            ),
            sources=[
                WebSource(
                    title="PyTorch SDPA Docs",
                    url="https://pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html",
                )
            ],
        )


def test_discover_resources_grounded_and_locked_for_non_gemini(monkeypatch):
    fake_gem = _FakeGeminiProvider()
    synthesis, items, provider_id, _ = discover_related_resources(
        title="FlashAttention",
        content="IO-aware exact attention",
        max_results=5,
        provider=fake_gem,
    )
    assert provider_id == "gemini"
    assert "FlashAttention" in synthesis
    assert len(items) == 2
    assert items[0].source_type == "paper"
    assert items[1].source_type == "docs"

    monkeypatch.setenv("OPENAI_API_KEY", "sk-mock")
    with pytest.raises(UnsupportedCapabilityError):
        discover_related_resources(title="FlashAttention", provider=OpenAIProvider())

    summary = summarize_scraped_resource(
        url="https://arxiv.org/abs/2205.14135",
        scraped_title="FlashAttention",
        scraped_text="Tiling avoids materializing N x N attention matrix in HBM.",
        note_title="FlashAttention",
        provider=fake_gem,
    )
    assert "Key takeaway 1" in summary


def test_resources_api_crud_and_locked_discover(monkeypatch):
    with TestClient(app) as client:
        monkeypatch.setenv("OPENAI_API_KEY", "sk-mock")
        res_locked = client.post("/api/resources/discover", json={"topic": "Attention"})
        assert res_locked.status_code == 403

        res_create = client.post(
            "/api/resources",
            json={
                "topic": "Attention",
                "title": "Attention Is All You Need",
                "url": "https://arxiv.org/abs/1706.03762",
                "source_type": "paper",
                "relevance_note": "Foundational Transformer paper.",
            },
        )
        assert res_create.status_code == 201
        created = res_create.json()
        rid = created["id"]

        res_list = client.get("/api/resources")
        assert res_list.status_code == 200
        assert any(r["id"] == rid for r in res_list.json())

        with patch(
            "backend.app.api.v1.routes.Scraper.scrape_article",
            new_callable=AsyncMock,
            return_value={"success": True, "title": "Transformer Paper", "text": "Self-attention replaces recurrence."},
        ), patch(
            "backend.app.api.v1.routes.summarize_scraped_resource",
            return_value="- Introduces multi-head self-attention.",
        ):
            res_sum = client.post(f"/api/resources/{rid}/summarize")
        assert res_sum.status_code == 200
        assert "multi-head self-attention" in (res_sum.json()["summary"] or "")

        res_del = client.delete(f"/api/resources/{rid}")
        assert res_del.status_code == 200
