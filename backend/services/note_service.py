from typing import Dict, Any
from backend.schemas.note import Note
from backend.domain.agent import NoteAgent
from backend.domain.scraper import Scraper


class NoteService:
    """
    Application service responsible for orchestrating note-related workflows.
    """

    def __init__(self, agent: NoteAgent):
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
        
        # Scrape the article content
        # --------------------------
        scraper: Scraper = Scraper()
        scrape_result: Dict[str, Any] = await scraper.scrape_article(url)
        content: str = scrape_result.get("text", "")

        # Generate the note from scraped content
        # --------------------------------------
        note = self.agent.generate_note(content)

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

        result: Note = self.agent.parse_note(raw_content)
        if result.success:
            return result

        return self.agent.generate_note(raw_content)

    def generate_questions(self, note: Note) -> Note:
        """
        High-level use case:
        - enrich a note with Q&A
        """
        if not note.success:
            note.error_messages.append("Cannot generate Q&A for unsuccessful note")
            return note

        return self.agent.generate_qa(note)
