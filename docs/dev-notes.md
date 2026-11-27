# Development Notes

## 最近整理（Refactor 記錄）

- 後端路由與 service 的介面已對齊：`/notes/scrape`、`/notes/generate-questions` 不再傳入未使用的 `db`。
- `Note` schema 統一使用 `qa`（List[ShortAnswer]），移除舊的 `questions/answers` 用法。
- `create_gemini_client()` 未設定 `GEMINI_API_KEY` 時不再直接 raise，方便在沒有金鑰的情況下跑測試與啟動服務。
- `requrest_throttler.py` 更名為 `request_throttler.py`，並修正 TypeError 訊息。
- Scraper 移除對 `crawl4ai` 的強耦合，改成 `requests + bs4`，避免在較舊 Python 版本被第三方套件型別語法卡住。
- 移除重複且過期的根目錄 `tests/` 與 `main.py`，新增可執行範例：[examples/demo_scrape_and_qa.py](file:///Users/bytedance/Desktop/Ludwig/Mentorion/examples/demo_scrape_and_qa.py)。
- Python 依賴改為以 `setup.cfg` 為單一真相來源（SSOT），用 extras 管理 dev：
  - `pip install -e '.[dev]'`
- 已移除早期 Streamlit 原型（改由 `frontend/` React 介面統一承接）。

## 建議開發流程

### Backend

```bash
pip install -e '.[dev]'
./venv/bin/uvicorn backend.app.main:app --reload
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
