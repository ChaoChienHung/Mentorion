import tempfile
from pathlib import Path

from backend.app.domain.schema_source import (
    DocumentSchemaMapping,
    parse_simple_yaml_frontmatter,
    scan_markdown_source,
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
