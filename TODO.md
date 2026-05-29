# TODO

## Infra / Tooling

- Python 版本升級到 3.11+（目前可跑，但第三方套件對 3.9 會有 EOL 警告）
- Frontend `npm audit` 漏洞處理（目前 `npm ci` 會提示 6 vulnerabilities）

## Refactor

- 統一 Python import 路徑（backend/app 目前依賴 cwd 才能 import：`from domain...`/`from schemas...`）
- 把 `print(...)` 統一替換成 logger（agent/scraper/service 層）
- 把 DB 持久化流程補齊（現在 NoteService 的 DB 寫入為註解狀態）

## Backend API

- 補上 OpenAPI 範例（request/response examples）
- 加上 error response schema（統一 HTTP 錯誤碼）

## Testing

- Agent/Scraper 測試加入更多 edge cases（空內容、超長內容、解析失敗）
- 加入 API 層測試（FastAPI TestClient）

## Frontend

- 串接 backend API（目前只是 skeleton）
- 加上最小可用路由（Notes 列表/編輯頁）

## Streamlit

- 串接 backend API 或共用 domain logic（避免兩套行為分歧）
