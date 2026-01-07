# ----
# TODO
# ----
"""
This Agent intentionally encapsulates provider-specific logic (Gemini schemas,
prompts, retries, and parsing) to avoid premature abstraction while workflows
and models are still evolving.

Consider refactoring when one or more of the following become true:
- Multiple LLM providers (e.g. OpenAI + Gemini) are used in production
- Similar extraction / QA logic is duplicated across agents
- Retry, backoff, or error-handling policies need to be shared or customized
- Prompt or schema logic stabilizes and changes less frequently

Possible refactor directions:
- Extract provider-specific generation into a thin adapter (e.g. GeminiAdapter)
- Move retry/backoff policy into a reusable utility or decorator
- Separate orchestration (Agent) from execution (Extractor / QAGenerator)

Until then, keeping logic consolidated here favors iteration speed and clarity.
"""

import json
import time
import asyncio
from google import genai
from typing import Dict, Literal, Any
from backend.schemas.note import Note
from backend.domain.scraper import Scraper
from backend.schemas.scraper import ExtractedArticle
from backend.core.ai_client import create_gemini_client
from backend.core.requrest_throttler import RequestThrottler

# ---------
# LLM Agent
# ---------
class NoteAgent:
    """
    An AI Agent for processing, extracting, and analyzing structured knowledge from web content and notes.

    Features:
    - Read and understand structured notes
    - Scrape notes from websites (URL input)
    - Generate concise summaries from raw content
    - Merge multiple notes into a single structured format
    - Generate question & answer pairs for learning or review
    - Check and correct answers based on structured knowledge

    Parameters:
    - model (str, optional): The LLM model name (default = "gemini-2.5-flash").

    Members:
    - client: Optional pre-created AI client (Gemini / OpenAI)
    - model: The chosen LLM model
    - max_retries: Maximum number of retries for API calls
    - rate_limiter: Rate limiter for API calls

    Methods:
    - parse_note: Read and parse a structured note from json file
    - scrape_note: Extracts structured data from raw text or JSON notes
    - generate_qa: Generate question & answer pairs from a structured note
    """
    def __init__(self, client: genai.Client = None, model: Literal["gemini-2.5-flash"] = "gemini-2.5-flash", max_retries: int = 3):
        self.client: genai.Client | None = client or create_gemini_client()            # LLM Agent
        self.model: str = model                                                        # LLM Model, default is gemini-2.5-flash
        self.max_retries: int = max_retries                                            # Maximum number of retries

    # ----------
    # Parse Note
    # ----------

    def parse_note(self, note_content: str) -> Note:
        """
        Read and understand a structured note.

        Parameters:
        - note_content (str): The raw content of the note.

        Returns:
        - note (Note): The structured representation of the note.
        """

        # If No Client
        # ------------
        if not self.client:
            try:
                # Try Naive JSON Parsing as a Fallback
                # -----------------------------------
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

            except Exception as e:
                # TODO: change to logging
                print("🔄 Using fallback data after all retries failed")
                extracted_note = Note(
                    title="Untitled",
                    success=False,
                    summary="",
                    content="",
                    related_concepts=[],
                    questions=[],
                    answers=[],
                    error_messages=[f"All extraction attempts failed: {e}"]
                )
            
            return extracted_note

        # Schema for Gemini AI Structured Extraction
        # ------------------------------------------
        schema: dict[str, Any] = Note.model_json_schema()
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
            "Extract the key information from the following note content and format it according to the specified schema. "
            "Do not use headers, bold text or nested Markdown elements. "
            "Ensure accuracy and completeness in your extraction.\n\n"
            f"Note Content:\n{note_content}\n\n"
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
                    extracted_note: Note = Note.model_validate_json(response.text)

                except Exception as e:
                    # TODO: change to logging
                    print(f"❌ Validation failed: {e}")
                    continue

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
                    try:
                        # Try Naive JSON Parsing as a Fallback
                        # -----------------------------------
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

                    except Exception as e:
                        # TODO: change to logging
                        print("🔄 Using fallback data after all retries failed")
                        extracted_note = Note(
                            title="Untitled",
                            success=False,
                            summary="",
                            content="",
                            related_concepts=[],
                            questions=[],
                            answers=[],
                            error_messages=[f"All extraction attempts failed: {e}"]
                        )

        return extracted_note
                
    # --------------------
    # Generate Online Note
    # --------------------
    def generate_note(self, content: str) -> Note:
        """
        Use LLM structured outputs to extract data from input text,
        automatically retrying on failure and storing the final structured result.

        If no AI client is available, print out errors.

        Parameters:
        - content (str): The raw text content to extract the note from.

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
        # -------------------------------------------------
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