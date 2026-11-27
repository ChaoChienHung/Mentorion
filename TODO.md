# TODO

本文件是「可執行」的待辦清單（里程碑式），只保留尚未完成的 P1 / P2 / P3 工作。每個里程碑都應有明確交付條件（可驗收）。

---

## 已完成核心里程碑（歸檔摘要）

- [x] **Studio Minimal 介面與免登入工作區**：黑白灰設計、繁中／英文切換、Library 閱讀模式、Popup 測驗與手動出題、月曆與每日統計
- [x] **只讀外部知識庫（Read-Only）與 Schema 驅動匯入**：`schemas/*.json`（`nexus`、`obsidian`、`plain-markdown`）、`schema_sources` 與 `notes.source_doc_id` 橋接
- [x] **集中式題庫與 6 種題型**：`questions.json` + SQLite `notes.question_ids` 雙向同步、去重 AI 出題、申論題 0–5 SM-2 自動批改與蘇格拉底提示
- [x] **多 LLM 統一介面與能力鎖定**：`GeminiProvider`、`OpenAIProvider`、`AnthropicProvider`、`GET /api/llm/status`、`POST /api/llm/key`（設定頁直接輸入並即時解鎖）、無 Key 全鎖定與非 Gemini 鎖定外部資源探索
- [x] **AI 導師（AI Mentor）與 NotebookLM 風格研究**：外部資源探索（Google Search Grounding）、SQLite `note_resources` 收藏、網頁抓取摘要、跨來源進階出題
- [x] **公開引擎 + 私有資料倉分離**：`MENTORION_VAULT_DIR` 指向獨立私有 `Mentorion-Vault`（`app.db`、`questions.json`、`library/`），設定頁即時顯示 Vault 路徑與 Git 備份狀態
- [x] **工程品質基礎**：`pytest` 獨立暫存 Vault 測試隔離、GitHub Actions CI（後端 `pytest` + 前端 `tsc` & `vite build`）、移除過期 Streamlit 原型

---

## P1（短期高價值）

### Graph-Aware 跨概念進階出題（低耦合可選介面）

- [ ] 以**可選 Context 欄位**（不寫死綁定 Nexus）擴充出題契約：
  - [ ] `QuizGenerateRequest` 支援選填 `related_concepts: List[{label, relation, summary}]`
  - [ ] 當外部知識庫（如 Nexus 或 Obsidian wikilinks）有提供關聯概念時，自動生成跨概念比較／差異辨析題；未提供時無痛降級
- [ ] Library 外接筆記排程策略微調（手動或條件式進入 SM-2 Pattern A/B/C，保持外部庫只讀）

### Image to Note（拍照轉筆記）

- [ ] 支援拍照 / 圖片上傳後轉成筆記（輸出沿用既有 `Note` schema）
  - [ ] 規劃 `POST /notes/from-image`（串接多模態 LLM API）
  - [ ] 前端提供上傳預覽、轉換結果確認、失敗重試

---

## P2（品質與可維運）

- [ ] 統一後端 Error Handling（統一 `ErrorResponse` 格式與常見錯誤碼，同步更新 `docs/api.md`）
- [ ] Frontend `npm audit` 漏洞檢視與依賴清理
- [ ] Review Journal 清理策略（提供 archive / hide completed，避免月曆視圖擁擠）
- [ ] Google Calendar 雙向同步完善（目前已有基礎匯出／連接主控台，後續可補自動 sync 與衝突處理）

---

## P3（產品化與擴充）

- [ ] 進階複習統計可視化（遺忘曲線、SM-2 間隔分布、弱項分類熱圖）
- [ ] 題目策略優化（短答／MCQ／填空／申論混合比例、難度分級、依弱項自動補題）
- [ ] 匯出相容格式（Anki `.apkg` / CSV / Markdown 考卷）
- [ ] 多使用者模式（可選開啟；單人本地端預設仍維持免登入直入）
