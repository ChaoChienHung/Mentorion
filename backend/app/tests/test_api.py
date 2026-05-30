import json

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.schemas.note import Note
from backend.app.schemas.question import ShortAnswer as QA


@pytest.fixture
def client():
    return TestClient(app)


def test_parse_note_success(client):
    raw_note = json.dumps(
        {
            "title": "Parsed Note",
            "summary": "Summary",
            "content": "Content",
            "related_concepts": ["A"],
            "qa": [{"question": "Q1", "answer": "A1"}],
        }
    )

    resp = client.post("/api/v1/notes/parse", json={"raw_content": raw_note, "url": ""})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["title"] == "Parsed Note"
    assert data["qa"][0]["question"] == "Q1"


def test_generate_questions_mocked(client, monkeypatch):
    import backend.app.api.v1.routes as routes

    def mock_generate_questions(note: Note) -> Note:
        return note.model_copy(update={"qa": [QA(question="What is X?", answer="X is ...")]})

    monkeypatch.setattr(routes.note_service, "generate_questions", mock_generate_questions)

    resp = client.post(
        "/api/v1/notes/generate-questions",
        json={
            "title": "T",
            "success": True,
            "summary": "S",
            "content": "C",
            "related_concepts": [],
            "qa": [],
            "error_messages": [],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["qa"][0]["question"] == "What is X?"


def test_scrape_note_mocked(client, monkeypatch):
    import backend.app.api.v1.routes as routes

    async def mock_create_note_from_url(url: str) -> Note:
        return Note(
            title="Mock",
            success=True,
            summary="S",
            content="C",
            related_concepts=[],
            qa=[],
            error_messages=[],
        )

    monkeypatch.setattr(
        routes.note_service, "create_note_from_url", mock_create_note_from_url
    )

    resp = client.post("/api/v1/notes/scrape", json={"url": "https://example.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Mock"
