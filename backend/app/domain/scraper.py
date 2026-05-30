import asyncio
import time
from bs4 import BeautifulSoup
from typing import List, Dict, Any
import requests
from ..core.request_throttler import RequestThrottler
from ..core.logger import msg_logger, error_logger

# -------
# Scraper 
# -------
class Scraper:
    """
    Scraper is an asynchronous Python class for crawling and extracting structured knowledge from online web pages or articles.
    It supports:
    - Rate-limited scraping of one or multiple pages.

    Parameters:
    - requests_per_minute (int): Maximum number of requests allowed per minute.

    Members:
    - rate_limiter (RequestThrottler): Rate limiter to control API request frequency.

    Methods:
    - scrape_article(url: str) -> Dict[str, Any]: Scrape a single article asynchronously.
    - scrape_multiple(urls: List[str]) -> List[Dict[str, Any]]: Scrape and clean all articles in the urls list with built-in rate limiting.
    """
    def __init__(self, base_urls: List[str] = None, requests_per_minute: int = 60):
        self.rate_limiter = RequestThrottler(requests_per_minute=requests_per_minute)  # Initialize the maximum number of requests per minute

    # --------------------------------------
    # Scrape and preprocess a single article
    # --------------------------------------
    async def scrape_article(self, url: str) -> Dict[str, Any]:
        """
        Scrape and preprocess a single article asynchronously.
        This method can be used indendently without having to store the url into the class.

        Parameters:
        - url (str): Article URL.

        Returns:
        - Dictionary with:
            * success: Whether the extraction was successful.
            * title: Article title (from metadata).
            * html: Raw HTML content.
            * markdown: Markdown representation of the article.
            * html_length: Character count of HTML.
            * markdown_length: Character count of Markdown.
            * links_found: Number of internal and external links.
            * crawl_time: Unix timestamp of crawl.
            * text: cleaned text.
            * error: Error message if crawl fails.

        """

        if not isinstance(url, str):
            error_logger.error("URL must be a string, got %s", type(url))
            return {
                'success': False,
                'title': None,
                'html': None,
                'markdown': None,
                'html_length': None,
                'markdown_length': None,
                'links_found': None,
                'crawl_time': None,
                'text': "None",
                'error': "URL must be in string type."
            }
        
        try:
            response = await asyncio.to_thread(
                requests.get,
                url,
                timeout=20,
                headers={"User-Agent": "Mentorion/1.0 (+https://example.com)"},
            )
            response.raise_for_status()
            html = response.text

            soup = BeautifulSoup(html, "html.parser")
            title = (
                soup.title.string.strip()
                if soup.title and soup.title.string and soup.title.string.strip()
                else "Unknown Title"
            )
            links_found = len(soup.find_all("a"))
            text = self.clean_content(html)

            return {
                'success': True,
                'title': title,
                'html': html,
                'markdown': text,
                'html_length': len(html),
                'markdown_length': len(text),
                'links_found': links_found,
                'crawl_time': time.time(),
                'text': text,
                'error': None
            }
        except Exception as e:
            error_logger.error("Exception crawling %s: %s", url, e)
            return {
                'success': False,
                'title': None,
                'html': None,
                'markdown': None,
                'html_length': None,
                'markdown_length': None,
                'links_found': None,
                'crawl_time': None,
                'text': "None",
                'error': str(e)
            }

    # ----------------------------------
    # Scrape and Clean Multiple Articles
    # ----------------------------------
    async def scrape_multiple(self, urls: List[str] = None) -> List[Dict[str, Any]]:
        """
        Scrape and clean all articles in the urls list with built-in rate limiting and error handling.

        Parameters:
        - urls (List[str]): List of URLs.

        Returns:
        - A list of dictionaries with:
            * title: Article title (from metadata).
            * html: Raw HTML content.
            * markdown: Markdown representation of the article.
            * html_length: Character count of HTML.
            * markdown_length: Character count of Markdown.
            * links_found: Number of internal and external links.
            * crawl_time: Unix timestamp of crawl.
            * text: cleaned text.
            * error: Error message if crawl fails.
        """
        URLs: List[str] = []

        if not urls:
            error_logger.error("No URLs provided for scraping.")
            return []

        URLs = urls

        results = [None] * len(URLs)

        for i, url in enumerate(URLs):
            msg_logger.info("Crawling %s/%s: %s", i + 1, len(URLs), url)

            try:
                # -------------
                # Rate limiting
                # -------------
                self.rate_limiter.wait_if_needed()
                result = await self.scrape_article(url)

            # Error when crawling (e.g., network failure, blocked request, bad URL)
            # ---------------------------------------------------------------------
            except Exception as e:
                error_logger.error("Exception crawling %s: %s", url, e)
                result = {'error': str(e)}

            results[i] = result

        return results
    
    # --------------------------------------
    # Preprocess and clean the raw html data
    # --------------------------------------
    def clean_content(self, raw_html: str) -> str:
        """
        Preprocess and clean the raw HTML data into plain text.

        Parameters:
        - raw_html (str): The raw HTML content of the article.

        Returns:
        - cleaned_text (str): The cleaned plain text content.
        """
        try:
            soup = BeautifulSoup(raw_html, 'html.parser')

            # Remove Script and Style Elements
            # --------------------------------
            for script_or_style in soup(['script', 'style']):
                script_or_style.decompose()

            # Get Text
            # --------
            text = soup.get_text(separator='\n')

            # Break into lines and remove leading/trailing space
            # --------------------------------------------------
            lines = (line.strip() for line in text.splitlines())

            # Drop Blank Lines
            # ----------------
            cleaned_text = '\n'.join(line for line in lines if line)

            return cleaned_text

        except Exception as e:
            error_logger.error("Error cleaning HTML content: %s", e)
            return "Empty Content Due to Cleaning Error"
