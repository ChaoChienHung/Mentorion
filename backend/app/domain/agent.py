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
from typing import Any, Literal, Optional
from ..schemas.note import Note
from ..schemas.question import ShortAnswer as QA, QuizQuestion
from ..core.ai_client import create_gemini_client
from ..core.logger import msg_logger, error_logger

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
    - parse_note: Read and parse a structured note from json file or markdown file
    - generate_note: Generate structured data from input text content
    - generate_qa: Generate question & answer pairs from a structured note
    """
    def __init__(self, client: genai.Client = None, model: Literal["gemini-2.5-flash"] = "gemini-2.5-flash", max_retries: int = 3):
        self.client: Optional[genai.Client] = client or create_gemini_client()
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

        self.quiz_question_schema = {
            "type": "object",
            "properties": {
                "question": {"type": "string"},
                "a": {"type": "string"},
                "responsea": {"type": "string"},
                "b": {"type": "string"},
                "responseb": {"type": "string"},
                "c": {"type": "string"},
                "responsec": {"type": "string"},
                "d": {"type": "string"},
                "responsed": {"type": "string"},
                "answer": {"type": "string", "enum": ["a", "b", "c", "d", "A", "B", "C", "D"]},
                "explanation": {"type": "string"}
            },
            "required": ["question", "a", "b", "answer"]
        }

        self.quizzes_schema = {
            "type": "array",
            "items": self.quiz_question_schema
        }

    # ----------
    # Parse Note
    # ----------

    def parse_note(self, note_content: str) -> Note:
        """
        Read and parse a structured json note or a markdown note.
        If the note is not in valid format, return error messages.

        Parameters:
        - note_content (str): The raw content of the note.

        Returns:
        - note (Note): The structured representation of the note.
        """
        stripped_content = (note_content or "").strip()
        
        # Check if content is Markdown (SSOT style starting with <meta>)
        if stripped_content.startswith("<meta>"):
            from .parser import parse_markdown_to_note
            try:
                return parse_markdown_to_note(note_content)
            except Exception as e:
                error_logger.warning("Markdown parsing failed: %s", e)
                
        # Try Naive JSON Parsing
        # ----------------------
        try:
            note: dict = json.loads(note_content)
            qa_list = note.get("qa", [])
            qa_list = [QA(**item) for item in qa_list if "question" in item and "answer" in item]
            
            quizzes_raw = note.get("quizzes", [])
            quizzes_list = []
            for item in quizzes_raw:
                if "question" in item and "a" in item and "b" in item and "answer" in item:
                    quizzes_list.append(QuizQuestion(**item))

            extracted_note = Note(
                title=note.get("title", "Untitled"),
                success=True,
                summary=note.get("summary", ""),
                content=note.get("content", ""),
                related_concepts=note.get("related_concepts", []),
                qa=qa_list,
                quizzes=quizzes_list,
                qprompt=note.get("qprompt"),
                raw_markdown=note.get("raw_markdown") or note_content,
                error_messages=[]
            )

            # If it's a valid JSON but doesn't have raw_markdown, format it
            if not extracted_note.raw_markdown:
                from .parser import format_note_to_markdown
                extracted_note.raw_markdown = format_note_to_markdown(extracted_note)

        except Exception as e:
            error_logger.warning("Naive JSON parsing failed: %s", e)
            extracted_note = Note(
                title="Untitled",
                success=False,
                summary="",
                content=note_content,
                related_concepts=[],
                qa=[],
                quizzes=[],
                qprompt=None,
                raw_markdown=note_content,
                error_messages=[f"Naive JSON parsing failed: {e}."]
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

        if not self.client:
            error_logger.error(
                "No client detected. Please check your client and API configuration is correct."
            )
            return Note(
                title="Untitled",
                success=False,
                summary="",
                content="",
                related_concepts=[],
                qa=[],
                quizzes=[],
                qprompt=None,
                raw_markdown="",
                error_messages=["No client detected. Please check your client and API configuration is correct."]
            )
        
        # Schema for Gemini AI Structured Extraction
        # ------------------------------------------
        schema: dict[str, Any] = Note.model_json_schema()
        schema["properties"]["qa"] = self.qa_schema
        schema["properties"]["quizzes"] = self.quizzes_schema
        # Remove fields computed locally
        schema["properties"].pop("qprompt", None)
        schema["properties"].pop("raw_markdown", None)
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
            "You are an expert mentor.\n"
            "Extract the key information from the following article content and format it according to the specified schema.\n"
            "Specifically, you must generate both short-answer Q&A pairs (under 'qa') and multiple-choice quiz questions with feedback options (under 'quizzes'). "
            "For the multiple-choice questions, ensure each option has a corresponding response feedback (e.g. responsea, responseb) indicating why that choice is correct or incorrect, along with a detailed explanation.\n"
            "Do not use headers, bold text or nested Markdown elements in the content field. "
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
                    error_logger.error("Validation failed: %s", e)
                    continue

                # Locally compute qprompt and raw_markdown
                from .parser import _build_shared_qaprompt, format_note_to_markdown
                extracted_note.qprompt = _build_shared_qaprompt()
                extracted_note.raw_markdown = format_note_to_markdown(extracted_note)

                msg_logger.info("Article processed successfully using %s.", self.model)
                return extracted_note

            except Exception as e:
                error_logger.error("Attempt %s failed: %s", attempt + 1, e)

                # Wait before retry (Exponential Backoff)
                # ---------------------------------------
                time.sleep(2 ** attempt)

                if attempt == self.max_retries - 1:
                    error_logger.error("All extraction attempts failed: %s", e)
                    return Note(
                        title="Untitled",
                        success=False,
                        summary="",
                        content="",
                        related_concepts=[],
                        qa=[],
                        quizzes=[],
                        qprompt=None,
                        raw_markdown="",
                        error_messages=[f"All extraction attempts failed: {e}"]
                    )
                
    # ------------------------------
    # Generate Questions and Answers
    # ------------------------------
    def generate_qa(self, note: Note) -> Note:
        """
        Generate question & answer pairs and MCQs from a structured note.

        Parameters:
        - note (Note): The structured Note object to generate questions from.

        Returns:
        - note_with_questions (Note): The structured Note object with generated questions.
        """

        # -------------------------------------------------
        # Error Handling for Missing Client or Invalid Note
        # -------------------------------------------------
        if not self.client:
            error_logger.error("No client detected. Please check your client and API configuration.")
            note.success = False
            note.error_messages.append(
                "No client detected. Please check your client and API configuration."
            )
            return note

        if not isinstance(note, Note):
            error_logger.error("Invalid note format. Expected a Note object.")
            return Note(
                title="Untitled",
                success=False,
                summary="",
                content="",
                related_concepts=[],
                qa=[],
                quizzes=[],
                qprompt=None,
                raw_markdown="",
                error_messages=["Invalid note format. Expected a Note object."]
            )

        if not note.content:
            error_logger.error("Note content is empty. Cannot generate questions.")
            note.success = False
            note.error_messages.append("Note content is empty. Cannot generate questions.")
            return note

        # -------------------------
        # Prompt for Questions Generation
        # -------------------------
        prompt = (
            "Based on the following note content, generate a list of insightful questions and answers. "
            "Generate both short-answer Q&A pairs (under 'qa') and multiple-choice quiz questions with feedback (under 'quizzes'). "
            "Ensure that the questions cover key concepts and details from the note.\n\n"
            f"Note Content:\n{note.content}\n\n"
            "Provide the questions and answers in JSON format as per the schema."
        )

        # -----------------------------
        # JSON Schema for Structured Questions
        # -----------------------------
        schema = {
            "type": "object",
            "properties": {
                "qa": self.qa_schema,
                "quizzes": self.quizzes_schema
            },
            "required": ["qa", "quizzes"],
            "optionalProperties": False
        }

        config = {
            "response_mime_type": "application/json",
            "response_json_schema": schema,
        }

        # -------------------------
        # Generate Questions with Retries
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

                # Convert List of Dicts
                note.qa = [QA(**item) for item in qa_data.get("qa", [])]
                
                quizzes_raw = qa_data.get("quizzes", [])
                note.quizzes = []
                for item in quizzes_raw:
                    if "question" in item and "a" in item and "b" in item and "answer" in item:
                        note.quizzes.append(QuizQuestion(**item))

                # Update raw_markdown locally
                from .parser import format_note_to_markdown
                note.raw_markdown = format_note_to_markdown(note)

                note.success = True
                msg_logger.info("Questions generation completed successfully using %s.", self.model)
                return note

            except Exception as e:
                error_logger.error("Attempt %s failed: %s", attempt + 1, e)
                time.sleep(2 ** attempt)
                if attempt == self.max_retries - 1:
                    error_logger.error("Questions generation failed: %s", e)
                    note.error_messages.append(f"Questions generation failed: {e}")
                    note.success = False
                    return note

