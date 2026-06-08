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
   - Web 前端（React）與 Streamlit 都應透過後端 API 或共用抽象互動，避免兩套行為分歧。

## 角色與職責

### Maintainer（Repo Owner）

- 擁有合併權，維護架構一致性與 Non‑negotiables。
- 決定跨模組改動（Backend/Frontend/Streamlit/Docs）的取捨與優先順序。
- 維護 docs/ 的 Doc Map 與本文件。

### Backend Engineer（FastAPI / DB）

- 維護 `backend/app/`（API、服務層、domain、DB）。
- 確保 API error response 與 schema 一致，新增 endpoint 必須補測試。
- 推進 Persistence 與 Review mode 的資料模型與 API。

### Frontend Engineer（React/Vite）

- 維護 `frontend/`，負責 Notes 與 Review mode 的使用者體驗。
- 以 API 契約為中心，避免前端假設與後端回傳不一致。

### AI Engineer（LLM / Prompt / Eval）

- 維護 `backend/app/domain/agent.py` 與相關 prompt/schema/重試策略。
- 任何會改變輸出格式的調整，必須同步更新 schema 與測試（或提供 backward compatible）。

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

### Streamlit（Streamlit）

- 優先定位為快速原型或內部工具。
- 若功能與 Web 前端重疊，應優先復用後端 API，避免重複實作與行為分歧。

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

## Doc Map

- README（入口與最短指令）：README.md
- 文件索引（Doc Map）：docs/doc-map.md
- 開發筆記：docs/dev-notes.md
- 架構與邊界：docs/architecture.md
- API 契約：docs/api.md
- 協作規範：docs/collaboration.md
- 複習模式設計：docs/review-mode.md
