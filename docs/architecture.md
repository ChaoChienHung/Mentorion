# Architecture

## Modules

### Backend（FastAPI）

- 入口：`backend/app/main.py`（ASGI app）
- API：`backend/app/api/`
- Service：`backend/app/services/`
- Domain：`backend/app/domain/`
- DB：`backend/app/db/`
- Schemas（SSOT）：`backend/app/schemas/`

依賴方向：API → Service → Domain/DB。

### Frontend（React/Vite）

- 目標：提供 Notes 與 Review mode 的主要使用者介面。
- 與後端互動：僅透過 HTTP API，避免把後端邏輯複製到前端。
- Calendar / Review Journal UI 可由外部 package 提供，但資料真相來源仍在後端。

### Planit（Package）

- 目標：提供 Review Journal / Calendar 的 UI 元件與互動層。
- 邊界：不保存主資料，只消費 Mentorion 提供的 note / review / journal event 資料。

### Streamlit

- 目標：快速原型或內部工具。
- 原則：若與 Web 功能重疊，優先改為呼叫後端 API，避免兩套行為分歧。

## Data Flow（Notes）

1. 使用者提供 URL 或 raw content
2. Backend Scraper 抓取/清理內容（Domain）
3. NoteAgent 解析或生成 Note（Domain）
4. 回傳 Note（API）
5. （未來）落庫保存（DB）

## Data Flow（Review mode）

1. 由 Note 生成題目（短答 + MCQ）
2. 將題目保存為「卡片」
3. 使用者複習時取得 due 卡片
4. 使用者 0–5 評分後回傳
5. 後端更新排程（next_review_at / interval / ease）

## Data Flow（Review Journal）

1. 使用者新增筆記或建立手動複習任務
2. Backend 保存 note / task / review 狀態
3. Backend 寫入統一的 journal event
4. Planit package 讀取 journal events 並渲染 calendar 與統計
