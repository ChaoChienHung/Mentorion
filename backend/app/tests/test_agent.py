import json
from schemas.note import Note
from domain.agent import NoteAgent
from schemas.question import ShortAnswer as QA

# ------------------
# Mock Gemini Client
# ------------------
class MockClient:
    class models:
        @staticmethod
        def generate_content(model, contents, config):
            class Response:
                text = json.dumps({
                    "title": "Test Note",
                    "success": True,
                    "summary": "This is a summary",
                    "content": "This is the main content",
                    "related_concepts": ["Concept A", "Concept B"],
                    "qa": [
                        {"question": "What is Python?", "answer": "A programming language"}
                    ],
                    "error_messages": []
                })
            return Response()


class MockGeminiQAClient:
    class models:
        @staticmethod
        def generate_content(model, contents, config):
            class Response:
                text = json.dumps({
                    "qa": [
                        {"question": "What is testing?", "answer": "Verifying correctness"}
                    ]
                })
            return Response()


# ----------
# parse_note
# ----------
def test_parse_note_success():
    agent = NoteAgent(client=None)

    raw_json = json.dumps({
        "title": "Parsed Note",
        "summary": "Summary",
        "content": "Content",
        "related_concepts": ["A"],
        "qa": [{"question": "Q1", "answer": "A1"}]
    })

    note = agent.parse_note(raw_json)

    assert isinstance(note, Note)
    assert note.success is True
    assert note.title == "Parsed Note"
    assert note.qa[0].question == "Q1"


def test_parse_note_invalid_json():
    agent = NoteAgent(client=None)

    note = agent.parse_note("invalid json")

    assert note.success is False
    assert "Naive JSON Parsing failed" in note.error_messages[0]


# -------------
# generate_note
# -------------
def test_generate_note_success():
    agent = NoteAgent(client=MockClient())

    note = agent.generate_note("Some article content")

    assert isinstance(note, Note)
    assert note.success is True


def test_generate_note_no_client():
    agent = NoteAgent(client=None)

    note = agent.generate_note("Some content")

    assert note.success is True


# -----------
# generate_qa
# -----------
def test_generate_qa_success():
    agent = NoteAgent(client=MockGeminiQAClient())

    note = Note(
        title="Test",
        success=True,
        summary="Summary",
        content="Some content",
        related_concepts=[],
        qa=[],
        error_messages=[]
    )

    result = agent.generate_qa(note)

    assert result.success is True
    assert isinstance(result.qa[0], QA)


def test_generate_qa_empty_content():
    agent = NoteAgent(client=MockGeminiQAClient())

    note = Note(
        title="Empty",
        success=True,
        summary="",
        content="",
        related_concepts=[],
        qa=[],
        error_messages=[]
    )

    result = agent.generate_qa(note)

    assert result.success is False
    assert "Note content is empty" in result.error_messages[0]
