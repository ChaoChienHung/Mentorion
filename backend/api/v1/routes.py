from fastapi import APIRouter, Depends
from backend.schemas.note import Note, NoteRequest
from backend.api.v1.dependencies import note_service, rate_limit

router = APIRouter()

# -------------
# Define Routes
# -------------


# --------------------
# Scrape Note from URL
# --------------------
@router.post("/notes/scrape", response_model=Note)
async def scrape_note(request: NoteRequest) -> Note:
    return await note_service.create_note_from_url(request.url)

# ---------------------------
# Parse Note from Raw Content
# ---------------------------
@router.post("/notes/parse", response_model=Note)
def parse_note(request: NoteRequest) -> Note:
    return note_service.parse_note_content(request.raw_content)

# ----------------------------
# Generate Questions from Note
# ----------------------------
@router.post("/notes/generate-questions", response_model=Note)
def generate_questions(note: str) -> Note:
    return note_service.generate_questions(note)