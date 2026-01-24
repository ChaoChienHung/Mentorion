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
from google import genai
from schemas.note import Note
from typing import Literal, Any
from schemas.question import ShortAnswer as QA
from core.ai_client import create_gemini_client

# ----------
# Note Agent
# ----------
class NoteAgent:
    """
    A Note Agent for processing, extracting, and analyzing structured knowledge from web content and notes.

    Features:
    - Parse and understand structured notes
    - Merge multiple notes into a single structured format
    - Generate question & answer pairs for learning or review

    Parameters:
    - client: Optional pre-created AI client (Gemini / OpenAI)
    - model (str, optional): The LLM model name (default = "gemini-2.5-flash")
    - max_retries (int, optional): Maximum number of retries for API calls (default = 3)

    Members:
    - client: Optional pre-created AI client (Gemini / OpenAI)
    - model: The chosen LLM model
    - max_retries: Maximum number of retries for API calls

    Methods:
    - parse_note: Read and parse a structured note from json file
    - generate_note: Generate structured data from input text content
    - generate_qa: Generate question & answer pairs from a structured note
    """
    def __init__(self, client: genai.Client = None, model: Literal["gemini-2.5-flash"] = "gemini-2.5-flash", max_retries: int = 3):
        self.client: genai.Client | None = client or create_gemini_client()            # LLM Agent
        self.model: str = model                                                        # LLM Model, default is gemini-2.5-flash
        self.max_retries: int = max_retries                                            # Maximum number of retries

        self.qa_schema = {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "answer": {"type": "string"}
                },
                "required": ["question", "answer"]
            }
        }

    # ----------
    # Parse Note
    # ----------

    def parse_note(self, note_content: str) -> Note:
        """
        Read and parse a structured json note.
        If the note is not in valid json format, return error messages.

        Parameters:
        - note_content (str): The raw content of the note.

        Returns:
        - note (Note): The structured representation of the note.
        """

        # Try Naive JSON Parsing
        # ----------------------
        try:
            note: dict = json.loads(note_content)
            qa_list = note.get("qa", [])
            qa_list = [QA(**item) for item in qa_list if "question" in item and "answer" in item]

            extracted_note = Note(
                title=note.get("title", "Untitled"),
                success=True,
                summary=note.get("summary", ""),
                content=note.get("content", ""),
                related_concepts=note.get("related_concepts", []),
                qa=qa_list,
                error_messages=[]
            )

        except Exception as e:
            # TODO: change to logging
            print(f"🔄 Naive JSON Parsing failed due to {e}.")
            extracted_note = Note(
                title="Untitled",
                success=False,
                summary="",
                content=note_content,
                related_concepts=[],
                qa=[],
                error_messages=[f"🔄 Naive JSON Parsing failed due to {e}."]
            )
        return extracted_note
                
    # -------------
    # Generate Note
    # -------------
    def generate_note(self, content: str) -> Note:
        """
        Use LLM client to generate a structured note from input text,
        automatically retrying on failure and storing the final structured result.

        If no LLM client is available, print out errors.

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
                qa=[],
                error_messages=["No client detected. Please check your client and API configuration is correct."]
            )
        
        # Schema for Gemini AI Structured Extraction
        # ------------------------------------------
        schema: dict[str, Any] = Note.model_json_schema()
        schema["properties"]["qa"] = self.qa_schema
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
                    # TODO: change to logging
                    print(f"🔄 All extraction attempts failed: {e}")
                    return Note(
                        title="Untitled",
                        success=False,
                        summary="",
                        content="",
                        related_concepts=[],
                        qa=[],
                        error_messages=[f"All extraction attempts failed: {e}"]
                    )
                
    # ------------------------------
    # Generate Questions and Answers
    # ------------------------------
    # TODO: Change this part to add more question and answer pairs
    def generate_qa(self, note: Note) -> Note:
        """
        Generate question & answer pairs from a structured note.

        Parameters:
        - note (Note): The structured Note object to generate Q&A from.

        Returns:
        - note_with_qa (Note): The structured Note object with generated Q&A pairs.
        """

        # -------------------------------------------------
        # Error Handling for Missing Client or Invalid Note
        # -------------------------------------------------
        if not self.client:
            print("No client detected. Please check your client and API configuration.")
            note.success = False
            note.error_messages.append(
                "No client detected. Please check your client and API configuration."
            )
            return note

        if not isinstance(note, Note):
            print("Invalid note format. Expected a Note object.")
            return Note(
                title="Untitled",
                success=False,
                summary="",
                content="",
                related_concepts=[],
                qa=[],
                error_messages=["Invalid note format. Expected a Note object."]
            )

        if not note.content:
            print("Note content is empty. Cannot generate Q&A.")
            note.success = False
            note.error_messages.append("Note content is empty. Cannot generate Q&A.")
            return note

        # -------------------------
        # Prompt for Q&A Generation
        # -------------------------
        prompt = (
            "Based on the following note content, generate a list of insightful questions "
            "and their corresponding answers. Ensure that the questions cover key concepts "
            "and details from the note.\n\n"
            f"Note Content:\n{note.content}\n\n"
            "Provide the questions and answers in JSON format as a list of objects under 'qa', "
            "with each object containing 'question' and 'answer' fields."
        )

        # -----------------------------
        # JSON Schema for Structured Q&A
        # -----------------------------
        schema = {
            "type": "object",
            "properties": {
                "qa": self.qa_schema
            },
            "required": ["qa"],
            "optionalProperties": False
        }

        config = {
            "response_mime_type": "application/json",
            "response_json_schema": schema,
        }

        # -------------------------
        # Generate Q&A with Retries
        # -------------------------
        for attempt in range(self.max_retries):
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=config
                )

                # Parse Response
                # --------------
                qa_data = json.loads(response.text)

                # Convert List of Dicts to List[QA]
                # ---------------------------------
                note.qa = [QA(**item) for item in qa_data.get("qa", [])]

                note.success = True
                print(f"✅ Q&A generation completed successfully using {self.model}.")
                return note

            except Exception as e:
                print(f"❌ Attempt {attempt + 1} failed: {e}")
                time.sleep(2 ** attempt)
                if attempt == self.max_retries - 1:
                    print(f"❌ Q&A generation failed: {e}")
                    note.error_messages.append(f"Q&A generation failed: {e}")
                    note.success = False
                    return note
