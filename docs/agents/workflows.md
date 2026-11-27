# Agent 工作流與排程規範（Workflows）

以與平台無關的 `Scope → Build → Eval → Schedule` 四階段方法論，規劃、驗證並迭代 Mentorion 的 Agent 自動化流程。

## Scope → Build → Eval → Schedule

1. **Scope（收斂 v0 邊界）**：明確界定輸入來源、允許修改的資料表或檔案（如僅寫 `Mentorion-Vault` SQLite，不改外部筆記）及非目標項目。
2. **Build（沿用單一資料流實作）**：透過 `backend/app/core/llm/`、`backend/app/schemas/` 與既有 Service 層實作，不複製平行的 API 或 Prompt 管線。
3. **Eval（先定義驗收標準）**：手動試跑並通過 [evals.md](evals.md) 的 schema、隔離與降級指標。
4. **Schedule（穩定後才排程）**：確認人工觸發與 Eval 穩定通過後，才串接批次出題、跨來源摘要或定期複習統計等排程工作流。

## 適用場景與迭代方向（Next Directions）

- **AI 結構化出題管線**：依筆記主題批次產生題庫並寫入 `questions.json`／SQLite，定期抽樣驗證題幹清晰度與重複率。
- **外部資源探索與跨來源摘要**：透過 AI 導師介面彙整收藏資源（`note_resources`）與摘要，全程保持原筆記只讀。
- **Next Directions**：為各類題型建立固定測試案例集（golden eval cases），比較不同 LLM Provider（Gemini / OpenAI / Anthropic）出題品質。
