from fastapi import FastAPI
from api.v1.dependencies import rate_limit
from api.v1.routes import router as v1_router

app = FastAPI(title="Mentorion API")

# ------------
# Rate Limiter
# ------------
app.middleware("http")(rate_limit)

app.include_router(v1_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"Hello": "World"}