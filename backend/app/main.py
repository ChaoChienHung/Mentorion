# -------
# FastAPI
# -------
from fastapi import FastAPI

# -------
# Routers
# -------
from .api.v1.dependencies import rate_limit
from .api.v1.routes import router as v1_router

# --------
# Database
# --------
from .db.base import Base
from .db.session import engine

app = FastAPI(title="Mentorion API")

def _ensure_sqlite_columns():
    """Lightweight non-destructive migration adding missing columns to existing SQLite tables."""
    from sqlalchemy import text

    expected_tables = {
        "notes": {
            "user_id": "INTEGER NOT NULL DEFAULT 1",
            "source_id": "INTEGER",
            "source_doc_id": "VARCHAR",
            "file_path": "VARCHAR",
            "question_ids": "JSON DEFAULT '[]'",
            "last_reviewed_at": "VARCHAR",
            "next_review_date": "VARCHAR",
        },
        "journal_events": {
            "user_id": "INTEGER NOT NULL DEFAULT 1",
        },
    }
    with engine.begin() as conn:
        for table_name, cols in expected_tables.items():
            existing = {
                row[1]
                for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
            }
            if not existing:
                continue
            for col, col_type in cols.items():
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col} {col_type}"))


@app.on_event("startup")
def on_startup():
    # Create all tables in the database and migrate missing columns safely
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
    from .core.config import settings
    from .core.runtime_registry import register_backend_runtime

    register_backend_runtime(settings.HOST, settings.PORT)

# ------------
# Rate Limiter
# ------------
app.middleware("http")(rate_limit)

app.include_router(v1_router, prefix="/api/v1")
app.include_router(v1_router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok", "service": "mentorion"}

@app.get("/")
def root():
    return {"Hello": "World"}

if __name__ == "__main__":
    import uvicorn
    from .core.config import settings

    uvicorn.run("backend.app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
