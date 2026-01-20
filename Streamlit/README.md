# 📊 Streamlit Demo App

This project demonstrates a **simple Streamlit web application** built entirely in Python.  
It showcases how to create an **interactive data app** without explicitly separating a front end and back end—Streamlit handles this seamlessly for you.

---

## 🚀 Overview

- **Framework:** Streamlit (open-source)
- **Purpose:** Demonstrate a lightweight interactive web app
- **Architecture:** Single Python-based app (no separate frontend/backend)
- **Target Use Case:** Prototyping, demos, data exploration, and learning Streamlit basics

---

## 📁 Project Structure

```bash
Streamlit/                            # Backend layer (AI & application logic)
    ├── core/                         # Core functionalities
    │     ├─ __init__.py        
    │     ├─ config.py                # Configuration file
    │     └─ logger.py                # Logger file
    │
    ├── logs/                         # Logging files
    │     ├─ ErrorLogger.log          # Error logging
    │     └─ MessageLogger.log        # Info logging
    │
    ├── notes/                        # Local Storage for Notes
    │
    ├── pages/                        # Streamlit web pages
    │     └─ Notes.py                 # Note Page
    │
    ├── __init__.py
    ├── DevNotes.md                   # Development notes
    ├── Home.py                       # Main Streamlit application
    ├── README.md                     # Project documentation
    └── requirements.txt              # Python dependencies
```

---

## ⚙️ Installation

Install dependencies:
```bash
pip install -r requirements.txt
```
---

## ▶️ Running the App

Start the Streamlit application with:
  
```bash
streamlit run Home.py
```

Once running, Streamlit will automatically open the app in your default web browser.
If it doesn’t, you can manually visit:
```
http://localhost:8501
```