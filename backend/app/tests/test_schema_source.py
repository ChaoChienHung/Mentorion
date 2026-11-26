import tempfile
from pathlib import Path

from backend.app.domain.schema_source import (
    DocumentSchemaMapping,
    load_schema_by_name,
    parse_simple_yaml_frontmatter,
    scan_markdown_source,
    scan_markdown_source_with_report,
)


def test_parse_simple_yaml_frontmatter_handles_scalars_and_lists():
    raw = """---
id: doc.clustering
title: Clustering Foundations
concepts:
  - concept.clustering
  - concept.noise
status: evergreen # draft | seed | evergreen
review: fresh
---

# Clustering Foundations

Body text here.
"""
    fm, body = parse_simple_yaml_frontmatter(raw)
    assert fm["id"] == "doc.clustering"
    assert fm["title"] == "Clustering Foundations"
    assert fm["concepts"] == ["concept.clustering", "concept.noise"]
    assert fm["status"] == "evergreen"
    assert fm["review"] == "fresh"
    assert body.startswith("# Clustering Foundations")


def test_scan_markdown_source_default_nexus_bundle_schema():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        bundle = vault / "wiki" / "AI" / "ML" / "clustering"
        bundle.mkdir(parents=True)
        (bundle / "index.md").write_text(
            "---\nid: doc.clustering\ntitle: Clustering\nsummary: Unsupervised grouping.\nreview: fresh\n---\n\n# Clustering\nDetails.\n",
            encoding="utf-8",
        )
        reviewed = vault / "wiki" / "AI" / "ML" / "pca"
        reviewed.mkdir(parents=True)
        (reviewed / "index.md").write_text(
            "---\nid: doc.pca\ntitle: PCA\nreview: reviewed\n---\n\n# PCA\n",
            encoding="utf-8",
        )

        all_docs = scan_markdown_source(str(vault))
        assert len(all_docs) == 2
        clustering = next(d for d in all_docs if d.source_doc_id == "doc.clustering")
        assert clustering.category == "AI / ML"
        assert clustering.review_status == "fresh"

        fresh_only = scan_markdown_source(str(vault), only_fresh=True)
        assert [d.source_doc_id for d in fresh_only] == ["doc.clustering"]


def test_scan_markdown_source_with_custom_user_schema_mapping():
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        (folder / "note-1.md").write_text(
            "---\nuid: custom_01\nname: Custom Note\ntopic: Systems\nstate: done\n---\n\n# Custom Note\nHello.\n",
            encoding="utf-8",
        )
        mapping = DocumentSchemaMapping(
            id_field="uid",
            title_field="name",
            category_field="topic",
            review_field="state",
            reviewed_values=("done",),
        )
        docs = scan_markdown_source(str(folder), mapping=mapping)
        assert len(docs) == 1
        assert docs[0].source_doc_id == "custom_01"
        assert docs[0].title == "Custom Note"
        assert docs[0].category == "Systems"
        assert docs[0].review_status == "reviewed"


def test_single_file_import_and_strict_schema_failure_reporting():
    nexus_schema = load_schema_by_name("nexus")
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        valid_dir = vault / "wiki" / "AI" / "valid-note"
        valid_dir.mkdir(parents=True)
        valid_file = valid_dir / "index.md"
        valid_file.write_text(
            "---\nid: doc.valid\ntitle: Valid Note\nreview: fresh\n---\n\n# Valid\n",
            encoding="utf-8",
        )

        bad_dir = vault / "wiki" / "AI" / "broken-note"
        bad_dir.mkdir(parents=True)
        (bad_dir / "index.md").write_text(
            "# Missing frontmatter completely\nJust text.\n",
            encoding="utf-8",
        )

        # Folder scan separates valid vs failed with exact path + reason
        docs, failed = scan_markdown_source_with_report(str(vault), mapping=nexus_schema)
        assert [d.source_doc_id for d in docs] == ["doc.valid"]
        assert len(failed) == 1
        assert "broken-note/index.md" in failed[0].path
        assert "frontmatter" in failed[0].reason.lower()

        # Single file path import also works
        single_docs, single_failed = scan_markdown_source_with_report(
            str(valid_file), mapping=nexus_schema
        )
        assert len(single_docs) == 1
        assert single_docs[0].source_doc_id == "doc.valid"
        assert single_failed == []
