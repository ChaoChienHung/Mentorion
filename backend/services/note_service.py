from backend.schemas.note import Note
from backend.domain.agent import Agent


class NoteService:
    """
    Application service responsible for orchestrating note-related workflows.
    """

    def __init__(self, agent: Agent):
        self.agent = agent

    async def create_note_from_url(self, url: str) -> Note:
        """
        High-level use case:
        - scrape article
        - extract structured note
        """
        if not url:
            return Note(
                title="Untitled",
                success=False,
                summary="",
                content="",
                related_concepts=[],
                questions=[],
                answers=[],
                error_messages=["URL is required"]
            )

        note = await self.agent.scrape_note(url)
        return note

    def parse_note_content(self, raw_content: str) -> Note:
        """
        High-level use case:
        - parse a user-provided note
        """
        if not raw_content.strip():
            return Note(
                title="Untitled",
                success=False,
                summary="",
                content="",
                related_concepts=[],
                questions=[],
                answers=[],
                error_messages=["Note content is empty"]
            )

        return self.agent.parse_note(raw_content)

    def generate_questions(self, note: Note) -> Note:
        """
        High-level use case:
        - enrich a note with Q&A
        """
        if not note.success:
            note.error_messages.append("Cannot generate Q&A for unsuccessful note")
            return note

        return self.agent.generate_qa(note)
