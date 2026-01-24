# -------
# FastAPI
# -------
from fastapi import FastAPI

# -------
# Routers
# -------
from api.v1.dependencies import rate_limit
from api.v1.routes import router as v1_router

# --------
# Database
# --------
from db.base import Base
from db.session import engine

app = FastAPI(title="Mentorion API")

@app.on_event("startup")
def on_startup():
    # Create all tables in the database
    Base.metadata.create_all(bind=engine)

# ------------
# Rate Limiter
# ------------
app.middleware("http")(rate_limit)

app.include_router(v1_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"Hello": "World"}