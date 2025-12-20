import pytest
from backend.src.scraper import Scraper

TEST_URL = "https://en.wikipedia.org/wiki/Python_(programming_language)"

@pytest.mark.asyncio
async def test_scrape_article_success():
    scraper = Scraper(requests_per_minute=10)

    result = await scraper.scrape_article(TEST_URL)

    assert result["success"] is True
    assert isinstance(result["html"], str)
    assert isinstance(result["markdown"], str)
    assert isinstance(result["text"], str)
    assert result["html_length"] > 0
    assert result["markdown_length"] > 0
    assert result["crawl_time"] is not None
    assert result["error"] is None


@pytest.mark.asyncio
async def test_scrape_article_invalid_url():
    scraper = Scraper()

    result = await scraper.scrape_article(123)  # invalid type

    assert result["success"] is False
    assert result["error"] is not None


@pytest.mark.asyncio
async def test_scrape_multiple():
    scraper = Scraper(requests_per_minute=10)

    urls = [
        "https://example.com",
        "https://www.iana.org/domains/example"
    ]

    results = await scraper.scrape_multiple(urls)

    assert len(results) == len(urls)
    for res in results:
        assert "success" in res
