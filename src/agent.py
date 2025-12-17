import os
import json
import time
from google import genai
from scraper import Scraper
from schema import ExtractedArticle
from rate_limiter import RateLimiter
from typing import Dict, Literal, Any

class Agent:
    """
    An AI Agent for processing, extracting, and analyzing structured knowledge from web content and notes.

    Features:
    - Read and understand structured notes
    - Merge multiple notes into a single structured format
    - Scrape, process, and append or merge notes from websites (URL input)
    - Generate concise summaries from raw content
    - Generate question & answer pairs for learning or review
    - Check and correct answers based on structured knowledge

    Parameters:
    - model (str, optional): The LLM model name (default = "gemini-2.5-flash").

    Members:
    - client: OpenAI client (initialized if API key is available)
    - model: The chosen LLM model
    - max_retries: Maximum number of retries for API calls
    - rate_limiter: Rate limiter for API calls
    - articles: Stores processed articles or notes (WikipediaExtraction objects)

    Methods:
    - create_secure_openai_client: Initializes OpenAI client using API key
    - read_note: Reads and understands a structured note
    - scrape_note: Extracts structured data from raw text or JSON notes
    - batch_extract: Processes multiple articles/notes in batches
    - basic_wiki_extraction: Provides a fallback extraction method when LLM is unavailable
    - structured_analysis: Converts raw function outputs into structured Analysis objects
    """
    def __init__(self, model: Literal["gemini-2.5-flash"] = "gemini-2.5-flash", max_retries: int = 3):
        self.client: genai | None = None                                     # LLM Agent
        self.model: str = model                                              # LLM Model, default is gemini-2.5-flash
        self.max_retries: int = max_retries                                  # Maximum number of retries
        self.rate_limiter: RateLimiter = RateLimiter(requests_per_minute=60) # Rate limiter
        self.articles: Dict[str, ExtractedArticle] = {}                      # Store articles

        self.create_secure_openai_client() # Initialize a LLM Agent

    # Initialize an OpenAI client
    # ----------------------------
    def create_secure_openai_client(self):
        """
        Create and intialize a client using configured API key.

        Steps:
        1. Looks for GEMINI_API_KEY in environment variables
        2. Tests the connection with a simple API call
        3. Returns the client or None if setup fails
        """
        print("🔐 Setting up Gemini client...")
        api_key: str = os.getenv("GEMINI_API_KEY")

        if not api_key:
            print("❌ No GEMINI_API_KEY found in environment variables.")
            print("💡 Set it with:")
            print("   • Linux/Mac: export GEMINI_API_KEY=your_key")
            print("   • Windows:  setx GEMINI_API_KEY your_key")
            return

        try:
            genai.configure(api_key=api_key)
            self.client = genai.GenerativeModel('gemini-2.5-flash')
            self.client.generate_content("Test my API key with a simple prompt.")
            print("✅ Gemini client created and tested successfully.")

        except Exception as e:
            print(f"❌ Failed to create Gemini client: {e}")
            print("🔍 Check your API key and internet connection.")

    # ---------
    # Read Note
    # ---------

    def read_note(self, note_content: str) -> ExtractedArticle:
        """
        Read and understand a structured note.

        Parameters:
        - note_content (str): The raw content of the note.

        Returns:
        - extracted_article (ExtractedArticle): The structured representation of the note.
        """
        note: Dict[str, str] = json.loads(note_content)
        extracted_article = ExtractedArticle(
            title=note.get("title", "Untitled"),
            success=True,
            summary=note.get("summary", ""),
            content=note.get("content", ""),
            related_concepts=note.get("related_concepts", ""),
            error_messages=[]
        )
        self.articles[extracted_article.title] = extracted_article
        return extracted_article
                
    # ------------------
    # Scrape Online Note
    # ------------------
    def scrape_note(self, url: str) -> ExtractedArticle:
        """
        Use LLM structured outputs to extract structured data from raw scraped text, retrying multiple times if needed,
        and automatically store the result.

        If no AI client is available, print out errors.

        Parameters:
        - content (str): The raw JSON output generated after the data cleaning process in the WikipediaScraper class.

        Returns:
        - wiki_extraction (WikipediaExtraction): A structured WikipediaExtraction object.
        """

        # If no client is available, print out error messages
        # ---------------------------------------------------
        # TODO: change to logging
        if not self.client:
            print("No client detected. Please check your client and API configuration is correct.")
            return ExtractedArticle(
                title="Untitled",
                success=False,
                summary="",
                content="",
                related_concepts="",
                error_messages=["No client detected. Please check your client and API configuration is correct."]
            )
        
        # Scrape the article content
        # --------------------------
        scraper: Scraper = Scraper()
        scrape_result: Dict[str, Any] = scraper.scrape_article(url)
        content: str = scrape_result.get("text", "")

        # Schema for Gemini AI Structured Extraction
        # ------------------------------------------
        schema: dict[str, Any] = ExtractedArticle.model_json_schema()
        schema["optionalProperties"] = False

        # Structured Response Configuration
        # ---------------------------------
        config = {
            "response_mime_type": "application/json",
            "response_json_schema": schema,
            "strict": True
        }

        # Prompt for Gemini AI
        # --------------------
        prompt: str = (
            "You are an expert mentor. "
            "Extract the key information from the following article content and format it according to the specified schema. "
            "Ensure accuracy and completeness in your extraction.\n\n"
            f"Article Content:\n{content}\n\n"
            "Provide the extracted information in strict JSON format as per the schema."
        )

        for attempt in range(self.max_retries):
            try:
                # Request OpenAI model with structured JSON schema
                # ------------------------------------------------
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=config
                )

                # Validate the data against the schema (parsing errors are not expected)
                # ----------------------------------------------------------------------
                try:
                    wiki_extraction: ExtractedArticle = ExtractedArticle.model_validate_json(response.text)

                except Exception as e:
                    # TODO: change to logging
                    print(f"❌ Validation failed: {e}")
                    continue

                # -------
                # Caching
                # -------
                try:
                    key: str = wiki_extraction.title
                    self.articles[key] = wiki_extraction

                except Exception as e:
                    # TODO: change to logging
                    print(f"❌ Caching failed: {e}")

                # TODO: change to logging
                print(f"✅ Article processed successfully using {self.model}.")
                return wiki_extraction

            except Exception as e:
                # Extraction Error
                # ----------------
                print(f"❌ Attempt {attempt + 1} failed: {e}")

                # Wait before retry (Exponential Backoff)
                # ---------------------------------------
                time.sleep(2 ** attempt)

                if attempt == self.max_retries - 1:
                    # TODO: change to logging
                    print("🔄 Using fallback data after all retries failed")
                    return ExtractedArticle(
                        title="Untitled",
                        success=False,
                        summary="",
                        content="",
                        related_concepts="",
                        error_messages=[f"All extraction attempts failed: {e}"]
                    )