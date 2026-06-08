# Collaboration

## Ground Rules

- Schema 單一真相來源：`backend/app/schemas/`
- API 契約以 OpenAPI 為準（前端不得硬編假設）
- 測試不可依賴外網與真實金鑰
- 任何契約變更必須同步更新文件（README + docs/api.md）

## Dev Workflow

### 任務管理

- 新工作寫入 `TODO.md`
- 完成後移除或將結論寫入 docs（避免 TODO 長期堆積噪音）

### 提交前自檢

```bash
pip install -e '.[dev]'
./venv/bin/python -m pytest backend/app/tests
```

若有改動前端：

```bash
cd frontend
npm run lint
npm run build
```

## Ownership

- Backend：`backend/app/**`
- Frontend：`frontend/**`
- Streamlit：`Streamlit/**`
- Docs：`README.md`、`AGENTS.md`、`docs/**`、`TODO.md`
