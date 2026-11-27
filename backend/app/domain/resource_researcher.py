from __future__ import annotations

import json
import re
from typing import Any, List, Optional, Tuple
from urllib.parse import urlparse

from ..core.llm import (
    BaseLLMProvider,
    UnsupportedCapabilityError,
    require_active_provider,
)
from ..schemas.resources import DiscoveredResourceItem, ResourceSourceType


def _infer_source_type(url: str, title: str = "") -> ResourceSourceType:
    lower_url = url.lower()
    lower_title = title.lower()
    host = urlparse(lower_url).netloc

    if any(k in host for k in ("arxiv.org", "openreview.net", "acm.org", "ieee.org", "springer.com", "nature.com", "sciencedirect.com", "scholar.google", "semanticscholar.org")) or "paper" in lower_title:
        return "paper"
    if any(k in host for k in ("youtube.com", "youtu.be", "vimeo.com", "bilibili.com")):
        return "video"
    if any(k in host for k in ("docs.", "developer.", "readthedocs", "pytorch.org", "tensorflow.org", "python.org", "mozilla.org", "fastapi.tiangolo.com", "react.dev", "wikipedia.org")) or "/docs" in lower_url:
        return "docs"
    if any(k in host for k in ("medium.com", "substack.com", "dev.to", "towardsdatascience", "distill.pub", "lilianweng.github.io", "colah.github.io", "jalammar.github.io")) or "/blog" in lower_url:
        return "blog"
    return "web"


def _extract_json_block(text: str) -> Optional[Any]:
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    candidate = fence.group(1).strip() if fence else text.strip()
    try:
        return json.loads(candidate)
    except Exception:
        return None


def discover_related_resources(
    title: str,
    content: str = "",
    query: str = "",
    max_results: int = 5,
    provider: Optional[BaseLLMProvider] = None,
) -> Tuple[str, List[DiscoveredResourceItem], str, str]:
    """
    Use the active LLM provider's grounded web search (currently Gemini Google Search Grounding)
    to discover verified related learning links/resources for a note or topic.
    """
    active = provider or require_active_provider()
    if not active.capabilities.web_search:
        raise UnsupportedCapabilityError(
            f"Provider '{active.display_name}' does not support grounded web search. "
            "Switch to Gemini (with GEMINI_API_KEY) to use Resource Discovery."
        )

    focus_line = f"User's specific research focus: {query.strip()}\n" if query.strip() else ""
    note_excerpt = (content or "")[:6000]
    prompt = (
        f"You are Mentorion AI Mentor's Research Agent.\n"
        f"Find up to {max_results} high-quality, authoritative external learning resources "
        f"(official docs, seminal papers, deep-dive blogs, or lecture videos) related to the study topic below.\n"
        f"{focus_line}"
        f"Topic / Note Title: {title}\n"
        f"Note Context:\n{note_excerpt or '(Topic-level research without existing note text)'}\n\n"
        "Respond with a concise synthesis AND a JSON code block in this exact shape:\n"
        "```json\n"
        "{\n"
        '  "synthesis": "2-3 sentence overview of what these resources add beyond the note",\n'
        '  "resources": [\n'
        "    {\n"
        '      "title": "Resource title",\n'
        '      "url": "https://...",\n'
        '      "source_type": "paper | docs | video | blog | web",\n'
        '      "relevance_note": "1-2 sentences explaining how this deepens or complements the note"\n'
        "    }\n"
        "  ]\n"
        "}\n"
        "```\n"
        "Only include real, verified URLs returned by web search."
    )

    grounded = active.search_web_grounded(prompt=prompt, temperature=0.25)
    parsed = _extract_json_block(grounded.text)

    items: List[DiscoveredResourceItem] = []
    seen_urls: set[str] = set()
    synthesis = ""

    if isinstance(parsed, dict):
        synthesis = str(parsed.get("synthesis") or "").strip()
        for raw in parsed.get("resources") or []:
            if not isinstance(raw, dict):
                continue
            url = str(raw.get("url") or "").strip()
            if not url.startswith(("http://", "https://")) or url in seen_urls:
                continue
            seen_urls.add(url)
            r_title = str(raw.get("title") or url).strip()
            raw_type = str(raw.get("source_type") or "").strip().lower()
            source_type: ResourceSourceType = (
                raw_type  # type: ignore[assignment]
                if raw_type in ("paper", "docs", "video", "blog", "web")
                else _infer_source_type(url, r_title)
            )
            items.append(
                DiscoveredResourceItem(
                    title=r_title,
                    url=url,
                    source_type=source_type,
                    relevance_note=str(raw.get("relevance_note") or "").strip(),
                )
            )

    # Supplement with verified grounding_metadata sources if model omitted URLs or returned fewer
    for src in grounded.sources:
        if len(items) >= max_results:
            break
        if not src.url.startswith(("http://", "https://")) or src.url in seen_urls:
            continue
        seen_urls.add(src.url)
        items.append(
            DiscoveredResourceItem(
                title=src.title or src.url,
                url=src.url,
                source_type=_infer_source_type(src.url, src.title),
                relevance_note=src.snippet or f"Verified web reference related to {title}.",
            )
        )

    if not synthesis:
        clean_text = re.sub(r"```[\s\S]*?```", "", grounded.text).strip()
        synthesis = clean_text[:600] or f"Found {len(items)} related external resources for {title}."

    return synthesis, items[:max_results], active.provider_id, active.get_model_name()


def summarize_scraped_resource(
    url: str,
    scraped_title: str,
    scraped_text: str,
    note_title: str = "",
    provider: Optional[BaseLLMProvider] = None,
) -> str:
    """Summarize scraped webpage content into concise study takeaways for Mentorion."""
    active = provider or require_active_provider()
    context_line = f"Related Study Note: {note_title}\n" if note_title else ""
    prompt = (
        f"You are Mentorion AI Mentor. Summarize the external resource below into 4-6 concise, "
        f"high-signal study bullet points (key ideas, definitions, counter-examples, or practical takeaways).\n"
        f"{context_line}"
        f"Resource Title: {scraped_title or url}\n"
        f"URL: {url}\n\n"
        f"Extracted Text:\n{scraped_text[:10000]}"
    )
    return active.generate_text(prompt=prompt, temperature=0.25)
