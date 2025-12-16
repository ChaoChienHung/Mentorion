# Mentorion

This project is designed to practice AI function calling while building a learning support application. The application includes features such as automatic article parsing, note-taking and storage, question generation, and answer evaluation.

---

## 🏗️ Overall Architecture and Workflow

This system is organized into **Frontend**, **Backend (Application Layer)**, and **Server / Infrastructure Logic** to clearly separate responsibilities.

---

## 🏗️ Updated System Architecture & Workflow

This architecture supports a **web-based learning assistant** with authentication, note management, AI enrichment, and persistent storage.

---

## 🌐 Frontend Layer (Web Application)

**Key Components**
- Web UI (React / Vue / Next.js / etc.)
- Authentication pages (Login / Register)
- Dashboard (Notes overview)
- Note Editor & Viewer

**Frontend Features**
- User authentication (login/logout)
- Create, view, edit, and append notes
- Upload notes (text / markdown / PDF)
- Scrape notes from websites (URL input)
- Merge multiple notes
- Trigger AI actions:
  - Generate summary
  - Generate questions & answers
- Skill Reviewer
  - Store questions and their review dates
  - Check answers

```text
User Browser
   ├── Login / Register
   ├── Notes Dashboard
   ├── Note Editor
   └── AI Actions Panel
```

🔐 Server Layer (API & Authentication)

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

⚙️ Backend Layer (Application & AI Logic)

## 1. Note Ingestion Pipeline

### Supported Inputs
- Manual text entry
- File upload
- Website scraping (Wikipedia & generic pages)
- Note merging

### Processing Flow
```
Input → Parser → Cleaner → Normalizer → Structured Note
```

- HTML Parser / File Parser  
- Content cleaning & deduplication  
- Normalization into a common schema  

---

## 2. Note Storage & Data Model

### Recommended Storage Format
- **Primary:** JSON (flexible, AI-friendly)
- **Optional:** Markdown (human-readable)
- Metadata stored separately

### Example Note Schema (JSON)
```{
  "note_id": "uuid",
  "user_id": "uuid",
  "title": "Transformer Models",
  "content": "...",
  "sources": ["https://en.wikipedia.org/..."],
  "summary": "...",
  "qa_pairs": [
    { "question": "...", "answer": "..." }
  ],
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### Database Options
- PostgreSQL (JSONB columns)
- MongoDB (document-based)
- Hybrid: SQL + vector DB (for semantic search)

---

## 3. Agent & AI Orchestration Layer

### Agent Class (Core Brain)

**Responsibilities**
- Manage AI workflows
- Maintain note context
- Decide which AI function to call

### Submodules
- Structured extraction (Pydantic schemas)
- Function calling layer
- Tool routing logic

---

## 4. AI Function Calling & Tools

### Supported AI Actions
- Summarization
- Question generation
- Answer generation
- Answer checking
- Concept comparison
- Evolution tracing

### Execution Paths
```
Function Calling Layer
   ├── External AI APIs (Gemini / OpenAI)
   └── Mock / Local Mode (for testing)
```

Results are written back into the original note.

---

🧠 Optional Advanced Layer (Recommended)

### Enhancements
- Vector embeddings for notes
- Semantic search & retrieval
- Personalized question difficulty
- Study session tracking

### Tools
- Vector DB (FAISS / Pinecone / pgvector)
- Background job queue (Celery / BullMQ)

---

🔄 End-to-End Workflow Summary
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
Agent Class
   ├── Summarize
   ├── Generate Q&A
   ├── Check Answers
   └── Compare / Trace
   ↓
Updated Note Stored
   ↓
Frontend Displays Results
```