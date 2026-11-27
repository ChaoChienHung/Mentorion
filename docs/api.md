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

---

## Multi-LLM Status & Switching

- `GET /api/llm/status`：回傳目前偵測到的各 LLM Provider（`gemini` / `openai` / `anthropic`）、啟用引擎、功能能力開關（`quiz_generation`、`essay_grading`、`study_mentor`、`resource_discovery`、`resource_summarize`）與鎖定原因。
- `POST /api/llm/model`：儲存供應商模型 ID（`{"provider": "gemini" | "openai" | "anthropic", "model": "..."}`）至本機 `.env.local`，立即生效且不改動 API Key。
- `POST /api/llm/provider`：執行期切換啟用中的已設定 Provider（`{"provider": "gemini" | "openai" | "anthropic" | "auto"}`）。

## AI Mentor Research & External Resources（Read-Only Notes）

所有外部資源與摘要皆存於 Mentorion SQLite（`note_resources`），絕不改寫原筆記：

- `POST /api/resources/discover`：透過 Gemini Google Search Grounding 依 `note_id` 或 `topic` 探索真實外部學習連結（非 Gemini 回傳 `403`；無 API Key 回傳 `503`）。
- `GET /api/resources?note_id=<id>`：列出已收藏的參考資源清單。
- `POST /api/resources`：手動或從探索結果收藏外部資源至 SQLite。
- `DELETE /api/resources/{resource_id}`：移除收藏資源。
- `POST /api/resources/{resource_id}/summarize`：使用 `Scraper` 抓取網頁內容並由目前 LLM 生成重點摘要。
- `POST /api/resources/cross-source-quiz`：結合原筆記與勾選的外部資源（含摘要）生成跨來源進階測驗題並去重存入集中題庫。
