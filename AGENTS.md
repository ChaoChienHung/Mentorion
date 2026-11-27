# Mentorion AGENTS

本文件定義本專案的角色分工、權責邊界、協作流程與不可退化的工程規範。任何影響架構、API 契約、資料模型、或開發流程的改動，都必須同步更新本文件與 docs/ 相關文件，確保團隊協作一致。

## 核心原則（Non‑negotiables）

1. 單一真相來源（SSOT）
   - 後端資料結構以 `backend/app/schemas/` 為準，不在多處複製 schema 定義。
   - API 介面以 FastAPI OpenAPI 為準，前端串接以 OpenAPI/實際 response 為準。
2. 不提交敏感資訊
   - 禁止提交 API keys、token、帳密、私有 URL。
3. 可測、可跑、可重現
   - 任何 PR 必須保證 `pip install -e '.[dev]'` 後可在 repo root 直接跑測試與啟動。
   - 測試不可依賴外網與真實金鑰（必須 mock）。
4. 契約變更需同步
   - 任何 API request/response、資料表、配置項（env）的變更，都必須同步更新 docs/ 與 README。
5. 最小耦合
   - Web 前端（React）僅透過後端 HTTP API 互動，不在前端重複業務邏輯與排程計算。
6. 本地優先與可組合邊界（Local-First & Composable Suite）
   - **免強制登入**：個人本地端複習工具預設單人模式直接進入工作區，不設阻擋式登入頁。
   - **知識庫與筆記只讀哲學（Read-Only Library & Imported Notes）**：Mentorion 盡可能讓所有 `library/` 與透過 `schemas/*.json` 讀取的外部 Markdown 筆記庫（如 `Nexus-Vault`）維持**只讀（Read-Only）**，**絕不**在外部知識庫中建立新筆記或寫入題庫檔案；所有排程、作答紀錄、參考資源收藏／摘要（`note_resources`）與集中題庫皆由 Mentorion SQLite 擁有，相關研究與延伸探索統一放在 **AI 導師（AI Mentor）** 介面中提供（以知識庫為中心的探索與圖譜擴展則由 Nexus 承接）。
   - **多 LLM 統一介面與能力鎖定（Unified Multi-LLM & Capability Gating）**：所有 LLM 呼叫統一透過 `backend/app/core/llm/` 的 `BaseLLMProvider` 介面實作（支援 `GeminiProvider`、`OpenAIProvider`、`AnthropicProvider`），並由 `GET /api/llm/status` 自動偵測已設定的 API Key 與能力矩陣；若偵測不到任何 API Key，前端自動鎖定所有 LLM 功能；若目前引擎不支援 Google Search Grounding（非 Gemini），則鎖定「外部資源探索」功能。詳見 `docs/llm-api-guide.md`。
   - **動態服務發現**：後端與前端啟動時自動將實際 port 寫入 `~/.mentorion/runtime.json`，供 Nexus 無痛探測與組合。

## 角色與職責

### Maintainer（Repo Owner）

- 擁有合併權，維護架構一致性與 Non‑negotiables。
- 決定跨模組改動（Backend/Frontend/Docs）的取捨與優先順序。
- 維護 docs/ 的 Doc Map 與本文件。

### Backend Engineer（FastAPI / DB）

- 維護 `backend/app/`（API、服務層、domain、DB）。
- 確保 API error response 與 schema 一致，新增 endpoint 必須補測試。
- 推進 Persistence 與 Review mode 的資料模型與 API。

### Frontend Engineer（React/Vite）

- 維護 `frontend/`，負責 Notes 與 Review mode 的使用者體驗。
- 以 API 契約為中心，避免前端假設與後端回傳不一致。

### AI Engineer（LLM / Prompt / Eval）

- 維護 `backend/app/core/ai_client.py`、`backend/app/domain/quiz_engine.py`（Function Calling 出題／批改）與 `backend/app/domain/agent.py`。
- 任何會改變輸出格式、環境變數或 Provider 串接方式的調整，必須同步更新 `backend/app/schemas/quiz.py`、Mock 單元測試與 `docs/llm-api-guide.md`。

### QA / Release（品質與自動化）

- 維護測試策略、CI（lint/test）、回歸清單。
- 對外行為（API/資料模型）變更時，要求補充測試與文件。

## 模組邊界與協作方式

### Backend（backend/app）

- **API layer**：`backend/app/api/`，負責 HTTP contract、依賴注入、錯誤碼。
- **Service layer**：`backend/app/services/`，負責用例編排（抓取→解析→生成）。
- **Domain layer**：`backend/app/domain/`，負責 LLM 與抓取邏輯。
- **DB layer**：`backend/app/db/`，負責資料存取、session、models。

跨層依賴方向：API → Service → Domain/DB，禁止反向依賴（Domain 不應 import API）。

### Frontend（frontend）

- 僅透過 HTTP 呼叫後端。
- Review mode UI 由前端主導，但排程邏輯（SM‑2）由後端保存與計算，確保一致性。

## 協作流程

1. 需求與任務追蹤
   - 新工作先寫入 `TODO.md`（完成後移除或移到 docs/decisions 記錄）。
2. 開發前檢查
   - 明確是否為契約變更（API/schema/config），若是，先更新 docs/ 再改碼。
3. 提交前驗證（最低要求）
   - `pip install -e '.[dev]'`
   - `./venv/bin/python -m pytest backend/app/tests`
   - 前端（若有改動）：`npm run lint && npm run build`
4. 文件同步
   - 改動牽涉 API：更新 `docs/api.md` + README 的 endpoints 區段。
   - 改動牽涉協作/角色：更新本文件與 `docs/collaboration.md`。



本模塊的目標是降低協作成本：在完成 feature/refactor/任何 repo 變更之後，不必每次把所有文檔全量重讀，而是以 `docs/doc-map.md` 作為索引，僅更新「受影響」的文檔並保持一致性。

### 觸發時機

- 當完成任何 repo 變更（feature/refactor/bugfix/文檔調整）後，需主動評估是否要同步更新文檔
- 當使用者提出「請協助更新項目的相關文檔」類需求時，需按下列流程處理

### 流程

- 變更盤點：先看此次變更影響到哪些面向（CLI/訓練輸出/評估輸出/dataset pipeline/benchmark recipe/目錄結構/檔名）
- 以 `docs/doc-map.md` 作為入口：根據 doc-map 的職責邊界，定位需要更新的最小文件集合
- 分段交付：允許分多輪完成，不要求一次性調整完所有文檔
- 索引同步：每次有文檔新增/遷移/更名/職責變更，必須同步更新 `docs/doc-map.md` 與本文件的 `doc-map` 模組

## Doc Map

- README（入口與最短指令）：README.md
- 文件索引（Doc Map）：docs/doc-map.md
- Agent 工程規範（軟硬護欄、踩坑紀錄、Eval 與工作流）：docs/agents/（`guardrails.md`、`provenance.md`、`evals.md`、`workflows.md`）
- 開發筆記：docs/dev-notes.md
- 架構與邊界：docs/architecture.md
- API 契約：docs/api.md
- 協作規範：docs/collaboration.md
- 複習模式設計：docs/review-mode.md
- Review Journal / Calendar 設計：docs/review-journal.md
- LLM API 串接指南：docs/llm-api-guide.md
- 自訂 Schema 指南：docs/custom-schema-guide.md
- 內建 Schema 定義：schemas/*.json
