import asyncio
import os
from backend.app.domain.agent import NoteAgent
from backend.app.domain.scraper import Scraper


async def main():
    url = os.getenv(
        "MENTORION_DEMO_URL",
        "https://en.wikipedia.org/wiki/Python_(programming_language)",
    )

    scraper = Scraper(requests_per_minute=30)
    agent = NoteAgent(client=None)

    scrape_result = await scraper.scrape_article(url)
    if not scrape_result.get("success"):
        raise RuntimeError(scrape_result.get("error") or "scrape failed")

    note = agent.generate_note(scrape_result.get("text", ""))
    note = agent.generate_qa(note)

    print(note.model_dump_json(indent=2))


if __name__ == "__main__":
    asyncio.run(main())
