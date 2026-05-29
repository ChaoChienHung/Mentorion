# TODO

本文件是「可執行」的待辦清單（里程碑式）。建議先把 P0 做完，確保專案可穩定開發、可測、可擴充。

## P0（可開發、可測、可擴充）

### Infra / Tooling

- [ ] Python 版本升級到 3.11+（目前可跑，但第三方套件對 3.9 會有 EOL 警告）
- [ ] Frontend `npm audit` 漏洞處理（目前 `npm ci` 會提示 vulnerabilities）

### Python Package 化 / Import 統一

- [ ] 把 `backend/app` 變成可安裝 package（避免依賴 cwd 才能 import）
  - [ ] 規劃 package 名稱（例如 `mentorion`）
  - [ ] 調整 imports：`from domain...` → `from mentorion.domain...`
  - [ ] 加入 `pyproject.toml`（或最小 `setup.cfg`）並提供 `pip install -e .` 流程
  - [ ] 測試/啟動指令不用 `cd backend/app` 也能跑

### Logging 統一

- [ ] 把 `print(...)` 統一替換成 logger（agent/scraper/service 層）
- [ ] 將 logger 目標（console/file）做成可配置（dev 用 console，prod 用 file）

### Backend API

- [ ] 補上 OpenAPI 範例（request/response examples）
- [ ] 加上 error response schema（統一 HTTP 錯誤碼與格式）

### Testing

- [ ] 加入 API 層測試（FastAPI TestClient）
- [ ] Agent/Scraper 測試補 edge cases（空內容、超長內容、解析失敗）

### DoD（P0）

- [ ] `pip install -e .` 後，`pytest` 與 `uvicorn` 都可在 repo root 直接執行
- [ ] API 測試可跑，且不依賴外部網路/金鑰

## P1（功能可用）

### Persistence（DB）

- [ ] 把 DB 持久化流程補齊（現在 NoteService 的 DB 寫入為註解狀態）
  - [ ] 定義 Item schema（id/title/data 的寫入時機）
  - [ ] 加入 repository 層（或最小化封裝）避免 service 直接操作 ORM
  - [ ] 加入讀取/列表 API（最小可用）

### 複習模式（Spaced Repetition）

- [ ] 建立複習資料模型（卡片/排程/作答紀錄）
  - [ ] Question 支援「短答 + MCQ」兩種題型
  - [ ] Review 排程使用 0-5 評分（SM-2 或近似變體）
  - [ ] 記錄欄位：`last_review_at` / `next_review_at` / `interval_days` / `ease_factor` / `repetitions`
  - [ ] 記錄 review log（time + grade + 來源 note + 產生版本）
- [ ] 新增後端 API
  - [ ] `POST /review/generate`：從 note 生成/補題（短答+MCQ），可選擇「即時生成」或「落庫保存」
  - [ ] `GET /review/due`：取得到期卡片（可加 limit）
  - [ ] `POST /review/grade`：回傳 0-5 評分並更新 next_due
- [ ] 最小前端頁面
  - [ ] `/review`：開始複習（顯示題目 → 選項/答案 → 0-5 打分）
  - [ ] `/review/stats`：顯示 due 數量、今日完成數、近期複習曲線（可後做）

### Frontend（最小可用）

- [ ] 串接 backend API（notes scrape / parse / generate）
- [ ] 加上最小可用路由（Notes 列表/編輯頁）

### Streamlit（避免分歧）

- [ ] 串接 backend API 或共用 domain logic（避免兩套行為分歧）

### DoD（P1）

- [ ] 可以從 UI（Frontend 或 Streamlit）建立一筆 note，並在 DB 中可查到

## P2（品質與可維運）

- [ ] 統一 error handling（HTTPException / 統一 error response）
- [ ] 加入 CI（lint + test）
- [ ] 設定檔集中化（env / config loader，避免多份 config）
