# Agent 護欄規範（Guardrails）

本文件補充根目錄 [AGENTS.md](../../AGENTS.md)（維持核心契約精簡），說明與特定工具無關（Antigravity、Claude Code、Codex、Cursor 皆適用）的軟硬護欄分層：能靠語意判斷的留在文字規範，不能退化的資料契約與邊界交給程式與測試強制守門。

## 軟規則 vs. 硬護欄

| 層級 | 適用內容 | 在 Mentorion 的落點 |
| --- | --- | --- |
| **軟規則（文字規範）** | 角色分工、設計取捨、文件同步習慣、PR 溝通方式 | `AGENTS.md`、`docs/collaboration.md`、`docs/doc-map.md` |
| **硬護欄（確定性檢查）** | Pydantic SSOT 契約、無外網 Mock 測試、前後端型別與編譯、外部知識庫 Read-Only 邊界與 LLM 能力鎖定 | `backend/app/schemas/`、`./venv/bin/pytest backend/app/tests`、`cd frontend && npx tsc --noEmit && npm run build`、`GET /api/llm/status` |

## 不可退化系統邊界

- **外部知識庫只讀（Read-Only）**：透過 `schemas/*.json` 讀取的外部知識庫（如 `Nexus-Vault`）維持只讀，絕不建立新筆記或寫入題庫檔；SM-2 排程、`questions.json` 與 `note_resources` 統一由 Mentorion SQLite 與 `MENTORION_VAULT_DIR` 擁有。
- **跨層依賴方向**：後端維持 `API → Service → Domain/DB`，禁止反向依賴；前端僅透過 HTTP API 與後端互動。
- **能力自動鎖定**：無 API Key 或非 Gemini 引擎時，由 `GET /api/llm/status` 自動鎖定對應 AI／外部探索功能，不影響本地閱讀與排程複習。
