from fastapi import APIRouter
from ...schemas.note import Note, NoteRequest
from ...schemas.error import ErrorResponse
from .dependencies import note_service

router = APIRouter()

# -------------
# Define Routes
# -------------


# --------------------
# Scrape Note from URL
# --------------------

@router.post(
    "/notes/scrape",
    response_model=Note,
    responses={429: {"model": ErrorResponse}},
)
async def scrape_note(request: NoteRequest) -> Note:
    return await note_service.create_note_from_url(request.url)

# ---------------------------
# Parse Note from Raw Content
# ---------------------------
@router.post(
    "/notes/parse",
    response_model=Note,
    responses={429: {"model": ErrorResponse}},
)
def parse_note(request: NoteRequest) -> Note:
    return note_service.parse_note_content(request.raw_content)

# ----------------------------
# Generate Questions from Note
# ----------------------------
@router.post(
    "/notes/generate-questions",
    response_model=Note,
    responses={429: {"model": ErrorResponse}},
)
def generate_questions(note: Note) -> Note:
    return note_service.generate_questions(note)
