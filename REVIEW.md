# REVIEW

## Awaiting review

- [ ] 可組合本地端工具組與 Schema 驅動架構規劃（已寫入 `TODO.md`）
  - **Delivered:** 更新 `TODO.md`（P2 `可組合架構與 Schema 驅動連動`），確立三項核心定位：(1) Mentorion 採開放且可自訂欄位對映的 Document Schema（以通用 `source_doc_id` 橋接，不綁定 Nexus）；(2) 獨立模式具備與 Nexus 一致的 Editorial Minimal Reading Mode，專注 SM-2 排程、日曆與出題（不含 Terminology / Knowledge Graph）；(3) 當與 Nexus 並存時，由 **Nexus 作為主整合入口（Composition Hub）** 掛載 Mentorion API，完整保留 Knowledge Graph 與 Terminology 並組合進複習與出題流程。
  - **Evidence:** 完整設計哲學已收錄於 `../Nexus/docs/architecture/composable-suite.md`；Nexus 端亦已備妥 `review: fresh | reviewed` schema、`PATCH /api/docs/:docId/review` 與 `npm run query` CLI。
  - **Review focus:** 確認可自訂 schema mapping 格式與 Phase 1（獨立 Reading Mode + `source_doc_id` 同步）優先順序，確認後即可開始實作。
