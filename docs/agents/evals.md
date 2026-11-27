# Agent 驗收與評測標準（Evals）

在將 AI 出題、批改、外部資源探索或批次維護工作流自動化前，先定義可驗證的驗收標準（Eval）與回歸門檻。

## 基礎工程驗收門檻

- **後端單元測試**：`./venv/bin/pytest backend/app/tests`（無真實 API key、無外網依賴，全數 Mock 通過）。
- **前端型別與建置**：`cd frontend && npx tsc --noEmit && npm run build` 無錯誤。
- **契約一致性**：任何 request/response 或模型欄位異動皆已同步至 `backend/app/schemas/` 與 `docs/`。

## AI 與自動化任務 Eval 指標

1. **Function Calling 結構合規率**：`submit_quiz_questions` 與 `grade_essay_answer` 輸出 100% 通過 Pydantic schema 驗證（題型 `mcq`/`short_answer`/`true_false`/`open`/`essay`、申論 0–5 分區間與回饋欄位齊全）。
2. **來源忠實度與外部筆記隔離**：出題與摘要引用正確對應來源段落，且外部知識庫檔案零寫入、無副作用。
3. **外部抓取降級處理**：抓取失敗或超時時優雅降級回傳明確狀態，不中斷既定複習任務或寫入損壞資料。
