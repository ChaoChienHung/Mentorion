# Mentorion

Mentorion 是一個個人學習輔助與間隔重複（Spaced Repetition）複習系統。本專案將主動回憶測驗、SM-2 排程與筆記庫閱讀整合至 FastAPI（Python）後端與 React (Vite) 前端，以 SQLite 與集中式題庫 `data/questions.json` 作為調度核心，並對外部 Markdown 知識庫保持只讀。

---

## 📌 系統架構與功能

- **Backend (FastAPI)**:
  - 串接 **Gemini API（含 Function Calling）** 生成結構化題目（`mcq` / `short_answer` / `true_false` / `open` / `essay`）與自動批改。
  - 檔案驅動的 **Schema 讀取引擎**（`schemas/*.json`：`nexus.json`、`obsidian.json`、`plain-markdown.json`），對外部知識庫保持只讀。
  - 計算 **SM-2 間隔重複算法**，動態排程複習任務，並提供 `/health` 與彈性 port（`MENTORION_PORT` / `PORT`）及 `~/.mentorion/runtime.json` 自動註冊。
  - 提供統計接口 (`/api/stats`)，計算每日點數赤字（Deficit Points，目標為每日 5.0 分）、分類時間花費與逾期任務數。
- **Frontend (React + Vite + TypeScript + Tailwind v4)**:
  - **黑白灰 Studio Minimal 設計**，免登入牆直接進入個人工作區，內建 **繁體中文 / English** 設定切換。
  - 提供 **Library（階層筆記庫閱讀模式 + 互動測驗面板）**、**複習月曆**、**每日任務**、**統計數據**與 **Schema 資料來源**管理。
  - 與 **Nexus** 採可組合架構：各自獨立完整，啟動時透過 `~/.mentorion/runtime.json` 自動讓 Nexus 探測與連動。
- **Streamlit**: 
  - 提供快速原型的 Streamlit 管理界面，共用相同的後端 API 服務，避免行為分歧。

---

## 📂 目錄結構

```bash
Mentorion/
├── backend/
│   ├── app/                    # FastAPI 應用程式核心
│   │   ├── api/                # 路由層 (支援 /api/v1 及 /api 雙前綴)
│   │   ├── db/                 # SQLite 資料庫連線與 SQLAlchemy Models
│   │   ├── domain/             # LLM Agent 與 Markdown 解析邏輯 (SSOT)
│   │   └── schemas/            # Pydantic 資料契合定義
│   └── app.db                  # SQLite 資料庫 (啟動時自動建立)
├── frontend/                   # React + Vite + TS 應用程式
│   ├── src/                    # React 核心組件 (包含 App.tsx 儀表板)
│   ├── vite.config.ts          # Vite 設定檔 (配置有 API Proxy 轉發至 8000 埠)
│   └── tsconfig.json           # TypeScript 編譯器配置
├── library/                    # Mentorion 原生扁平筆記目錄 (<slug>.md)
├── schemas/                    # 檔案驅動 Schema 定義 (nexus / obsidian / plain-markdown)
├── Streamlit/                  # Streamlit 原型界面
├── docs/                       # 項目詳細設計文檔與 Doc Map
├── AGENTS.md                   # 角色分工與協作流程規範
└── TODO.md                     # 當前待辦事項
```

---

## 🛠️ 開發與安裝指南

### 1. 後端 (FastAPI + SQLite) 安裝與啟動

#### 建立虛擬環境並安裝依賴：
```bash
# 建立 Python 虛擬環境
python3 -m venv venv
source venv/bin/activate

# 安裝依賴 (包含開發與 Streamlit 套件)
pip install -e '.[dev,streamlit]'
```

#### 設定環境變數與 LLM API（Gemini Function Calling）：
在專案根目錄下建立 `.env`（**請勿提交至 Git**）或在終端機中導出：
```bash
export GEMINI_API_KEY="您的_GEMINI_API_KEY"
export GEMINI_MODEL="gemini-2.5-flash"   # 可選，預設 gemini-2.5-flash
```

- **串接方式**：後端透過 `google-genai` SDK（`backend/app/core/ai_client.py`）與 Gemini Function Calling（`backend/app/domain/quiz_engine.py`）強制輸出結構化題目（`submit_quiz_questions`）與申論題 0–5 分批改結果（`grade_essay_answer`），並集中存儲於 `data/questions.json`。
- **無 API Key 降級模式**：未設定 `GEMINI_API_KEY` 時仍可正常閱讀筆記與排程複習，並可使用閱讀器左側工具列的「複製出題 Prompt」手動配合外部 AI 使用。
- 詳細架構、API 契約與擴充其他 LLM Provider 方式請見 [docs/llm-api-guide.md](docs/llm-api-guide.md)。

#### 啟動後端伺服器（支援彈性 Port）：
```bash
# 預設 port 8000，或透過 MENTORION_PORT / --port 任意指定
MENTORION_PORT=8000 ./venv/bin/python -m backend.app.main
# 或
./venv/bin/uvicorn backend.app.main:app --reload --port 8000
```
> 後端啟動時會自動在 `backend/` 下建立 `app.db`，並將實際 URL 寫入 `~/.mentorion/runtime.json` 供前端與 Nexus 自動發現。

---

### 2. 前端 (React + Vite) 安裝與啟動

前端已配置 Vite Proxy 代理伺服器。開發時，所有 `/api` 請求會自動轉發至 `http://localhost:8000`。

```bash
cd frontend

# 安裝 npm 套件
npm install

# 啟動 Vite 開發伺服器
npm run dev
```
> 前端將會運行在 `http://localhost:5173`。

---

### 3. Streamlit 啟動

若要啟動 Streamlit 管理端界面：
```bash
source venv/bin/activate
streamlit run Streamlit/Home.py
```

---

## 🧪 驗證與測試

### 執行後端測試：
本專案的 Parser、Scraper 及 LLM 模組均附帶單元測試，測試時使用 Mock 機制，不依賴真實 API 金鑰與外網：
```bash
./venv/bin/pytest backend/app/tests
```

### 執行前端編譯與打包檢查：
```bash
cd frontend

# 檢查 TypeScript 類型
npx tsc --noEmit

# 檢查生產環境打包
npm run build
```

---

## 🤝 協作與規範

請遵循 [AGENTS.md](file:///Users/ludwigchao/Desktop/Ludwig/Projects/Mentorion/AGENTS.md) 內規定的核心原則：
1. **單一真相來源 (SSOT)**：後端資料結構以 `backend/app/schemas/` 為準。
2. **契約變更需同步**：任何 API 變更、資料庫欄位調整均需同步更新 `docs/` 內的文檔。
3. **文件索引**：請參閱 [docs/doc-map.md](file:///Users/ludwigchao/Desktop/Ludwig/Projects/Mentorion/docs/doc-map.md) 以定位文檔位置。
