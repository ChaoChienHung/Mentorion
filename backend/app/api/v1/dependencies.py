from domain.agent import NoteAgent
from fastapi import Request, HTTPException
from services.note_service import NoteService
from core.rate_limiter import SlidingWindowRateLimiter

# ------------------------------
# Initialize Shared Dependencies
# ------------------------------
agent = NoteAgent()
note_service = NoteService(agent)
limiter = SlidingWindowRateLimiter(limit=60, window_sec=60)

async def rate_limit(request: Request, call_next):
    client_ip = request.client.host
    if not limiter.is_allowed(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")
    return await call_next(request)
