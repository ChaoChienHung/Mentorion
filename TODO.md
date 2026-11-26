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

- [ ] **Phase 1：Schema 驅動讀取與獨立 Reading Mode**
  - [ ] 定義開放的 Document Source Schema 與可自訂欄位對映設定（預設對應 `id` / `title` / `summary` / `review` / 正文，支援使用者覆寫 frontmatter key 名稱）
  - [ ] 在 Mentorion `notes` 資料表新增可選通用橋接欄位 `source_doc_id`（唯一索引），不綁定特定工具
  - [ ] 新增同步端點／Adapter，掃描符合 schema 的 Markdown 資料夾（含 `Nexus-Vault/wiki/`），將新文件（優先 `review: fresh`）自動註冊進 Mentorion 並排入初次複習 `Task`
  - [ ] 前端實作 **Editorial Minimal Reading Mode**（沿用 Nexus 色彩與排版 tokens，聚焦閱讀與測驗，不含 Terminology / Knowledge Graph）
- [ ] **Phase 2：開放本地 API 供 Nexus 組合掛載 + 狀態回寫**
  - [ ] 穩定 Mentorion 本地 API 契約（due 清單、單篇 SM-2 狀態查詢、Quiz 生成與評分、手動觸發同步），讓 Nexus 可透過 `MENTORION_API_URL` 無縫整合
  - [ ] 複習打分完成（寫入 `ReviewLog`）時，透過可插拔回寫機制更新來源文件的複習狀態（例如呼叫 Nexus `PATCH /api/docs/:docId/review` 或依 schema mapping 更新 frontmatter 為 `reviewed`）
  - [ ] 當來源文件重新標記為 `fresh` 時，下次同步可重新排入複習佇列
- [ ] **Phase 3：選配 Graph-Aware 進階出題**
  - [ ] 當偵測到來源知識庫具備 Ontology / Knowledge Graph 能力（如 Nexus `npm run query -- subgraph <concept_id>`）時，自動解鎖跨概念比較題與關聯題（無圖譜時優雅退化為單篇出題）

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
