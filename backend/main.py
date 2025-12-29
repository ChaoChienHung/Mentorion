from core.rate_limiter import RateLimiter
from fastapi import FastAPI, Request, HTTPException


app = FastAPI(title="Mentorion API")

limiter = RateLimiter(limit=60, window_sec=60)

async def rate_limit(request: Request, call_next):
    client_ip = request.client.host
    if not limiter.is_allowed(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")

    return await call_next(request)
