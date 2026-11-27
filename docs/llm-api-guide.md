# Mentorion LLM API 串接指南

本文件說明 Mentorion 的**統一多 LLM Provider 抽象層**（`backend/app/core/llm/`），支援 **Google Gemini**、**OpenAI（GPT / Codex）** 與 **Anthropic Claude**，並提供 API Key 自動偵測、能力鎖定（Capability Gating）、結構化出題／批改，以及 AI 導師的 NotebookLM 風格外部資源探索。

---

## 1. 環境變數與多 Provider 能力矩陣

Mentorion 後端啟動時會從環境變數（或專案根目錄 `.env`）動態偵測可用的 Provider，定義位於 `backend/app/core/config.py` 與 `backend/app/core/llm/`：

| 環境變數 | 必填 | 預設值 | 說明 |
| :--- | :---: | :--- | :--- |
| `LLM_PROVIDER` | 否 | `auto` | 指定預設引擎：`auto`（依 `gemini -> openai -> anthropic` 自動選用）或手動指定 |
| `GEMINI_API_KEY` | 啟用 Gemini 時 | `None` | Google Gemini API Key（支援 Function Calling + **Google Search Grounding**） |
| `GEMINI_MODEL` | 否 | `gemini-2.5-flash` | Gemini 模型 ID |
| `OPENAI_API_KEY` | 啟用 OpenAI 時 | `None` | OpenAI API Key（支援 GPT / Codex Tool Calling；**外部資源探索鎖定**） |
| `OPENAI_MODEL` | 否 | `gpt-4o-mini` | OpenAI 模型 ID |
| `OPENAI_BASE_URL` | 否 | `None` | 選填，可指向 OpenAI 相容端點 |
| `ANTHROPIC_API_KEY` | 啟用 Claude 時 | `None` | Anthropic API Key（支援 Tool Use；**外部資源探索鎖定**） |
| `ANTHROPIC_MODEL` | 否 | `claude-3-5-sonnet-latest` | Claude 模型 ID |

### API Key 自動偵測與功能鎖定策略

- **無任何 API Key**：`GET /api/llm/status` 回傳 `available: false`，所有 `capabilities` 皆為 `false`，前端（AI 導師與測驗面板）自動鎖定所有 LLM 功能按鈕；筆記閱讀、SM-2 排程、手動新增題目、手動收藏連結與「複製出題 Prompt」皆維持可用。
- **使用 OpenAI / Anthropic**：`quiz_generation`、`essay_grading`、`study_mentor`、`resource_summarize` 全部解鎖；`resource_discovery` 保持鎖定（`POST /api/resources/discover` 回傳 HTTP 403），提示需切換至 Gemini。
- **使用 Gemini**：全功能解鎖，包含 Google Search Grounding 探索真實外部連結。

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
- **回傳結構**（`EssayGradeResponse`）：`score`（0–5）、`correct_points`、`corrections`、`suggestions`、`summary_feedback`。

### 3.3 五大 Study Coach Function Calling 工具（`backend/app/domain/study_coach.py`）

所有工具皆只讀寫 Mentorion 自己的 SQLite 與 `data/questions.json`，絕不修改外部 Markdown Vault：

| 工具名稱 | 對應 API | 用途 |
| :--- | :--- | :--- |
| `propose_reschedule` | `POST /api/coach/reschedule/plan` → `/apply` | 自然語言排程重排（先 dry-run 預覽，使用者確認後套用） |
| `submit_quiz_questions`（補題模式） | `POST /api/coach/remediate` | 針對答錯或低分題自動生成鷹架／反例補題並去重入庫 |
| `submit_question_audit` | `POST /api/coach/audit-questions` | 以 Bloom 認知層次（`recall`/`understand`/`apply`/`analyze`）標記題庫並移除重複題 |
| `ask_followup_hint` / `commit_review_rating` | `POST /api/coach/socratic` | 蘇格拉底式多輪口試追問，答出關鍵點或第 3 輪後自動結算 SM-2 評分 |
| `submit_weekly_diagnosis` | `POST /api/coach/weekly-diagnosis` → `/apply` | 學習健康週報、頑固筆記（低 Ease Factor）診斷與一鍵補強排程 |

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
