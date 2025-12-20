import os
import json
import time
from google import genai
from backend.src.scraper import Scraper
from backend.src.schema import ExtractedArticle, Note
from backend.src.rate_limiter import RateLimiter
from typing import Dict, Literal, Any

# ---------
# LLM Agent
# ---------
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
            self.client = genai.Client(api_key=api_key)
            self.client.models.generate_content(model=self.model, contents="Test my API key with a simple prompt.")
            print("✅ Gemini client created and tested successfully.")

        except Exception as e:
            print(f"❌ Failed to create Gemini client: {e}")
            print("🔍 Check your API key and internet connection.")

    # ---------
    # Read Note
    # ---------

    def read_note(self, note_content: str) -> Note:
        """
        Read and understand a structured note.

        Parameters:
        - note_content (str): The raw content of the note.

        Returns:
        - note (Note): The structured representation of the note.
        """
        note: Dict[str, str] = json.loads(note_content)
        extracted_note = Note(
            title=note.get("title", "Untitled"),
            success=True,
            summary=note.get("summary", ""),
            content=note.get("content", ""),
            related_concepts=note.get("related_concepts", []),
            questions=note.get("questions", []),
            answers=note.get("answers", []),
            error_messages=[]
        )
        self.articles[extracted_note.title] = extracted_note
        return extracted_note
                
    # ------------------
    # Scrape Online Note
    # ------------------
    async def scrape_note(self, url: str) -> Note:
        """
        Use Scraper to scrape from target URL and use LLM structured outputs to extract structured data from raw scraped text, retrying multiple times if needed,
        and automatically store the result.

        If no AI client is available, print out errors.

        Parameters:
        - url (str): The website URL to scrape.

        Returns:
        - extracted_note (Note): A structured Note object.
        """

        # If no client is available, print out error messages
        # ---------------------------------------------------
        # TODO: change to logging
        if not self.client:
            print("No client detected. Please check your client and API configuration is correct.")
            return Note(
                title="Untitled",
                success=False,
                summary="",
                content="",
                related_concepts=[],
                questions=[],
                answers=[],
                error_messages=["No client detected. Please check your client and API configuration is correct."]
            )
        
        # Scrape the article content
        # --------------------------
        scraper: Scraper = Scraper()
        scrape_result: Dict[str, Any] = await scraper.scrape_article(url)
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
        }

        # Prompt for Gemini AI
        # --------------------
        prompt: str = (
            "You are an expert mentor. "
            "Extract the key information from the following article content and format it according to the specified schema. "
            "Do not use headers, bold text or nested Markdown elements. "
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

                # ----------
                # Conversion
                # ----------

                extracted_note = Note(
                    title=wiki_extraction.title,
                    success=wiki_extraction.success,
                    summary=wiki_extraction.summary,
                    content=wiki_extraction.content,
                    related_concepts=wiki_extraction.related_concepts,
                    questions=[],
                    answers=[],
                    error_messages=wiki_extraction.error_messages
                )

                # -------
                # Caching
                # -------
                try:
                    key: str = extracted_note.title
                    self.articles[key] = extracted_note

                except Exception as e:
                    # TODO: change to logging
                    print(f"❌ Caching failed: {e}")

                # TODO: change to logging
                print(f"✅ Article processed successfully using {self.model}.")
                return extracted_note

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
                    return Note(
                        title="Untitled",
                        success=False,
                        summary="",
                        content="",
                        related_concepts=[],
                        questions=[],
                        answers=[],
                        error_messages=[f"All extraction attempts failed: {e}"]
                    )
                
    # ------------------------------
    # Generate Questions and Answers
    # ------------------------------
    def generate_qa(self, note: Note) -> Note:
        """
        Generate question & answer pairs from a structured note.

        Parameters:
        - note (Note): The structured Note object to generate Q&A from.

        Returns:
        - note_with_qa (Note): The structured Note object with generated Q&A pairs.
        """

        # Error handling for missing client or invalid note
        # -------------------------------------------------

        if not self.client:
            # TODO: change to logging
            print("No client detected. Please check your client and API configuration is correct.")
            note.success = False
            note.error_messages.append("No client detected. Please check your client and API configuration is correct.")
            return note

        if not isinstance(note, Note):
            # TODO: change to logging
            print("Invalid note format. Expected a Note object.")
            return Note(
                title="Untitled",
                success=False,
                summary="",
                content="",
                related_concepts=[],
                questions=[],
                answers=[],
                error_messages=["Invalid note format. Expected a Note object."]
            )

        content: Note = note.content

        if not content:
            # TODO: change to logging
            print("Note content is empty. Cannot generate Q&A.")
            note.success = False
            note.error_messages.append("Note content is empty. Cannot generate Q&A.")
            return note

        # Prompt
        # ------
        prompt: str = (
            "Based on the following note content, generate a list of insightful questions and their corresponding answers. "
            "Ensure that the questions cover key concepts and details from the note.\n\n"
            f"Note Content:\n{note.content}\n\n"
            "Provide the questions and answers in JSON format with 'questions' and 'answers' fields."
        )

        # Structured Response Configuration for Q&A
        # -----------------------------------------
        schema: dict[str, Any] = {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "answers": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["questions", "answers"],
            "optionalProperties": False
        }

        # Configuration
        # -------------
        config = {
            "response_mime_type": "application/json",
            "response_json_schema": schema,
        }

        # Generate Q&A with retries
        # -------------------------
        for attempt in range(self.max_retries):
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=config
                )

                qa_data = json.loads(response.text)
                note.questions = qa_data.get("questions", [])
                note.answers = qa_data.get("answers", [])

                # Caching
                # -------
                self.articles[note.title] = note

                # TODO: change to logging
                print(f"✅ Q&A generation completed successfully using {self.model}.")
                return note            

            except Exception as e:
                # Generation Error
                # ----------------
                print(f"❌ Attempt {attempt + 1} failed: {e}")

                # Wait before retry (Exponential Backoff)
                # ---------------------------------------
                time.sleep(2 ** attempt)

                if attempt == self.max_retries - 1:
                    # TODO: change to logging
                    print(f"❌ Q&A generation failed: {e}")
                    note.error_messages.append(f"Q&A generation failed: {e}")
                    note.success = False
                    return note