# Custom Schema Guide (`Mentorion/schemas/`)

Mentorion decouples spaced repetition from any single note-taking app by reading external Markdown folders through **file-driven Schema definitions** stored in `Mentorion/schemas/*.json`.

Instead of configuring cryptic field names in the UI, each folder path is paired with a named schema from `Mentorion/schemas/`.

---

## Built-In Schemas

- `nexus.json` — Matches Nexus Document Bundles (`wiki/<Category>/<slug>/index.md`, YAML frontmatter `id`/`title`/`summary`/`review`, optional sibling `questions.json`).
- `obsidian.json` — Matches Obsidian vaults (`*.md`, frontmatter `title`/`description`/`status`, H1 fallback).
- `plain-markdown.json` — Matches any plain Markdown folder with or without frontmatter.

---

## Creating a Custom Schema

1. Add a new JSON file under `Mentorion/schemas/<your-schema>.json`:

```json
{
  "name": "course-notes",
  "label": "University Course Notes",
  "description": "Lecture notes with custom frontmatter keys.",
  "filename_pattern": "*.md",
  "id_field": "uid",
  "title_field": "lecture_title",
  "summary_field": "tldr",
  "category_field": "course",
  "review_field": "studied",
  "fresh_values": ["no", "false", ""],
  "reviewed_values": ["yes", "true", "done"],
  "questions_sidecar": "{stem}.questions.json"
}
```

2. Field resolution rules:
   - **`id_field`**: Reads that YAML frontmatter key first; falls back to a slugified ID derived from the folder/file name.
   - **`title_field`**: Reads that YAML frontmatter key first; falls back to the first `# H1` Markdown heading, then filename.
   - **`category_field`**: Reads that YAML frontmatter key first; falls back to the relative folder path (e.g., `AI / Machine Learning`), then `General`.
   - **`review_field`**: Matches against `reviewed_values` (`reviewed`) or defaults to `fresh`.
   - **`filename_pattern`**: Glob pattern such as `index.md` (bundle folders) or `*.md` (flat/nested files).

3. Reload Mentorion's **Schema Source** tab — your new schema appears automatically in the Schema dropdown.
