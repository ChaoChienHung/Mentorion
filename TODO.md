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
- [ ] Review Journal（Calendar）資料模型
  - [ ] 定義 journal event schema：`note_created` / `review_due` / `review_done` / `manual_review`
  - [ ] 所有 calendar / 統計資料與 events 先走 SQLite DB，避免以零散 files 作為主儲存
  - [ ] 複習 event 小卡只需 refer 關聯 note 的 `canonical_id`，其餘筆記詳細欄位（Title, Content 等）在 realtime 時即時查詢與獲取
  - [ ] 支援手動新增「自己的複習任務」（指定日期、標題、備註、關聯 note）
- [ ] Planit package 整合
  - [ ] 定義 Mentorion 與 Planit 的邊界：Mentorion 管資料與排程，Planit 管 calendar UI
  - [ ] 先以 package 方式整合 Planit，不使用 submodule
  - [ ] 準備 event adapter，讓 Planit 可以吃 Mentorion 的 journal event 格式
- [ ] 最小前端頁面
  - [ ] `/review`：開始複習（顯示題目 → 選項/答案 → 0-5 打分）
  - [ ] `/review/stats`：顯示 due 數量、今日完成數、近期複習曲線（可後做）
  - [ ] `/calendar`：用 Planit package 顯示 Review Journal（日 / 週 / 月檢視）
  - [ ] 在 calendar 中支援「新增筆記」與「複習筆記」兩種主要操作入口
  - [ ] 在 calendar 中顯示每日統計：新增筆記數、已複習筆記數、待複習數

### Frontend（最小可用）

- [ ] 串接 backend API（notes scrape / parse / generate）
- [ ] 加上最小可用路由（Notes 列表/編輯頁）

### Image to Note（拍照轉筆記）

- [ ] 支援拍照 / 圖片上傳後轉成筆記
  - [ ] 定義最小輸入：圖片檔 + 選填補充提示詞
  - [ ] 輸出沿用既有 `Note` schema，避免另開一套 note 結構
  - [ ] 路線 A：串接外部多模態 API（例如 Gemini API）做圖片理解與筆記生成
  - [ ] 路線 B：評估自建 VLM model 流程（OCR / 視覺理解 / 結構化輸出）
  - [ ] 新增對應 API 規劃，例如 `POST /notes/from-image`
  - [ ] 前端提供上傳預覽、轉換結果確認、失敗重試

### Streamlit（避免分歧）

- [ ] 串接 backend API 或共用 domain logic（避免兩套行為分歧）

### 交付條件（P1）

- [ ] 可以從 UI（Frontend 或 Streamlit）建立/更新一筆 note，並在 DB 中可查到
- [ ] 複習模式可走完一輪：取 due → 顯示題目 → 0-5 打分 → next_due 更新
- [ ] Review 與 Notes 的核心 API 皆有測試覆蓋（不依賴外網/金鑰）

## P2（品質與可維運）

### 可組合架構與 Schema 驅動連動（Standalone + Nexus Composition）

> 設計哲學（詳見 `../Nexus/docs/architecture/composable-suite.md`）：**Unix 哲學的可組合本地端工具組**。
> - **Mentorion 獨立可用**：採與 Nexus 一致的 **Editorial Minimal** 視覺風格與筆記 Reading Mode，但聚焦在複習排程與出題（**不包含** Terminology 與 Knowledge Graph）。
> - **Schema 驅動、不綁定 Nexus**：透過開放且**允許使用者自訂欄位對映**的 Markdown Document Schema 讀取任何相容筆記庫；內容 SSOT 留在外部 Markdown，排程與作答紀錄 SSOT 留在 Mentorion SQLite。
> - **整合端放在 Nexus**：當同時使用 Nexus 與 Mentorion 時，由 **Nexus 作為主入口（Composition Hub）** 掛載 Mentorion API，完整保留 Knowledge Graph 與 Terminology，同時組合進 SM-2 排程、日曆與 Quiz 能力。

