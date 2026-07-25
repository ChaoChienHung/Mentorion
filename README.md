# Mentorion 🚀

Mentorion 是一個個人學習輔助與間隔重複（Spaced Repetition）複習系統。本專案已將 AI Studio 導出的 App 功能完整整合至 FastAPI（Python）後端與 React (Vite) 前端中，並以 SQLite 資料庫作為統計與任務調度的核心，Markdown 檔案為筆記的單一真相來源（SSOT）。

---

## 📌 系統架構與功能

- **Backend (FastAPI)**:
  - 串接 **Gemini API** 進行多模態/網頁抓取並生成結構化筆記與 Quiz Q&A。
  - 計算 **SM-2 間隔重複算法**，動態排程複習任務。
  - 提供富統計接口 (`/api/stats`)，計算每日點數赤字（Deficit Points，目標為每日 5.0 分，完成 New 筆記得 1.0 分，Practice 得 0.5 分）、分類時間花費與逾期任務數。
- **Frontend (React + Vite + TypeScript + Tailwind v4)**:
  - 提供極致視覺美感（現代字型、暗色模式、精美圖表與動態微動畫）。
  - 提供 **Planit 複習日曆** 視圖與**每日任務看板**。
  - 支援筆記建立、Markdown 源碼預覽、複製與下載，以及 **Ludwigia 風格的 Summary Quiz 生成 Prompt** 複製。
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

#### 設定環境變數：
在專案根目錄下建立 `.env` 或在終端機中導出：
```bash
export GEMINI_API_KEY="您的_GEMINI_API_KEY"
export GEMINI_MODEL="gemini-2.5-flash"
```

#### 啟動後端伺服器：
```bash
./venv/bin/uvicorn backend.app.main:app --reload --port 8000
```
> 後端將會運行在 `http://localhost:8000`，並會自動在 `backend/` 下建立 `app.db` 資料表。

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
