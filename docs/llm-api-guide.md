# Mentorion LLM API 串接指南

本文件說明 Mentorion 如何透過 **Google Gemini API（`google-genai` SDK + Function Calling）** 進行結構化出題、申論題自動批改，以及如何在無 API Key 時降級為手動 Copy Prompt 工作流，或替換為其他 LLM Provider。

---

## 1. 環境變數與設定

Mentorion 後端啟動時會從環境變數（或專案根目錄 `.env`）讀取設定，定義位於 `backend/app/core/config.py`：

| 環境變數 | 必填 | 預設值 | 說明 |
| :--- | :---: | :--- | :--- |
| `GEMINI_API_KEY` | 啟用 LLM 功能時必填 | `None` | Google AI Studio / Gemini API Key（**嚴禁提交至 Git**） |
| `GEMINI_MODEL` | 否 | `gemini-2.5-flash` | 用於出題與批改的 Gemini 模型 ID（例如 `gemini-2.5-flash`、`gemini-2.5-pro`） |

### 設定方式（建議使用 `.env`）

在 `Mentorion/` 根目錄建立 `.env`（已列於 `.gitignore`）：

```env
GEMINI_API_KEY=your_actual_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

或直接在終端機匯出：

```bash
export GEMINI_API_KEY="your_actual_gemini_api_key"
export GEMINI_MODEL="gemini-2.5-flash"
```

> **無 API Key 時的降級行為**：
> 若未設定 `GEMINI_API_KEY`，Mentorion 仍可完整執行筆記庫閱讀、SM-2 排程、集中題庫查詢與手動複習；在閱讀器左側 Hover 工具列點擊 **Copy Prompt（複製出題 Prompt）**，即可將結構化 Prompt 複製到任何外部 AI 工具使用。

---

## 2. 系統串接架構

```
Frontend (QuizPanel / App.tsx)
   │
   ├── POST /api/quiz/load           (載入既有題庫或透過 LLM 生成新題目)
   ├── POST /api/quiz/grade-essay    (將簡答／申論題作答送交 LLM 評分)
   └── POST /api/tasks/from-note     (新增任務時檢查題庫並視需要出題)
          │
          ▼
Backend Domain Layer
   ├── backend/app/core/ai_client.py      → create_gemini_client() (google.genai.Client)
   ├── backend/app/domain/quiz_engine.py  → Function Calling 出題與批改
   ├── backend/app/schemas/quiz.py        → Pydantic Schema SSOT
   └── backend/app/domain/question_bank.py → 集中題庫 data/questions.json 與去重
```

---

## 3. 兩大 Function Calling 契約

Mentorion **不依賴自由文本 JSON 解析**，而是強制模型呼叫宣告好的 Function Calling Tool（`ToolConfig(function_calling_config=ANY)`），再經由 Pydantic 驗證，確保輸出 100% 符合題庫與評分契約。

### 3.1 結構化出題：`submit_quiz_questions`

- **實作位置**：`backend/app/domain/quiz_engine.py` → `generate_questions_via_function_calling(...)`
- **支援題型**：`mcq`、`short_answer`、`true_false`、`open`、`short_essay`、`essay`
- **防重複機制**：呼叫 LLM 前會自動帶入該筆記既有的 `existing_prompts`，要求模型避免生成語意重複題目；回傳後再由 `question_bank.py` 執行正規化與 Jaccard 相似度去重，並寫入 `data/questions.json` 與同步更新 SQLite `notes.question_ids`。

### 3.2 申論題批改：`grade_essay_answer`

- **實作位置**：`backend/app/domain/quiz_engine.py` → `grade_essay_via_function_calling(...)`
- **對應 API**：`POST /api/quiz/grade-essay`
- **回傳結構**（`EssayGradeResponse`）：
  - `score`（`0`–`5`）：對應 SM-2 評分尺度
  - `strengths`（`string[]`）：作答正確與亮點
  - `missing_points`（`string[]`）：遺漏或需補強的關鍵概念
  - `feedback`（`string`）：具體改進建議
  - `suggested_sm2_rating`（`0`–`5`）：建議直接帶入 SM-2 複習排程的評分

---

## 4. 測試規範（Mock 隔離）

單元測試**禁止呼叫真實外部 API**。`generate_questions_via_function_calling` 與 `grade_essay_via_function_calling` 皆接受可選參數 `client: Any = None`，測試時直接注入 Mock Client：

```bash
./venv/bin/pytest backend/app/tests/test_quiz_engine.py backend/app/tests/test_question_bank.py
```

---

## 5. 擴充或替換其他 LLM Provider

若未來要切換至 OpenAI、Anthropic 或本地 Ollama／vLLM：
1. 在 `backend/app/core/config.py` 新增對應設定（例如 `LLM_PROVIDER`、`OPENAI_API_KEY`、`LLM_BASE_URL`）。
2. 保持 `backend/app/schemas/quiz.py`（`QuizQuestionItem`、`EssayGradeResponse`）為唯一契約（SSOT）。
3. 在 `backend/app/domain/quiz_engine.py` 以相同的 tool schema（`submit_quiz_questions`、`grade_essay_answer`）封裝新 Provider 的 tool-calling 呼叫，使上層 API 與前端零改動。
