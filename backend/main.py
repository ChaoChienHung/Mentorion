import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.domain.agent import NoteAgent
from backend.core.rate_limiter import RateLimiter
from backend.schemas.note import Note, NoteRequest
from backend.services.note_service import NoteService

from fastapi import FastAPI, Request, HTTPException, Body


app = FastAPI(title="Mentorion API")

agent = NoteAgent()
note_service = NoteService(agent)
limiter = RateLimiter(limit=60, window_sec=60)

async def rate_limit(request: Request, call_next):
    client_ip = request.client.host
    if not limiter.is_allowed(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")

    return await call_next(request)

app.middleware("http")(rate_limit)

@app.get("/")
def root():
    return {"Hello": "World"}

@app.post("/notes/scrape", response_model=Note)
async def scrape_note(request: NoteRequest) -> Note:
    return await note_service.create_note_from_url(request.url)

@app.post("/notes/parse", response_model=Note)
def parse_note(request: NoteRequest) -> Note:
    return note_service.parse_note_content(request.raw_content)

@app.post("/notes/generate-questions", response_model=Note)
def generate_questions(note: str) -> Note:
    return note_service.generate_questions(note)