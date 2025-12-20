import pytest
from src.agent import Agent
from src.schema import Note
from unittest.mock import AsyncMock

TEST_URL = "https://en.wikipedia.org/wiki/Python_(programming_language)"

@pytest.mark.asyncio
async def test_scrape_note_success(mocker):
    """
    Test that scrape_note returns a structured Note
    when the client and scraper behave as expected.
    """

    # 1️⃣ Create Agent instance
    agent = Agent()
    
    # Mock client
    class MockClient:
        class models:
            @staticmethod
            def generate_content(model, contents, config):
                class Response:
                    text = '{"title": "Test Article", "success": true, "summary": "Summary here", "content": "Full content", "related_concepts": ["Concept1", "Concept2"], "error_messages": []}'
                return Response()
            
    agent.client = MockClient()

    # Mock async scraper
    mocker.patch("src.agent.Scraper.scrape_article", new=AsyncMock(return_value={"text": "Some scraped content"}))

    # Call async scrape_note
    result = await agent.scrape_note(TEST_URL)

    # Assertions
    assert isinstance(result, Note)
    assert result.title == "Test Article"
    assert result.success is True
    assert "Summary" in result.summary
    assert "Full content" in result.content
    assert "Concept1" in result.related_concepts

@pytest.mark.asyncio
async def test_scrape_note_no_client():
    agent = Agent()
    agent.client = None  # Simulate missing API client
    result = await agent.scrape_note(TEST_URL)
    assert result.success is False
    assert "No client detected" in result.error_messages[0]
