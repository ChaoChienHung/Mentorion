# 實驗與踩坑紀錄（Provenance & Failure Log）

持續追加的紀錄檔：每次調整 Agent 工作流、Prompt 或架構護欄時，把「試過什麼、哪裡翻車、最後改成什麼護欄」簡要記下，避免後續切換不同工具或新對話時重複踩坑。

| 日期 | 工作流／改動 | 發生過的問題或漂移 | 解法／確立的護欄 |
| --- | --- | --- | --- |
| 2026-11-27 | 外部知識庫整合（如 `Nexus-Vault`） | 若讓學習或出題流程直接寫入外部 Markdown 筆記庫，會破壞來源檔案並與 Nexus 產生雙向寫入衝突。 | 維持外部知識庫完全 Read-Only；所有 SM-2 排程、集中題庫 `questions.json` 與 `note_resources` 統一由 Mentorion SQLite 與 `MENTORION_VAULT_DIR` 擁有。 |
| 2026-11-27 | LLM 模組測試與多 Provider 切換 | 測試若直接打真實 LLM API 或外網抓取，會在無金鑰或離線環境失敗，且無法穩定重現。 | 統一經由 `backend/app/core/llm/` 抽象，測試強制 Mock；未設 API Key 或非 Gemini 引擎時由 `GET /api/llm/status` 自動鎖定對應功能。 |

<!-- 後續有新的踩坑與護欄調整，請依格式往上追加。 -->
