# Development Notes

## 最近整理（Refactor 記錄）

- 後端路由與 service 的介面已對齊：`/notes/scrape`、`/notes/generate-questions` 不再傳入未使用的 `db`。
- `Note` schema 統一使用 `qa`（List[ShortAnswer]），移除舊的 `questions/answers` 用法。
- `create_gemini_client()` 未設定 `GEMINI_API_KEY` 時不再直接 raise，方便在沒有金鑰的情況下跑測試與啟動服務。
- `requrest_throttler.py` 更名為 `request_throttler.py`，並修正 TypeError 訊息。
- Scraper 移除對 `crawl4ai` 的強耦合，改成 `requests + bs4`，避免在較舊 Python 版本被第三方套件型別語法卡住。
- 移除重複且過期的根目錄 `tests/` 與 `main.py`，新增可執行範例：[examples/demo_scrape_and_qa.py](file:///Users/bytedance/Desktop/Ludwig/Mentorion/examples/demo_scrape_and_qa.py)。
- Python 依賴改為：
  - [requirements.txt](file:///Users/bytedance/Desktop/Ludwig/Mentorion/requirements.txt)：聚合 backend + streamlit
  - [requirements-dev.txt](file:///Users/bytedance/Desktop/Ludwig/Mentorion/requirements-dev.txt)：加上測試依賴
- Streamlit/backend logger 行為對齊：確保 log dir 存在，並避免重複掛載 handler。

## 建議開發流程

### Backend

```bash
cd backend/app
uvicorn main:app --reload
```

### Streamlit

```bash
streamlit run Streamlit/Home.py
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

### Tests

```bash
./venv/bin/python -m pytest backend/app/tests
```
