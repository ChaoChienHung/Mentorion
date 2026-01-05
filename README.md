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
│  └─ app/
│     ├─ main.py                    # FastAPI entry
│     │
│     ├─ api/
│     │  └─ v1/
│     │     ├─ notes.py             # /notes/*
│     │     └─ ai.py                # /notes/{id}/ai-action
│     │
│     ├─ core/
│     │  ├─ rate_limiter.py         # Rate Limiter
│     │  └─ config.py               # Configuration Setup
│     │
│     ├─ schemas/
│     │  ├─ note.py                 # Note Schema
│     │  └─ scraper.py              # Scraped Article Schema
│     │
│     ├─ services/
│     │  ├─ note_service.py         # read/write notes
│     │  └─ ai_service.py           # orchestrates Agent
│     │
│     └─ domain/                    
│        ├─ agent.py                # AI Agent Class
│        └─ scraper.py              # Scraper Class
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
