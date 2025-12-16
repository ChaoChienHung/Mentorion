# Mentorion

This project is designed to practice AI function calling while building a learning support application. The application includes features such as automatic article parsing, note-taking and storage, question generation, and answer evaluation.

---

## Overall Architecture and Workflow

This system is organized into Frontend, Backend (Application Layer), and Server / Infrastructure Logic to clearly separate responsibilities.

---

## System Architecture & Workflow

This architecture supports a web-based learning assistant with authentication, note management, AI enrichment, and persistent storage.

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
- AI Agent Capabilities:
  - Merge multiple notes
  - Scrape notes from websites (URL input)
  - Generate summary
  - Generate questions & answers
  - Check and correct answers
- Skill Reviewer
  - Store questions and their review dates

```text
User Browser
   ├── Login / Register
   ├── Notes Dashboard
   ├── Note Editor
   └── AI Actions Panel
```

## Server Layer (API & Authentication)

### Responsibilities
- Request routing (REST / GraphQL)
- Authentication & authorization (JWT / session-based)
- Input validation & rate limiting
- Secure access to user-specific data

### Core APIs

- /auth/login  
- /auth/register  
- /notes/create  
- /notes/append  
- /notes/upload  
- /notes/merge  
- /notes/scrape  
- /notes/{id}/ai-action  

---

## Backend Layer (Application & AI Logic)

1. **Note Ingestion Pipeline**

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

2. **Note Storage & Data Model**

**1️⃣ Stateless Notes Storage**
- **Concept**: Notes are stored independently (e.g., JSON, Markdown, or database entries) and are not permanently kept in memory by the Agent.
- **Workflow**:
  1. Save notes to a file or database.
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

**Example Note Schema (JSON)**
```
{
  "note_id": "uuid",
  "user_id": "uuid",
  "title": "Transformer Models",
  "content": "...",
  "sources": ["https://en.wikipedia.org/..."],
  "ai_outputs": {
    "summary": {
      "text": "...",
      "agent_version": "summary-v2",
      "created_at": "timestamp"
    },
    "qa": {
      "pairs": [
        {"question": "...", "answer": "..."}
      ],
      "difficulty": "medium"
    }
  },
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

**Database Options**
- PostgreSQL (JSONB columns)
- MongoDB (document-based)
- Hybrid: SQL + vector DB (for semantic search)

1. Agent & AI Orchestration Layer

**Agent Class (Core Brain)**

**Responsibilities**
- Manage AI workflows
- Maintain note context
- Decide which AI function to call

**Submodules**
- Structured extraction (Pydantic schemas)
- Function calling layer
- Tool routing logic

4. AI Function Calling & Tools

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
AgentOrchestrator
   ├── SummaryAgent
   ├── QuizAgent
   ├── EvaluationAgent
   └── ReviewAgent
   ↓
Updated Note Stored (ai_outputs updated)
   ↓
Frontend Displays Results
```

Notes and AI Agents are separated. Notes remain stable, user-owned entities while AI Agents operate on notes and store outputs in a structured ai_outputs section. This allows independent AI upgrades, versioning, and reproducibility without affecting the core note data.
