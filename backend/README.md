# Backend

## Folder Structure

```bash
backend/                          # Backend layer (AI & application logic)
    │
    ├─ api/
    │  └─ v1/
    │     ├─ __init__.py
    │     ├─ dependencies.py      # Dependencies for routes
    │     └─ routes.py            # API Routes
    │
    ├─ core/
    │  ├─ __init__.py
    │  ├─ ai_client.py            # Create and intialize a client using configured API key
    │  ├─ config.py               # Configuration setup
    │  ├─ logger.py               # Logger setup
    │  ├─ rate_limiter.py         # Rate limiter
    │  └─ request_throttler.py    # Request throttler
    │
    ├─ domain/                    
    │  ├─ __init__.py
    │  ├─ agent.py                # Note agent (basic functionalities)
    │  └─ scraper.py              # Scraper
    │
    ├─ logs/                      # Logger files
    │  ├─ ErrorLogger.log         # Logger for WARNING, ERROR messages
    │  └─ MessageLogger.log       # Logger for DEBUG, INFO messages
    │
    ├─ schemas/
    │  ├─ note.py                 # Note schema
    │  └─ question.log            # Questions schema
    │
    ├─ services/
    │  ├─ __init__.py
    │  └─ note_service.py         # Note services
    │
    ├─ __init__.py                
    ├─ DevNotes.md                # Backend development notes
    ├─ README.md                  # Backend Readme
    └─ main.py                    # FastAPI entry
    
```

---

# Backend Layer (Application & AI Logic)

## Key Components
- AI Agent Capabilities:
  - Merge multiple notes
  - Scrape notes from websites (URL input)
  - Generate summary
  - Generate testing questions & answers

## Core APIs

- /notes/parse
- /notes/scrape

## Note Ingestion Pipeline

**Supported Inputs**
- Manual text entry
- File upload
- Website scraping (Wikipedia & generic pages)
- Note merging

**Processing Flow**
```
           Input (Typically JSON)
                     │
                     ▼
                  Parser
             ┌─────────────┐
             │             │
          Success         Fail
             │             │
             ▼             ▼
      Structured Note   LLM Agent
                             │
                             ▼
                     Structured Note
```

## Note Storage & Data Model

**1️⃣ Stateless Notes Storage**
- **Concept**: Notes are stored as independent JSON objects, allowing the Agent to access and update them as needed without retaining them in memory permanently.
- **Workflow**:
  1. Save notes to a JSON file.
  2. The note should be organized using the following structure:
     1. Title
     2. Summary
     3. Content
     4. Related Concept
     5. Questions and Answers
  
**2️⃣ Automatic Web Scraping and Note Processing**
- **Purpose**: Use `Scraper` to extract knowledge from a website and automatically integrate the content into notes.
- **Workflow**:
  1. Provide a URL or website source.
  2. `Scraper` scrapes and cleans the content.
  3. `NoteAgent` Converts scraped content into note format.
  4. (TODO) Appends or merges the new content into existing notes, maintaining a continuous knowledge base.

**3️⃣ Note Reviewer**
- **Purpose**: Purpose: Present stateless notes in a webpage or UI, allowing users to review and edit them.
- **Workflow**:
  1. Reads note content from an uploaded file or a scraped source.
  2. Parses the content for summarization, Q&A generation.
  3. `NoteAgent` parses the note when needed.
  4. Write updates back to the note (e.g., edit existing content or append new Q&A).

**(TODO) 4️⃣ Merging Notes**
- **Purpose**: Combine multiple independent notes into a single, structured note.
- **Workflow**:
  1. Read multiple note files or sections.
  2. Merge content intelligently:
     - Combine summaries
     - Consolidate references
     - Remove duplicate information
  3. Store the unified note back into storage.

**Note Schema (JSON)**
```
{
  "title": "Stateless Notes Storage",
  "summary": "Notes are stored in JSON and not kept in memory by the Agent.",
  "content": "This concept emphasizes ...",
  "related_concept": "Persistent Storage",
  "qa": [
    {
      "question": "What is stateless note storage?",
      "answer": "Notes are stored independently in JSON and not kept in memory."
    },
    {
      "question": "Why use stateless storage?",
      "answer": "It ensures persistence and reduces memory usage by the Agent."
    }
  ]
}
```

**Database Options**
- PostgreSQL (JSONB columns)
- MongoDB (document-based)
- Hybrid: SQL + vector DB (for semantic search)

## Agent & AI Orchestration Layer

**Agent Class (Core Brain)**

**Responsibilities**
- Manage AI workflows
- Maintain note context
- Decide which AI function to call

**Submodules**
- Structured extraction (Pydantic schemas)
- Function calling layer
- Tool routing logic

## AI Function Calling & Tools

**Supported AI Actions**
- Summarization
- Question generation
- Answer generation
- Answer checking
- Concept comparison
- Evolution tracing

**Execution Paths**
```
Function Calling Layer
   ├── External AI APIs (Gemini / OpenAI)
   └── Mock / Local Mode (for testing)
```

Results are written back into the original note in the ai_outputs section.