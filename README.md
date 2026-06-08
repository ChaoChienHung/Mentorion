# Mentorion

Mentorion 是一個練習 LLM（Gemini）整合的學習輔助專案，包含：
- Backend（FastAPI）：抓取文章 → 產生結構化筆記 → 產生 Q&A
- Frontend（React/Vite）：Web UI
- Streamlit：另一套簡易 UI

## 協作入口

- 角色分工與協作規範：[AGENTS.md](file:///Users/bytedance/Desktop/Ludwig/Mentorion/AGENTS.md)
- 文件索引（Doc Map）：[docs/doc-map.md](file:///Users/bytedance/Desktop/Ludwig/Mentorion/docs/doc-map.md)
- 待辦清單（完成後會移除）：[TODO.md](file:///Users/bytedance/Desktop/Ludwig/Mentorion/TODO.md)

## 需求

- Python：建議 3.11+（目前也可在 3.9 跑，但第三方套件會有 EOL 警告）
- Node.js：用於 frontend（npm）

## 目錄結構（現況）

```bash
Mentorion/
├─ backend/
│  ├─ app/                 # FastAPI app（在這層執行 uvicorn）
│  ├─ data/                # sqlite db
│  └─ requirements.txt
├─ frontend/               # React + Vite
├─ Streamlit/              # Streamlit app
├─ examples/               # 小範例腳本
├─ requirements.txt        # 聚合依賴（backend + streamlit）
└─ requirements-dev.txt    # 開發依賴（含測試）
```

## Backend API（FastAPI）

- 入口：[backend/app/main.py](file:///Users/bytedance/Desktop/Ludwig/Mentorion/backend/app/main.py)
- prefix：`/api/v1`

### Endpoints

- `POST /api/v1/notes/scrape`：body `{"url": "https://..."}` → `Note`
- `POST /api/v1/notes/parse`：body `{"raw_content": "..."}` → `Note`
- `POST /api/v1/notes/generate-questions`：body `Note` → `Note`（填入 qa）

## 環境變數

- `GEMINI_API_KEY`：未設定時，後端仍可啟動，但 LLM 相關功能（generate_note / generate_qa）會回傳 `success=false`
- `GEMINI_MODEL`：預設 `gemini-2.5-flash`

## 開發指令

### Python（Backend + Streamlit）

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
```

### Run backend

```bash
pip install -e '.[dev]'
./venv/bin/uvicorn backend.app.main:app --reload
```

### Run Streamlit

```bash
streamlit run Streamlit/Home.py
```

### Run frontend

```bash
cd frontend
npm ci
npm run dev
```

### Run tests

```bash
pip install -e '.[dev]'
./venv/bin/python -m pytest backend/app/tests
```

## Example

```bash
./venv/bin/python examples/demo_scrape_and_qa.py
```
