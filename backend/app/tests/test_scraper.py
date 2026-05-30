import pytest
from backend.app.domain.scraper import Scraper

TEST_URL = "https://en.wikipedia.org/wiki/Python_(programming_language)"


class MockResponse:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError("mock http error")


@pytest.fixture
def mock_requests(monkeypatch):
    def mock_get(url, timeout=20, headers=None):
        return MockResponse(
            "<html><head><title>Hi</title></head><body><h1>Hi</h1></body></html>"
        )

    monkeypatch.setattr("backend.app.domain.scraper.requests.get", mock_get)


@pytest.mark.asyncio
async def test_scrape_article_success(mock_requests):
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
async def test_scrape_article_http_error(monkeypatch):
    def mock_get(url, timeout=20, headers=None):
        return MockResponse("oops", status_code=500)

    monkeypatch.setattr("backend.app.domain.scraper.requests.get", mock_get)

    scraper = Scraper()
    result = await scraper.scrape_article(TEST_URL)
    assert result["success"] is False


@pytest.mark.asyncio
async def test_scrape_multiple(mock_requests):
    scraper = Scraper(requests_per_minute=10)

    urls = [
        "https://example.com",
        "https://www.iana.org/domains/example"
    ]

    results = await scraper.scrape_multiple(urls)

    assert len(results) == len(urls)
    for res in results:
        assert "success" in res
