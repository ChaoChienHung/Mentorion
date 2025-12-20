# Mentorion

This project is designed to practice LLM (Gemini) integration while building a learning support application. The application includes features such as automatic article parsing, note-taking, question generation, and answer evaluation.

---

## Overall Architecture and Workflow

This system is organized into Frontend, Backend (Application Layer), and Server / Infrastructure Logic to clearly separate responsibilities. This architecture supports a web-based learning assistant with authentication, note management, AI enrichment, and persistent storage.

---

## Folder Structure

```perl
Mentorion/
│
├─ server/             # Server layer (API, authentication, routing)
│   ├─ auth/           # Login, register, JWT/session handling
│   ├─ routes/         # REST/GraphQL endpoints
│   └─ middleware/     # Input validation, rate limiting
│
├─ frontend/           # Front-end code (React, Vue, Angular, etc.)
│   ├─ public/
│   │   └─ index.html    
│   ├─ src/
│   │   ├─ App.js
│   │   └─ index.js    
│   └─ package.json
│
├─ backend/                   # Backend layer (AI & application logic)
│    └─ src/
│       ├─ __init__.py        
│       ├─ agent.py           # Merge, summarize, generate Q&A
│       ├─ rate_limiter.py    # Rate Limiter
│       ├─ schema.py          # Pydantic Schema
│       └─ scraper.py         # Scraper
│
├─ tests/              # Unit and integration tests
├─ requirements.txt    # Python dependencies
├─ TODO.md             # Features to be implemented
└─ README.md           # Project overview
```

---

## Frontend Layer (Web Application)

### Key Components
- Web UI (React / Vue / Next.js / etc.)
- Authentication pages (Login / Register)
- Dashboard (Notes overview)
- Note Editor & Viewer

### Frontend Features
- User authentication (login/logout)
- Create, view, edit, and append notes
- Upload notes (text / markdown / PDF)
- AI Actions (Merge notes, scrape notes, QA generation, etc.)
- Skill Reviewer

```text
User Browser
   ├── Login / Register
   ├── Notes Dashboard
   ├── Note Editor
   ├── AI Actions Panel
   └── Skill Reviewer
```

---

## Server Layer (API & Authentication)

### Responsibilities
- Request routing (REST / GraphQL)
- Authentication & authorization (JWT / session-based)
- Input validation & rate limiting
- Secure access to user-specific data

### Core APIs

- /auth/login  
- /auth/register  

---

## Backend Layer (Application & AI Logic)

### Key Components
- AI Agent Capabilities:
  - Merge multiple notes
  - Scrape notes from websites (URL input)
  - Generate summary
  - Generate questions & answers
  - Check and correct answers
- Skill Reviewer
  - Store questions and their review dates

### Core APIs

- /notes/create  
- /notes/append  
- /notes/upload  
- /notes/merge  
- /notes/scrape  
- /notes/{id}/ai-action  

### Note Ingestion Pipeline

**Supported Inputs**
- Manual text entry
- File upload
- Website scraping (Wikipedia & generic pages)
- Note merging

**Processing Flow**
```
Input → Parser → Cleaner → Normalizer → Structured Note
```

- HTML Parser / File Parser  
- Content cleaning & deduplication  
- Normalization into a common schema  

### Note Storage & Data Model

**1️⃣ Stateless Notes Storage**
- **Concept**: Notes are stored independently (e.g., JSON, Markdown, or database entries) and are not permanently kept in memory by the Agent.
- **Workflow**:
  1. Save notes to a file or database.
     1. The note should be organized using the following structure:
        1. Title
        2. Summary
        3. Content
        4. Related Concept
        5. (Optional) Questions
        6. (Optional) Answers
  2. Agent reads the note when needed.
  3. Perform actions: summarization, Q&A generation, answer checking.
  4. Write updates back to the note (e.g., append summaries or Q&A).

**2️⃣ Note Reader**
- **Purpose**: Display stateless notes on a webpage or UI for review.
- **Agent Integration**:
  - Reads note content from the reader or file backend.
  - Processes the content for summarization, Q&A generation, or corrections.
  - Updates the note as necessary.

**3️⃣ Automatic Web Scraping and Note Processing**
- **Purpose**: Allow the Agent to automatically extract content from websites and integrate it into notes.
- **Workflow**:
  1. Provide a URL or website source.
  2. Agent scrapes and cleans the content.
  3. Converts scraped content into note format.
  4. Appends or merges the new content into existing notes, maintaining a continuous knowledge base.

**4️⃣ Merging Notes**
- **Purpose**: Combine multiple independent notes into a single, structured note.
- **Workflow**:
  1. Read multiple note files or sections.
  2. Merge content intelligently:
     - Combine summaries
     - Consolidate references
     - Remove duplicate information
  3. Store the unified note back into storage.

**5️⃣ Complete Workflow Overview**
1. **Read Notes** → Load stateless notes from file or database.  
2. **Process Notes** → Summarize, generate questions & answers, check and correct content.  
3. **Update Notes** → Store processed results (summaries, Q&A, corrections) back into storage.  
4. **Scrape & Append** → Extract new notes from websites and merge into existing notes.  
5. **Merge Notes** → Combine multiple notes into one unified, structured note.

**Recommended Storage Format**
- Primary: JSON (flexible, AI-friendly)
- Optional: Markdown (human-readable)
- Metadata stored separately

**Note Schema (JSON)**
```
{
  "title": "Transformer Models",
  "success": false,
  "summary": "...",
  "content": "...",
  "related_concepts": ["..."],
  "questions": ["..."],
  "answers": ["..."],
  "error_messages": ["..."]
}
```

**Database Options**
- PostgreSQL (JSONB columns)
- MongoDB (document-based)
- Hybrid: SQL + vector DB (for semantic search)

### Agent & AI Orchestration Layer

**Agent Class (Core Brain)**

**Responsibilities**
- Manage AI workflows
- Maintain note context
- Decide which AI function to call

**Submodules**
- Structured extraction (Pydantic schemas)
- Function calling layer
- Tool routing logic

### AI Function Calling & Tools

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

---

## Optional Advanced Layer (Recommended)

**Enhancements**
- Vector embeddings for notes
- Semantic search & retrieval
- Personalized question difficulty
- Study session tracking

**Tools**
- Vector DB (FAISS / Pinecone / pgvector)
- Background job queue (Celery / BullMQ)

---

## End-to-End Workflow Summary

```
Web Frontend
   ↓
Authentication (Server)
   ↓
Notes API
   ↓
Parser / Cleaner / Normalizer
   ↓
Database (JSON Notes)
   ↓
LLM Agent
   ├── Summarize
   ├── Quiz and Answer Generation
   └── Review and Evaluation
   ↓
Updated Note Stored
   ↓
Frontend Displays Results
```

Notes and AI Agents are separated. Notes remain stable, user-owned entities while AI Agents operate on notes and store outputs in a structured ai_outputs section. This allows independent AI upgrades, versioning, and reproducibility without affecting the core note data.

---

## Instruction

Follow the steps below to set up and run the project in an isolated environment.

1. Create a virtual environment

```bash
python -m venv venv
```

2. Activate the virtual environment

* On macOS / Linux

```bash
source venv/bin/activate
```
* On Windows

```bash
venv\Scripts\activate
```

3. Install required dependencies

```bash
pip install -r requirements.txt
```

4. Install Playwright browsers

```bash
playwright install
```

Once completed, the environment is ready to use.
