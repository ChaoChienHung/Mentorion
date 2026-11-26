# Mentorion Flat Library (`library/`)

This directory stores flat Markdown notes created directly inside Mentorion (`+ New Note` / `POST /api/library/notes`).

- Every native note is stored as a plain-text `<slug>.md` file with YAML frontmatter (`id`, `title`, `category`, `created`, `updated`).
- External vaults (such as `Nexus-Vault`) imported via `Import Notes` remain **strictly read-only** in their original paths and are never duplicated here.
