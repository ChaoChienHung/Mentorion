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

## Review Journal / Calendar（Planned）

以下為規劃中的 API（尚未實作）：
- `GET /calendar/events?start=...&end=...`：回傳 Planit package 可直接使用的 event payload
- `GET /calendar/summary?start=...&end=...`：回傳每日統計（新增筆記 / 已複習 / 待複習）
- `POST /calendar/manual-review`：建立手動複習任務並同步寫入 journal event

## Image to Note（Planned）

以下為規劃中的 API（尚未實作）：
- `POST /notes/from-image`：接收圖片並轉換為 `Note`

Request body（概念）：

```json
{
  "image": "<uploaded-file>",
  "prompt": "optional extra instruction"
}
```

設計原則：
- 回傳仍沿用 `Note` schema
- 實作路線可選外部多模態 API（如 Gemini）或自建 VLM
