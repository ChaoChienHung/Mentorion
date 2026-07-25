# Review Journal Design

## 目標

`Review Journal` 是建構在 Mentorion 之上的 calendar 工作台，用來把「新增筆記」與「複習筆記」放進同一個時間視圖中管理。

短期目標不是做一套完整通用 calendar，而是提供一個以學習流程為中心的操作台：

- 看某一天新增了哪些筆記
- 看某一天完成了哪些複習
- 看某一天還有哪些待複習項目
- 直接在 calendar 上新增手動複習任務
- 顯示每日 / 每週的學習統計

## Repo 邊界

### Mentorion

- 單一資料真相來源（SSOT）
- 保存 note、review card、review schedule、review log、journal event
- 負責排程計算、統計聚合、資料查詢與匯出格式

### Planit（package）

- 以 package 方式提供 calendar UI 與互動層
- 提供日 / 週 / 月檢視
- 提供事件列表、日期切換、快捷操作入口、統計卡片

### 不採用 submodule 的原因

- 工作流較重，容易增加 clone / update / CI 成本
- 版本同步不如 package 清楚
- 現階段 Planit 更像 UI 模組，而不是獨立部署服務

## 核心原則

- 資料先留在 Mentorion，Planit 不成為主資料庫
- 所有 calendar 顯示資料都先從 SQL DB 查詢，不以零散 files 作為主儲存
- package 邊界先穩定，再決定未來是否升級為 API 整合
- Google Calendar 先支援格式轉換與匯出，不先做雙向同步

## 事件模型

建議統一成 `journal event`，供 calendar 與統計共用。

- `id`
- `type`: `note_created | review_due | review_done | manual_review`
- `title`
- `description`
- `start_at`
- `end_at`（optional）
- `status`: `pending | done | archived`
- `source_note_id`（optional）
- `source_review_card_id`（optional）
- `meta`（optional，保留 UI 或匯出資訊）
- `created_at`
- `updated_at`

## DB Schema（建議）

### `journal_events`

主表，供 `/calendar`、統計、Google Calendar 匯出共用。

- `id`: primary key
- `user_id`: nullable，先預留多使用者
- `event_type`: `note_created | review_due | review_done | manual_review`
- `title`: 事件標題
- `description`: nullable，補充文字
- `start_at`: datetime，事件開始時間
- `end_at`: nullable datetime
- `status`: `pending | done | archived`
- `source_note_id`: nullable，對應 note
- `source_review_card_id`: nullable，對應 review card
- `source_review_log_id`: nullable，對應 review log
- `source_kind`: `system | manual | imported`
- `meta`: JSON，保留 UI 或匯出附加資訊
- `created_at`
- `updated_at`

建議索引：

- `(user_id, start_at)`
- `(user_id, event_type, start_at)`
- `(user_id, status, start_at)`
- `source_note_id`
- `source_review_card_id`

### `manual_review_tasks`

若後續不想把手動複習任務完全混入 event 主表，可保留一張來源表，再同步投影成 `journal_events`。

- `id`: primary key
- `user_id`: nullable
- `note_id`: nullable
- `title`
- `description`: nullable
- `scheduled_for`: datetime
- `status`: `pending | done | archived`
- `created_at`
- `updated_at`

### 與既有 review 資料的關係

- `review_due`：可由 `ReviewSchedule.next_review_at` 投影生成或同步寫入
- `review_done`：由 `ReviewLog` 寫入後建立 event
- `note_created`：由 note 建立流程寫入 event
- `manual_review`：由手動建立任務寫入 event

MVP 可先採「直接寫 `journal_events` 主表」；等 domain 穩定後，再視需要拆成來源表 + 投影表。

## MVP 功能

### 1. Day View

- 顯示指定日期的新增筆記
- 顯示指定日期的待複習項目
- 顯示指定日期的已完成複習

### 2. Manual Review Task

- 手動新增一筆複習任務
- 可選擇日期、標題、備註與關聯 note

### 3. Quick Actions

- 從 calendar 直接新增筆記
- 從 calendar 直接開始複習某篇筆記或某張卡片

### 4. Stats

- 今日新增筆記數
- 今日已複習筆記數
- 今日待複習數
- 本週新增 / 複習趨勢

### 5. Archive / Clear

- 提供 archive 或 hide completed，避免視圖過度擁擠
- MVP 不做真刪除，先保留歷史資料以利統計

## 資料流

1. 使用者新增筆記
2. Mentorion 保存 note
3. Mentorion 寫入 `note_created` event
4. 使用者完成複習或系統產生 due
5. Mentorion 更新 review schedule / review log
6. Mentorion 寫入 `review_due` 或 `review_done` event
7. Planit package 讀取 journal events 並呈現在 `/calendar`

## Package Adapter 介面

Planit 不直接理解 Mentorion 的 ORM model，而是只吃乾淨的 adapter 輸出。

### Adapter 輸出型別

建議 Mentorion 提供一個 adapter，例如 `to_planit_calendar_payload()`，輸出：

```ts
type PlanitCalendarEvent = {
  id: string;
  type: "note_created" | "review_due" | "review_done" | "manual_review";
  title: string;
  description?: string;
  startAt: string;
  endAt?: string;
  status: "pending" | "done" | "archived";
  sourceNoteId?: string;
  sourceReviewCardId?: string;
  badges?: string[];
  meta?: Record<string, unknown>;
};

type PlanitCalendarDaySummary = {
  date: string;
  noteCreatedCount: number;
  reviewDoneCount: number;
  reviewDueCount: number;
  manualReviewCount: number;
};

type PlanitCalendarPayload = {
  rangeStart: string;
  rangeEnd: string;
  events: PlanitCalendarEvent[];
  summaries: PlanitCalendarDaySummary[];
};
```

### Adapter 需要保證的事

- 日期格式統一使用 ISO 8601
- 不回傳 ORM 細節或內部私有欄位
- 把 review / note / manual task 的來源差異壓平成統一 event
- summary 在 backend 先聚合，避免 Planit 在前端重算業務邏輯

### 推薦查詢介面

若之後要提供給前端 API，可先沿用 adapter 的 payload 形狀：

- `GET /calendar/events?start=...&end=...`
- `GET /calendar/summary?start=...&end=...`
- `POST /calendar/manual-review`

## 與 Google Calendar 的相容策略

先定義內部 event schema，再補轉換層：

- `journal event -> Google Calendar event`
- 優先支援匯出與格式轉換
- import / sync 留待後續階段

## 後續演進

- 若 Planit 日後要成為獨立產品，可把 package 方案升級成 API 整合
- 在那之前，Mentorion 仍維持資料與業務邏輯中心
