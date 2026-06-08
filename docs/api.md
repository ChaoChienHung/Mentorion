# API

Base prefix：`/api/v1`

## Notes

### POST /notes/scrape

Request body（example）：

```json
{
  "url": "https://en.wikipedia.org/wiki/Python_(programming_language)",
  "raw_content": ""
}
```

Response body（example）：

```json
{
  "title": "Python Basics",
  "success": true,
  "summary": "Python is a general-purpose programming language.",
  "content": "Python is a general-purpose programming language...",
  "related_concepts": ["Interpreter", "Dynamic typing"],
  "qa": [{"question": "What is Python?", "answer": "A programming language."}],
  "error_messages": []
}
```

Errors：
- 429：`{"detail": "Too many requests"}`

### POST /notes/parse

Request body：同 `/notes/scrape`（使用 `raw_content`）。

### POST /notes/generate-questions

Request body：`Note`

## Review mode（Planned）

以下為規劃中的 API（尚未實作）：
- `POST /review/generate`
- `GET /review/due`
- `POST /review/grade`
