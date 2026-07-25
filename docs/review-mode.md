# Review Mode（Spaced Repetition）

目標：基於已保存的筆記（Note）自動生成題目，並用 spaced repetition 排程記錄複習節奏（repeat time / next due）。

## 題型

### Short Answer

- `question`：問題
- `answer`：標準答案

### MCQ

- `question`：問題
- `choices[]`：選項
- `correct_index`：正解索引
- `explanation`（optional）：解釋

## 資料模型（建議）

### ReviewCard

- `id`
- `note_id`
- `type`: `short_answer | mcq`
- `payload`: short answer 或 mcq 的內容
- `created_at`
- `updated_at`

### ReviewSchedule（SM‑2 變體）

- `card_id`
- `ease_factor`（初始 2.5）
- `interval_days`（初始 0）
- `repetitions`（初始 0）
- `last_review_at`
- `next_review_at`

### ReviewLog

- `card_id`
- `grade`（0–5）
- `reviewed_at`
- `meta`（可選：前端耗時/來源/題目版本）

## 排程更新（0–5）

建議採用 SM‑2 核心概念：

- 若 `grade < 3`：`repetitions = 0`、`interval_days = 1`
- 若 `grade >= 3`：
  - `repetitions += 1`
  - `interval_days`：
    - `repetitions == 1` → 1
    - `repetitions == 2` → 6
    - 其他 → `round(interval_days * ease_factor)`
  - `ease_factor = max(1.3, ease_factor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)))`
- `next_review_at = now + interval_days`

## API（規劃）

- `POST /review/generate`：從 note 生成/補題（短答 + MCQ）
- `GET /review/due`：取 due 卡片（可 limit）
- `POST /review/grade`：回傳 grade，更新 schedule 並寫入 log
