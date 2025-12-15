import os
import json
import time
from openai import OpenAI
from rate_limiter import RateLimiter
from typing import Dict, Literal, Any, List
from schema import WikipediaExtraction, Analysis

class Agent:
    """
    An Agent for extracting structured data from Wikipedia articles.

    Parameters:
    - model: The LLM model name (default = "gpt-4o-mini". Only gpt-4o and gpt-4o-mini support structured outputs.)

    Members:
    - client: OpenAI client (initialized if API key is found).
    - model: The chosen LLM model.
    - max_retries: Maximum number of retries for API calls.
    - rate_limiter: Rate limiter for API calls.
    - articles: Stores processed WikipediaExtraction objects.

    Methods:
    - create_secure_openai_client: Initialize an OpenAI client using configured API key.
    - extract_structured_data: Use OpenAI structured output to extract data.
    - batch_extract: Process multiple articles.
    - basic_wiki_extraction: Create mock data for demonstration when API is not available.
    - structured_analysis: Use OpenAI structured output to extract data.
    """
    def __init__(self, model: Literal["gpt-4o", "gpt-4o-mini"] = "gpt-4o-mini", max_retries: int = 3):
        self.client: OpenAI | None = None # LLM Agent
        self.model: str = model # LLM Model, default is gpt-4o-mini
        self.max_retries: int = max_retries # Maximum number of retries
        self.rate_limiter: RateLimiter = RateLimiter(requests_per_minute=60) # Rate limiter
        self.articles: Dict[str, WikipediaExtraction] = {} # Store scraped Wikipedia articles

        self.create_secure_openai_client() # Initialize an OpenAI client

    # Initialize an OpenAI client
    # ----------------------------
    def create_secure_openai_client(self):
        """
        Create and intialize an OpenAI client using configured API key.

        Steps:
        1. Looks for OPENAI_API_KEY in environment variables
        2. Tests the connection with a simple API call
        3. Returns the client or None if setup fails
        """

        api_key: str = os.getenv("OPENAI_API_KEY")

        if not api_key:
            print("❌ No OPENAI_API_KEY found in environment variables.")
            print("💡 Set it with:")
            print("   • Linux/Mac: export OPENAI_API_KEY=your_key")
            print("   • Windows:  setx OPENAI_API_KEY your_key")
            return

        try:
            self.client = OpenAI(api_key=api_key)
            # Test connection with a simple API call
            self.client.models.list()
            print("✅ OpenAI client created and tested successfully.")

        except Exception as e:
            print(f"❌ Failed to create OpenAI client: {e}")
            print("🔍 Check your API key and internet connection.")

    # Extraction
    # -------------------------

    # Format the analysis into a structured form
    # -------------------------------------------
    def extract_structured_data(self, content: str) -> WikipediaExtraction:
        """
        Use OpenAI structured outputs to extract structured data from raw Wikipedia text, retrying multiple times if needed,
        and automatically store the result.

        If no OpenAI client is available, fall back to naive extraction.

        Parameters:
        - content (str): The raw JSON output generated after the data cleaning process in the WikipediaScraper class.

        Returns:
        - wiki_extraction (WikipediaExtraction): A structured WikipediaExtraction object.
        """

        # If no OpenAI client is available, falls back to naive extraction
        if not self.client:
            print("No OpenAI client detected. The raw data will be processed using a basic (naive) method.")
            return self.basic_wiki_extraction(content)

        if not isinstance(content, str):
            raise TypeError(f"The content must be in string type, got {type(content)}")

        # Schema for OpenAI structured extraction
        schema: dict[str, Any] = WikipediaExtraction.model_json_schema()
        schema["additionalProperties"] = False

        response_format_schema = {
            "name": "wiki_extraction",
            "schema": schema,
            "strict": True  # This enforces strict schema compliance
        }

        for attempt in range(self.max_retries):
            try:
                # Request OpenAI model with structured JSON schema
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "system",
                            "content": "Carefully review the entire article provided below. Extract all relevant details and structure them strictly according to the given schema."
                        },
                        {
                            "role": "user",
                            "content": f"Analyze the following article: {content}. If certain fields in the schema are not explicitly mentioned, use reasonable inference to fill in the gaps. Then, extract and organize the information in alignment with the schema, ensuring accuracy, completeness, and logical consistency."
                        }
                    ],
                    response_format={
                        "type": "json_schema",
                        "json_schema": response_format_schema
                    }
                )

                # Validate the data against the schema (parsing errors are not expected)
                # -----------------------------------------------------------------------------
                try:
                    wiki_extraction: WikipediaExtraction = WikipediaExtraction.model_validate_json(response.choices[0].message.content)

                except Exception as e:
                    print(f"❌ Validation failed: {e}")
                    return self.basic_wiki_extraction(content)

                # Caching
                # -----------
                try:
                    key: int = hash(content[:100])
                    self.articles[key] = wiki_extraction

                except Exception as e:
                    print(f"❌ Caching failed: {e}")
                    return self.basic_wiki_extraction(content)

                print(f"✅ Article processed successfully using {self.model}.")
                return wiki_extraction

            except Exception as e:
                # Error during extraction
                print(f"❌ Attempt {attempt + 1} failed: {e}")

                # Wait before retry (exponential backoff)
                time.sleep(2 ** attempt)

                if attempt == self.max_retries - 1:
                    print("🔄 Using fallback data after all retries failed")
                    return self.basic_wiki_extraction(content)

    # Batch process multiple articles
    # --------------------------------------------------------
    def batch_extract(self, articles: List[str], batch_size: int = 3) -> List[WikipediaExtraction]:
        """
        Process multiple articles in batches for efficiency.

        Parameters:
        - articles (List[str]): The raw JSON output generated after the data cleaning process in the WikipediaScraper class.
        - batch_size (int): The number of articles to process in each batch.

        Returns:
        - results (List[WikipediaExtraction]): A structured WikipediaExtraction object.
        """
        results: List[WikipediaExtraction] = []

        #
        for i in range(0, len(articles), batch_size):
            batch: List[str] = articles[i:i + batch_size]
            batch_results: List[WikipediaExtraction] = []
            for index, content in enumerate(batch):
                key: int = hash(content[:100])  # Simple cache key
                if key in self.articles:        # Check cache database first
                    batch_results.append(self.articles[key])
                    continue

                # Rate limiting
                # ------------------
                self.rate_limiter.wait_if_needed()

                # Process content
                # -------------------
                print(f"🔍 Processing article {index + 1} in batch {(i // 3) + 1}")
                try:
                    result = self.extract_structured_data(content)
                    if result:
                        self.articles[key] = result  # Store the article within agent
                        batch_results.append(result)

                    else:
                        batch_results.append(None)

                # Error Handling
                # ---------------------
                except Exception as e:
                    print(f"❌ Error processing article {index + 1} in batch {(i // 3) + 1}: {e}")
                    batch_results.append(None)

            results.extend(batch_results)

            # Brief pause between batches
            time.sleep(1)

        return results

    # Perform basic extraction without OpenAI client
    # -----------------------------------------------
    def basic_wiki_extraction(self, content: str) -> WikipediaExtraction:
        """
        Perform basic extraction when OpenAI client is unavailable or due to any other issues.

        Parameters:
        - content (str): The raw JSON output generated after the data cleaning process in the WikipediaScraper class.

        Returns:
        - wiki_extraction (WikipediaExtraction): A structured WikipediaExtraction object.
        """

        if not isinstance(content, str):
            raise TypeError(f"The content must be in string type, got {type(content)}")

        # Convert the JSON string into a Python dictionary
        try:
            article: dict = json.loads(content)

        except json.JSONDecodeError as e:
            print(f"❌ Error decoding JSON: {e}")
            return None

        # Summary extraction
        # ---------------------------
        body = article.get("content", {}).get("body", {})

        summarize_text: str = body.get("Article", "")
        summarize_text += body.get("Description", "")

        # Append any additional overview-like sections
        for key, value in body.items():
            if "overview" in key.lower():
                summarize_text += value

        # Advantages extraction
        # ---------------------------
        advantages: str = ""
        for word in ["Advantages", "Benefits", "Efficiencies"]:
            if word in body:
                advantages += body[word]

        # If no text detected
        if len(advantages) == 0:
            advantages = "Not specified."

        # Disadvantages extraction
        # ---------------------------
        disadvantages: str = ""
        for word in ["Disadvantages", "Limitations"]:
            if word in body:
                disadvantages += body[word]

        # If no text detected
        if len(disadvantages) == 0:
            disadvantages = "Not specified."

        # Related concepts extraction
        # ---------------------------
        related_concepts: str = ""
        for word in ["See also", "Further reading"]:
            if word in body:
                related_concepts += body[word]

        # If no text detected
        if len(related_concepts) == 0:
            related_concepts = "Not specified."

        # History extraction
        # ---------------------------
        history: str = body.get("History", "")
        history += body.get("Development", "")

        # If no text detected
        if len(history) == 0:
            history = "Not specified."

        # References extraction
        # ---------------------------
        references: List[str] = body.get("References", [])

        wiki_extraction = WikipediaExtraction(
            title=article.get("title", "Untitled"),
            summary=summarize_text.strip(),
            advantages=advantages.strip(),
            disadvantages=disadvantages.strip(),
            related_concepts=related_concepts.strip(),
            history=history.strip(),
            references=references
        )

        key: int = hash(content[:100])
        self.articles[key] = wiki_extraction

        print("✅ Article processed successfully using Basic Wiki Extraction.")


        return wiki_extraction

    # Format the analysis into a structured form
    # --------------------------------------------
    def structured_analysis(self, function_output: Dict[str, Any]) -> Analysis:
        """
        Use OpenAI structured outputs to extract data from the function’s result, retrying multiple times if needed.
        If no OpenAI client is available, fall back to naive extraction.
        Parameters:
        - agent_response (str): The raw JSON output generated after the data cleaning process in the WikipediaScraper class.

        Returns:
        - wiki_extraction (WikipediaExtraction): A structured WikipediaExtraction object.
        """
        if not isinstance(function_output, dict):
            raise TypeError(f"The content must be in dictionary type, got {type(function_output)}")


        func_output: str = json.dumps(function_output)


        # If no OpenAI client is available, falls back to naive extraction
        if not self.client:
            return Analysis(
                techs=function_output["techs"],
                result=json.dumps(function_output["result"]),
                key_points=json.dumps(function_output["result"]),
            )

        # Schema for OpenAI structured extraction
        schema: dict[str, Any] = Analysis.model_json_schema()
        schema["additionalProperties"] = False

        analysis_schema = {
            "name": "structured_analysis",
            "schema": schema,
            "strict": True
        }

        # Multiple attempts
        for attempt in range(self.max_retries):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {
                            "role": "system",
                            "content": "Convert the function output into the standardized Analysis schema."
                        },
                        {
                            "role": "user",
                            "content": f"Carefully analyze the data: {func_output}. Convert the function output into the standardized Analysis schema."
                        }

                    ],
                    response_format={
                        "type": "json_schema",
                        "json_schema": analysis_schema
                    }
                )


                # Validate the data against the schema (parsing errors are not expected)
                # -----------------------------------------------------------------------------
                try:
                    analysis_extraction: Analysis = Analysis.model_validate_json(response.choices[0].message.content)
                    return analysis_extraction

                except Exception as e:
                    print(f"❌ Validation failed: {e}")
                    return Analysis(
                        techs=function_output["techs"],
                        result=json.dumps(function_output["result"]),
                        key_points=json.dumps(function_output["result"]),
                    )

            except Exception as e:
                # Error during extraction
                print(f"❌ Exraction {attempt + 1} fatiled: {e}")

                # Wait before retry (exponential backoff)
                time.sleep(2 ** attempt)

                if attempt == self.max_retries - 1:
                    return Analysis(
                        techs=function_output["techs"],
                        result=json.dumps(function_output["result"]),
                        key_points=json.dumps(function_output["result"]),
                    )
