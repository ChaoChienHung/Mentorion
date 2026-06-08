# TODO

本文件是「可執行」的待辦清單（里程碑式），只保留 P1 / P2 / P3。每個里程碑都應有明確交付條件（可驗收）。

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

### 交付條件（P1）

- [ ] 可以從 UI（Frontend 或 Streamlit）建立/更新一筆 note，並在 DB 中可查到
- [ ] 複習模式可走完一輪：取 due → 顯示題目 → 0-5 打分 → next_due 更新
- [ ] Review 與 Notes 的核心 API 皆有測試覆蓋（不依賴外網/金鑰）

## P2（品質與可維運）

- [ ] Python 版本升級到 3.11+（目前可跑，但第三方套件對 3.9 會有 EOL 警告）
- [ ] Frontend `npm audit` 漏洞處理（目前 `npm ci` 會提示 vulnerabilities）
- [ ] 統一 error handling（HTTPException / 統一 error response）
- [ ] 加入 CI（lint + test）
- [ ] 設定檔集中化（env / config loader，避免多份 config）

### 交付條件（P2）

- [ ] CI 在 main 分支穩定通過（backend tests + frontend lint/build）
- [ ] 後端錯誤回傳格式一致（至少涵蓋常見錯誤碼），且 docs/api.md 同步更新
- [ ] 專案用一套清楚的 config 規範（env keys、預設值、dev/prod 行為）

## P3（產品化與擴充）

- [ ] 多使用者/登入（user-id 綁定 notes 與 review schedule）
- [ ] Review stats（/review/stats）與可視化（完成數、due、遺忘曲線/間隔分布）
- [ ] 題目策略優化（短答/MCQ 混合比例、難度分級、依照弱項補題）
- [ ] 內容匯入/匯出（Markdown/JSON/Anki）與資料備份

### 交付條件（P3）

- [ ] 不同使用者資料彼此隔離，且 review schedule 正確按 user 維護
- [ ] 統計頁面能反映真實 review log，並可用於驗收 spacing revision 成效
