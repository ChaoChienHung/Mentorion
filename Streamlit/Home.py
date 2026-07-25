# TODO: Impose filename sanitization.
# TODO: Add delete note functionality.
# TODO: Improve error handling and user feedback.
# TODO: Add pagination or search for repository notes if too many.
# TODO: Enhance UI/UX with sidebar, better styling, and layout.

import os
import requests
import streamlit as st
from core.config import settings
from core.logger import msg_logger, error_logger

# ------------------
# Page Configuration
# ------------------

st.set_page_config(page_title="Mentorion", layout="wide")

msg_logger.info("Application started.")

# --------------------
# State Initialization
# --------------------
if "title" not in st.session_state:
    st.session_state.title = ""

if "summary" not in st.session_state:
    st.session_state.summary = ""

if "content" not in st.session_state:
    st.session_state.content = ""

if "related_concepts" not in st.session_state:
    st.session_state.related_concepts = []

if "questions_answers" not in st.session_state:
    st.session_state.questions_answers = {}

if "edit_mode" not in st.session_state:
    st.session_state.edit_mode = False

if "repository_notes" not in st.session_state:
    st.session_state.repository_notes = {}

if "selected_note_title" not in st.session_state:
    st.session_state.selected_note_title = None

# Uploader Key
# ------------
if "uploader_key" not in st.session_state:
    st.session_state.uploader_key = 0

msg_logger.info("Session state initialized.")

# Load Notes from JSON files
# --------------------------
os.makedirs(settings.NOTE_FOLDER, exist_ok=True)
if not st.session_state.repository_notes:
    with st.spinner("Fetching and parsing note..."):
        for file in os.listdir(settings.NOTE_FOLDER):
            if file.endswith(".json"):
                with open(os.path.join(settings.NOTE_FOLDER, file), "r", encoding="utf-8") as f:
                    content = f.read()
                    try:
                        response = requests.post(
                        "http://localhost:8000/api/v1/notes/parse",
                        json={"raw_content": content.strip()}
                        )
                        response.raise_for_status()

                    except Exception as e:
                        st.error(f"Failed to parse note from {file}: {e}")
                        error_logger.error(f"Failed to parse note: {e}")

                    structured_note = response.json()
                    structured_note_title = structured_note.get("title", "Untitled")
                    st.session_state.repository_notes[structured_note_title] = structured_note


# Home Page UI
# ------------


# Custom CSS for Styling
# ----------------------

# ------
# Styles
# ------
st.markdown("""
<style>
/* Body */
body {
    background-color: #0f111a;
    color: #ffffff;
    font-family: 'Helvetica Neue', sans-serif;
}

/* Hero section */
.hero {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 90vh;
    border-radius: 15px;
    margin-bottom: 50px;
    text-align: center;
    padding: 50px;
}

/* Hero title */
.hero h1 {
    font-size: 6em;
    font-weight: bold;
    margin-bottom: 20px;
}

/* Hero subtitle */
.hero p {
    font-size: 1.5em;
    color: #ecf0f1;
    margin-bottom: 30px;
}

/* ---------------- */
/* Features section */
/* ---------------- */
.features {
    display: flex;
    justify-content: space-around;
    margin-top: 50px;
}

.feature-card {
    background-color: #1e1f2f;
    border-radius: 15px;
    padding: 30px;
    width: 28%;
    text-align: center;
    transition: transform 0.3s;
}

.feature-card:hover {
    transform: translateY(-10px);
}

.feature-card h3 {
    color: #1abc9c;
    margin-bottom: 15px;
}

.feature-card p {
    color: #bdc3c7;
}
</style>
""", unsafe_allow_html=True)

# ------------
# Hero Section
# ------------

st.markdown("""
<div class="hero">
    <div>
        <h1>Mentorion</h1>
        <p>Your AI-powered guide to growth and success</p>
    </div>
</div>
""", unsafe_allow_html=True)

# ----------------
# Features Section
# ----------------
st.markdown("<h2 style='text-align:center; margin-bottom:40px; font-size: 3em;' id='features'>Why Mentorion?</h2>", unsafe_allow_html=True)

st.markdown("""
<div class="features">
    <div class="feature-card">
        <h3>Personalized Mentoring</h3>
        <p>Receive tailored guidance that matches your goals and growth trajectory.</p>
    </div>
    <div class="feature-card">
        <h3>Smart Learning Paths</h3>
        <p>AI-curated resources to help you skill up quickly and effectively.</p>
    </div>
    <div class="feature-card">
        <h3>Progress Tracking</h3>
        <p>Visual dashboards to monitor your growth and celebrate achievements.</p>
    </div>
</div>
""", unsafe_allow_html=True)

# ----------------------
# Call to Action Section
# ----------------------
st.markdown("""
<div style="text-align:center; margin-top:70px; padding:50px; border-radius:15px;">
    <h2 style="color:#ffffff; font-size:42px;">Ready to transform your learning journey?</h2>
</div>
""", unsafe_allow_html=True)

# -----------------------
# Notes Navigation Button
# -----------------------
col1, col2, col3 = st.columns([11, 10, 5])
with col2:
    st.markdown("""
    <style>
    /* ---------------------------------------------- */ 
    /* Style the button to look like your hero button */
    /* ---------------------------------------------- */

    div.stButton > button:first-child {
        background-color: #ffffff;
        color: #000000;
        font-size: 18px;
        font-weight: bold;
        padding: 15px 40px;
        border-radius: 50px;
        border: none;
        cursor: pointer;
        transition: 0.3s;
        margin-bottom: 30px;

    }

    div.stButton > button:first-child:hover {
        background-color: #16a085;
        color: #ffffff;
    }
    </style>
    """, unsafe_allow_html=True)
    
    if st.button("Go to Notes"):
        st.switch_page("./pages/Notes.py")


msg_logger.info("Home page UI rendered.")