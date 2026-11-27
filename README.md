# Mentorion

Mentorion 是一個個人學習輔助與間隔重複（Spaced Repetition）複習系統。本專案將主動回憶測驗、SM-2 排程與筆記庫閱讀整合至 FastAPI（Python）後端與 React (Vite) 前端，以 SQLite 與集中式題庫 `data/questions.json` 作為調度核心，並對外部 Markdown 知識庫保持只讀。

---

## 🛠️ 快速安裝與啟動

> 建議使用 **Python 3.12+** 與 **Node.js 18+**。

### 1. 後端 (FastAPI + SQLite)

#### 安裝依賴
```bash
# 建立 Python 虛擬環境
python3.12 -m venv venv
source venv/bin/activate

# 安裝依賴 (包含開發套件)
pip install -e '.[dev]'
```

#### 啟動後端伺服器（支援彈性 Port）
```bash
# 預設 port 8000，或透過 MENTORION_PORT / --port 任意指定
MENTORION_PORT=8000 ./venv/bin/python -m backend.app.main
# 或使用 uvicorn 熱重載
./venv/bin/uvicorn backend.app.main:app --reload --port 8000
```
> 後端啟動時會自動在 `backend/` 下建立 `app.db`，並將實際 URL 寫入 `~/.mentorion/runtime.json` 供前端與 Nexus 自動發現（API 文件位於 `http://localhost:8000/docs`）。

### 2. 前端 (React + Vite)

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

## ⚙️ 環境變數與多 LLM API 設定（選填）

在專案根目錄下建立 `.env`（**請勿提交至 Git**）或在終端機中導出（至少設定其中一組即可啟用 AI 導師與自動出題）：
```bash
# 預設自動偵測（gemini -> openai -> anthropic），亦可透過 LLM_PROVIDER 指定
export LLM_PROVIDER="auto"

# Google Gemini（完整支援 Function Calling + Google Search 外部資源探索）
export GEMINI_API_KEY="您的_GEMINI_API_KEY"
export GEMINI_MODEL="gemini-2.5-flash"

# OpenAI（GPT / Codex，支援 Function Calling；外部資源探索將自動鎖定）
export OPENAI_API_KEY="您的_OPENAI_API_KEY"
export OPENAI_MODEL="gpt-4o-mini"

# Anthropic Claude（支援 Tool Use；外部資源探索將自動鎖定）
export ANTHROPIC_API_KEY="您的_ANTHROPIC_API_KEY"
export ANTHROPIC_MODEL="claude-3-5-sonnet-latest"
```

- **模型名稱自訂**：設定頁可為各供應商輸入模型 ID，個別儲存至本機 `.env.local`，無須更換 API Key。
- **統一介面與自動能力鎖定**：後端透過 `backend/app/core/llm/` 統一抽象多 LLM Provider，並提供 `GET /api/llm/status` 即時偵測 API Key。**若未偵測到任何 API Key，前端會自動鎖定所有 LLM 相關功能**（閱讀筆記、排程複習、手動新增題目與「複製出題 Prompt」皆不受影響）；**若使用非 Gemini 引擎，則僅鎖定「外部資源探索」功能**。
- **結構化出題、資源探索與跨來源研究**：透過 Function Calling 強制輸出結構化題目（`submit_quiz_questions`）與申論題 0–5 分批改（`grade_essay_answer`），並在 **AI 導師** 頁面提供 NotebookLM 風格的外部資源探索（Gemini Google Search Grounding）、收藏、網頁抓取摘要與跨來源進階出題（原筆記全程維持只讀）。
- **進階指南**：詳細架構、多 Provider 契約與 API 說明請見 [docs/llm-api-guide.md](docs/llm-api-guide.md)。

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

---

## 🔐 私有資料倉分離與整合（Mentorion + Mentorion-Vault）

與 `Nexus` / `Nexus-Vault` 相同的「**公開程式碼引擎 + 私有個人資料倉**」架構：
- **Mentorion（本專案，公開 Repo）**：只放程式碼、Schema 定義與文件。預設情況下，所有個人資料會統一存放在根目錄的 `data/` 底下。
- **Mentorion-Vault（獨立私有 Repo）**：集中存放你的個人學習資料（`app.db`、`questions.json` 與 `library/`），可透過環境變數 `MENTORION_VAULT_DIR` 直接覆蓋掉預設的 `data/` 路徑，讓程式碼與個人資料完全分離、又能安心推上私有 GitHub Repo 備份。

### 私有資料倉（`Mentorion-Vault`）標準目錄結構

