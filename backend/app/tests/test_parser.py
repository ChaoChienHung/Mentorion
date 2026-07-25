import pytest
from backend.app.schemas.note import Note
from backend.app.schemas.question import QuizQuestion
from backend.app.domain.parser import parse_markdown_to_note, format_note_to_markdown

def test_parse_markdown_to_note_success():
    md = """<meta>
Title: Test Title
Success: true
Summary: Test summary is here.
RelatedConcepts: Python, OOP, Testing
ErrorMessages: None, ErrorB
</meta>

# Core Header
This is the core body content.
It has multiple lines.

<qquiz>
title: Summary Quiz
<question>
Question: What is 2 + 2?
A: 3
ResponseA: No, 3 is incorrect.
B: 4
ResponseB: Yes, 4 is correct.
Answer: B
Explanation: Basic arithmetic.
</question>
</qquiz>

<qprompt count=5 type=["mcq"]/>
"""
    note = parse_markdown_to_note(md)
    
    assert note.title == "Test Title"
    assert note.success is True
    assert note.summary == "Test summary is here."
    assert note.related_concepts == ["Python", "OOP", "Testing"]
    assert note.error_messages == ["None", "ErrorB"]
    
    # Core body check
    assert "# Core Header" in note.content
    assert "This is the core body content." in note.content
    assert "<qquiz>" not in note.content
    assert "<meta>" not in note.content
    
    # Quiz check
    assert len(note.quizzes) == 1
    assert isinstance(note.quizzes[0], QuizQuestion)
    assert note.quizzes[0].question == "What is 2 + 2?"
    assert note.quizzes[0].a == "3"
    assert note.quizzes[0].responsea == "No, 3 is incorrect."
    assert note.quizzes[0].b == "4"
    assert note.quizzes[0].responseb == "Yes, 4 is correct."
    assert note.quizzes[0].answer == "b"
    assert note.quizzes[0].explanation == "Basic arithmetic."
    
    # Prompt check
    assert note.qprompt is not None
    assert "Requested question type(s): [\"mcq\"]" in note.qprompt

def test_parse_markdown_empty():
    note = parse_markdown_to_note("")
    assert note.success is False
    assert "Empty markdown content" in note.error_messages

def test_format_note_to_markdown():
    note = Note(
        title="Format Title",
        success=True,
        summary="Format Summary",
        content="Format Content Body",
        related_concepts=["TagA", "TagB"],
        quizzes=[
            QuizQuestion(
                question="Q?",
                a="Option A",
                responsea="Incorrect A",
                b="Option B",
                responseb="Correct B",
                answer="b",
                explanation="Exp"
            )
        ],
        error_messages=["None"]
    )
    
    md = format_note_to_markdown(note)
    
    assert "<meta>" in md
    assert "Title: Format Title" in md
    assert "RelatedConcepts: TagA, TagB" in md
    assert "Format Content Body" in md
    assert "<qquiz>" in md
    assert "Question: Q?" in md
    assert "Answer: B" in md
    assert "<qprompt/>" in md