- [x] **Phase 1：檔案驅動 Schema、黑白灰 Studio Minimal 改版與 Library**
  - [x] 建立 `schemas/*.json`（`nexus.json`、`obsidian.json`、`plain-markdown.json`）與 `docs/custom-schema-guide.md`
  - [x] 在 `notes` 新增通用橋接欄位 `source_doc_id`，並提供 `GET /api/schemas`、`POST /api/schema-sync/preview|import`
  - [x] 前端升級為黑白灰 Studio Minimal（移除登入牆、新增繁中／英文設定、將閱讀模式升級為含階層資料夾樹與搜尋的 `Library`、放大月曆與表單字體）
  - [x] 支援彈性 port（`MENTORION_PORT` / `VITE_PORT`）、`GET /health` 與 `~/.mentorion/runtime.json` 動態服務發現
- [ ] **Phase 2：SQLite 資料模型補齊與集中式題庫（Mentorion Own SSOT）**
  - [ ] 新增 `schema_sources` 資料表（方案 B：1 資料夾路徑 ↔ 1 `schemas/*.json`，支援多資料夾來源與最長路徑前綴優先）
  - [ ] 在 `notes` 補齊 `source_id`、`file_path`、`last_reviewed_at`、`next_review_date`
  - [ ] 新增集中式 `questions` 資料表（以 `note_id` 為 ownership、`category`、`type`、`prompt`、`payload_json`、`source`），外部知識庫保持只讀不寫入題庫，並支援單檔 `questions.json` 匯出
  - [ ] LLM 生題去重：呼叫 `submit_quiz_questions` 前注入該 `note_id` 既有題目清單 + 寫入前相似度過濾
  - [ ] 新增 `short_essay` / `essay` 題型與 `grade_essay_answer` Gemini Function Calling（讀原筆記與使用者作答 → 回傳 0–5 SM-2 分數、答對重點、糾正與建議，並寫入 `review_logs`）
- [ ] **Phase 3：Library 與排程整合 + Graph-Aware 進階出題**
  - [ ] 確認並實作「Library 外接筆記 → 手動或條件式進入複習排程（Pattern A/B/C）」流程（不污染外部知識庫）
  - [ ] 當偵測到來源知識庫具備 Ontology / Knowledge Graph 能力（如 Nexus `npm run query -- subgraph <concept_id>`）時，自動解鎖跨概念比較題與關聯題

### 工程品質與維運

- [ ] Python 版本升級到 3.11+（目前可跑，但第三方套件對 3.9 會有 EOL 警告）
- [ ] Frontend `npm audit` 漏洞處理（目前 `npm ci` 會提示 vulnerabilities）
- [ ] 統一 error handling（HTTPException / 統一 error response）
- [ ] 加入 CI（lint + test）
- [ ] 設定檔集中化（env / config loader，避免多份 config）
- [ ] Review Journal 清理策略
  - [ ] 提供 archive / hide completed，避免 calendar 視圖過度擁擠
  - [ ] 暫不做 memory 壓縮，先以 DB 查詢與保留策略控制資料量
- [ ] Google Calendar 遷移準備
  - [ ] 定義 internal event -> Google Calendar event 的欄位對映
  - [ ] 先支援匯出 / 轉換格式，後續再補 import / sync

### 交付條件（P2）

- [ ] CI 在 main 分支穩定通過（backend tests + frontend lint/build）
- [ ] 後端錯誤回傳格式一致（至少涵蓋常見錯誤碼），且 docs/api.md 同步更新
- [ ] 專案用一套清楚的 config 規範（env keys、預設值、dev/prod 行為）

## P3（產品化與擴充）

- [ ] 多使用者/登入與個人統計（SQLite）
  - [ ] 建立 SQLite 資料庫記錄個人帳號
  - [ ] 記錄每個帳號的統計值：未完成 task 數、已完成 task 數、每個 category 的 task 數等
  - [ ] 所有 calendar events 及複習排程與特定 user-id 綁定
- [ ] Review stats（/review/stats）與可視化（完成數、due、遺忘曲線/間隔分布）
- [ ] 題目策略優化（短答/MCQ 混合比例、難度分級、依照弱項補題）
- [ ] 內容匯入/匯出（Markdown/JSON/Anki）與資料備份
- [ ] 若 Planit 日後成為獨立產品，再評估 package 升級為 API 整合

### 交付條件（P3）

- [ ] 不同使用者資料彼此隔離，且 review schedule 正確按 user 維護
- [ ] 統計頁面能反映真實 review log，並可用於驗收 spacing revision 成效