```text
Mentorion-Vault/
├── .gitignore            # 忽略 *.db-shm / *.db-wal / *.db-journal / .DS_Store（保留 app.db 可 commit）
├── app.db                # SQLite 資料庫（筆記中繼資料、SM-2 排程、任務、複習紀錄、note_resources、schema_sources）
├── questions.json        # 集中式題庫（與 SQLite notes.question_ids 雙向同步）
└── library/              # Mentorion 原生 Markdown 筆記（<slug>.md）
```

### 建立並整合自己的私有資料倉

1. **在 `Mentorion` 同層建立私有資料倉目錄並初始化 Git**：
```bash
mkdir -p ../Mentorion-Vault/library
echo '{"questions": []}' > ../Mentorion-Vault/questions.json
cat <<'EOF' > ../Mentorion-Vault/.gitignore
.DS_Store
*.db-shm
*.db-wal
*.db-journal
EOF

cd ../Mentorion-Vault
git init -b main
git add . && git commit -m "chore: initialize Mentorion-Vault"
# 綁定你在 GitHub 建立的 Private Repo
git remote add origin https://github.com/<你的帳號>/Mentorion-Vault.git
git push -u origin main
```

2. **在 `Mentorion/` 建立 `.env.local`（已列入 `.gitignore`）指向私有資料倉**：
```bash
cd ../Mentorion
cp .env.example .env.local
```
確認 `.env.local` 中設定（相對路徑會自動相對於 `Mentorion/` 根目錄解析，亦可填絕對路徑）：
```env
MENTORION_VAULT_DIR=../Mentorion-Vault
```

3. **日常操作與資料同步**：
   - 啟動後端時會自動讀取 `.env.local`，所有 `app.db`、`questions.json` 與 `library/` 的讀寫都會直接落到 `Mentorion-Vault/`（若未設定 `MENTORION_VAULT_DIR`，則自動退回使用本 repo 預設的 `Mentorion/data/`）。
   - 複習完畢想備份進度時，在私有資料倉執行 Git 推送即可（建議先停止後端或確認無寫入中的事務，避免 SQLite WAL 檔未合併）：
```bash
cd ../Mentorion-Vault
git status
git add .
git commit -m "chore: backup study progress"
git push origin main
```

---

## 📂 目錄結構

```bash
Mentorion/
├── backend/
│   └── app/                    # FastAPI 應用程式核心
│       ├── api/                # 路由層 (支援 /api/v1 及 /api 雙前綴)
│       ├── core/               # 設定、多 LLM 抽象層 (llm/) 與 runtime 註冊
│       ├── db/                 # SQLite 資料庫連線與 SQLAlchemy Models
│       ├── domain/             # LLM 出題/批改/導師、資源探索與 Markdown 解析邏輯
│       └── schemas/            # Pydantic 資料契約定義 (SSOT)
├── frontend/                   # React + Vite + TS 應用程式
│   ├── src/                    # React 核心組件 (包含 App.tsx 與 AI 導師面板)
│   ├── vite.config.ts          # Vite 設定檔 (配置有 API Proxy 轉發至 8000 埠)
│   └── tsconfig.json           # TypeScript 編譯器配置
├── data/                       # 預設本地資料夾 (app.db / questions.json / library/)；可被 MENTORION_VAULT_DIR 覆蓋
├── schemas/                    # 檔案驅動 Schema 定義 (nexus / obsidian / plain-markdown)
├── docs/                       # 項目詳細設計文檔與 Doc Map
│   └── agents/                 # 工具無關的 Agent 工作流、軟硬護欄邊界、踩坑紀錄與 Eval 規範
├── .env.example                # 環境變數範例（複製為 .env.local 設定 Vault 與 API Key）
├── AGENTS.md                   # 角色分工與協作流程規範
└── TODO.md                     # 當前待辦事項
```

---

## 🧪 驗證與測試

### 執行後端測試
本專案的 Parser、Scraper 及 LLM 模組均附帶單元測試，測試時使用 Mock 機制，不依賴真實 API 金鑰與外網：
```bash
./venv/bin/pytest backend/app/tests
```

### 執行前端編譯與打包檢查
```bash
cd frontend

# 檢查 TypeScript 類型
npx tsc --noEmit

# 檢查生產環境打包
npm run build
```

---

## 🤝 協作與規範

請遵循 [AGENTS.md](AGENTS.md) 內規定的核心原則：
1. **單一真相來源 (SSOT)**：後端資料結構以 `backend/app/schemas/` 為準。
2. **契約變更需同步**：任何 API 變更、資料庫欄位調整均需同步更新 `docs/` 內的文檔。
3. **文件索引**：請參閱 [docs/doc-map.md](docs/doc-map.md) 以定位文檔位置。
4. **Agent 工程規範**：軟硬護欄、踩坑紀錄、Eval 標準與自動化工作流見 [docs/agents/](docs/agents/)（`guardrails.md` / `provenance.md` / `evals.md` / `workflows.md`）。
