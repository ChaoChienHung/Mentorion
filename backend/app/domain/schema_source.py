from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class DocumentSchemaMapping:
    """
    User-customizable mapping from arbitrary Markdown frontmatter keys
    to Mentorion's canonical document fields.
    Defaults match Nexus's open Document Bundle schema, but any user can
    override keys (e.g., for Obsidian, Foam, or custom Markdown folders).
    """

    id_field: str = "id"
    title_field: str = "title"
    summary_field: str = "summary"
    category_field: str = "category"
    review_field: str = "review"
    fresh_values: Tuple[str, ...] = ("fresh", "", "unread", "new")
    reviewed_values: Tuple[str, ...] = ("reviewed", "done")
    filename_pattern: str = "*.md"  # e.g. "index.md" for Nexus bundles, or "*.md" for flat vaults


@dataclass
class ParsedSourceDocument:
    source_doc_id: str
    title: str
    summary: str
    category: str
    review_status: str  # "fresh" | "reviewed"
    body: str
    rel_path: str
    frontmatter: Dict[str, Any] = field(default_factory=dict)


FRONTMATTER_RE = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)")


def parse_simple_yaml_frontmatter(raw: str) -> Tuple[Dict[str, Any], str]:
    """
    Zero-dependency YAML frontmatter parser supporting scalar key: value pairs
    and simple dash-list arrays (sufficient for portable Markdown notes).
    """
    match = FRONTMATTER_RE.match(raw)
    if not match:
        return {}, raw.strip()

    fm_text = match.group(1)
    body = raw[match.end() :].strip()
    data: Dict[str, Any] = {}
    current_list_key: Optional[str] = None

    for raw_line in fm_text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if stripped.startswith("- ") and current_list_key:
            val = stripped[2:].strip().strip('"').strip("'")
            data[current_list_key].append(val)
            continue

        current_list_key = None
        if ":" in line:
            key, val_part = line.split(":", 1)
            key = key.strip()
            # Strip inline YAML comments outside quotes
            val_clean = val_part.strip()
            if val_clean and val_clean[0] not in ('"', "'") and " #" in val_clean:
                val_clean = val_clean.split(" #", 1)[0].strip()

            if val_clean == "":
                data[key] = []
                current_list_key = key
            else:
                if (val_clean.startswith('"') and val_clean.endswith('"')) or (
                    val_clean.startswith("'") and val_clean.endswith("'")
                ):
                    val_clean = val_clean[1:-1]
                data[key] = val_clean

    return data, body


def scan_markdown_source(
    source_dir: str,
    mapping: Optional[DocumentSchemaMapping] = None,
    only_fresh: bool = False,
) -> List[ParsedSourceDocument]:
    """
    Recursively scans a local Markdown directory using the given schema mapping.
    Works with Nexus Document Bundles (wiki/<Category>/<slug>/index.md) as well
    as arbitrary flat or nested Markdown folders.
    """
    cfg = mapping or DocumentSchemaMapping()
    root = Path(os.path.expanduser(source_dir)).resolve()
    if not root.exists() or not root.is_dir():
        raise FileNotFoundError(f"Source directory not found: {source_dir}")

    # Prefer `wiki/` subfolder automatically if user points at a Nexus vault root
    scan_root = root / "wiki" if (root / "wiki").is_dir() else root

    docs: List[ParsedSourceDocument] = []
    for md_path in sorted(scan_root.rglob(cfg.filename_pattern)):
        if any(part.startswith(".") for part in md_path.relative_to(scan_root).parts):
            continue

        raw = md_path.read_text(encoding="utf-8")
        fm, body = parse_simple_yaml_frontmatter(raw)
        rel_path = md_path.relative_to(scan_root).as_posix()
        rel_parts = md_path.relative_to(scan_root).parts

        # Resolve stable source_doc_id
        raw_id = fm.get(cfg.id_field)
        if isinstance(raw_id, str) and raw_id.strip():
            doc_id = raw_id.strip()
        else:
            slug_base = md_path.parent.name if md_path.name == "index.md" else md_path.stem
            doc_id = f"doc.{re.sub(r'[^a-zA-Z0-9]+', '_', slug_base).strip('_').lower()}"

        # Resolve title
        raw_title = fm.get(cfg.title_field)
        if isinstance(raw_title, str) and raw_title.strip():
            title = raw_title.strip()
        else:
            h1_match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
            title = (
                h1_match.group(1).strip()
                if h1_match
                else (md_path.parent.name if md_path.name == "index.md" else md_path.stem)
            )

        # Resolve summary
        raw_summary = fm.get(cfg.summary_field)
        summary = raw_summary.strip() if isinstance(raw_summary, str) else ""

        # Resolve category (frontmatter override -> parent folder path -> "General")
        raw_cat = fm.get(cfg.category_field)
        if isinstance(raw_cat, str) and raw_cat.strip():
            category = raw_cat.strip()
        elif md_path.name == "index.md" and len(rel_parts) >= 3:
            category = " / ".join(rel_parts[:-2])
        elif len(rel_parts) >= 2:
            category = " / ".join(rel_parts[:-1])
        else:
            category = "General"

        # Resolve review status
        raw_review = fm.get(cfg.review_field)
        review_str = str(raw_review).strip().lower() if raw_review is not None else ""
        if review_str in tuple(v.lower() for v in cfg.reviewed_values):
            review_status = "reviewed"
        else:
            review_status = "fresh"

        if only_fresh and review_status != "fresh":
            continue

        docs.append(
            ParsedSourceDocument(
                source_doc_id=doc_id,
                title=title,
                summary=summary,
                category=category,
                review_status=review_status,
                body=body,
                rel_path=rel_path,
                frontmatter=fm,
            )
        )

    return docs
