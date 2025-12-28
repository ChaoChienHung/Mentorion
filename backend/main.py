from fastapi import FastAPI
from app.api.v1 import ai

app = FastAPI(title="Mentorion API")

app.include_router(ai.router, prefix="/api/v1", tags=["AI"])