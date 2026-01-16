# Mentorion

This project is designed to practice LLM (Gemini) integration while building a learning support application. The application includes features such as automatic article parsing, note-taking, question generation, and answer evaluation.

---

## Overall Architecture and Workflow

This system is organized into Frontend, Backend (Application Layer), and Server / Infrastructure Logic to clearly separate responsibilities. This architecture supports a web-based learning assistant with authentication, note management, AI enrichment, and persistent storage.

---

## Folder Structure

```bash
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
├─ backend/                         # Backend layer (AI & application logic)
│     │
│     ├─ main.py                    # FastAPI entry
│     ├─ README.md                  # Backend Readme
│     ├─ DevNotes.md                # Backend development notes
│     │
│     ├─ api/
│     │  └─ v1/
│     │     └─ notes.py             # /notes/*
│     │
│     ├─ core/
│     │  ├─ logger.py               # Logger setup
│     │  ├─ config.py               # Configuration setup
│     │  ├─ ai_client.py            # Create and intialize a client using configured API key
│     │  ├─ rate_limiter.py         # Rate limiter
│     │  └─ request_throttler.py    # Request throttler
│     │
│     ├─ domain/                    
│     │  ├─ agent.py                # Note agent (basic functionalities)
│     │  └─ scraper.py              # Scraper
│     │
│     ├─ logs/                      # Logger files
│     │  ├─ ErrorLogger.log         # Logger for WARNING, ERROR messages
│     │  └─ MessageLogger.log       # Logger for DEBUG, INFO messages
│     │
│     ├─ schemas/
│     │  └─ note.py                 # Note schema
│     │
│     └─ services/
│        └─ note_service.py         # Note services
│      
├─ Streamlit/                       # Streamlit app for application demonstration
│
├─ tests/                           # Unit and integration tests
├─ README.md                        # Project overview
├─ DevNotes.md                      # Mentorion development notes
└─ requirements.txt                 # Mentorion Python dependencies
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

- /notes/parse  
- /notes/scrape  

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

1. **Create a virtual environment**
   
   This creates a `venv` folder with an isolated Python environment.

   ```bash
   python -m venv venv
   ```

1. **Activate the virtual environment**

   * On macOS / Linux

   ```bash
   source venv/bin/activate
   ```
   * On Windows

   ```bash
   venv\Scripts\activate
   ```

   * Windows (PowerShell)

   ```bash
   venv\Scripts\Activate.ps1
   ```

2. **Install required dependencies**

   This installs all Python packages needed for the project.

   ```bash
   pip install -r requirements.txt
   ```

3. **Install Playwright browsers**

   Playwright needs browser binaries to run automated scripts.

   ```bash
   playwright install
   ```

4. **Export API Key**

   * On macOS / Linux

   ```bash
   export GEMINI_API_KEY=YOUR_API_KEY
   ```

   * Windows (Command Prompt)

   ```bash
   set GEMINI_API_KEY=YOUR_API_KEY
   ```

   * Windows (PowerShell)

   ```bash
   $env:GEMINI_API_KEY="YOUR_API_KEY"
   ```

5. **Run the backend server**

   ```bash
   cd backend
   uvicorn main:app --reload
   ```
   - This starts the FastAPI server in development mode.
   - Access the API at http://127.0.0.1:8000
