from schemas.note import Note
from backend.domain.agent import Agent
from core.rate_limiter import RateLimiter
from backend.services.note_service import NoteService

from fastapi import FastAPI, Request, HTTPException


app = FastAPI(title="Mentorion API")

limiter = RateLimiter(limit=60, window_sec=60)

agent = Agent()

async def rate_limit(request: Request, call_next):
    client_ip = request.client.host
    if not limiter.is_allowed(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")

    return await call_next(request)

app.middleware("http")(rate_limit)

@app.post("/notes/scrape", response_model=Note)
async def scrape_note(url: str) -> Note:
    note_service = NoteService(agent)
    return await note_service.create_note_from_url(url)

@app.post("/notes/parse", response_model=Note)
async def parse_note(raw_content: str) -> Note:
    note_service = NoteService(agent)
    return note_service.parse_note_content(raw_content)