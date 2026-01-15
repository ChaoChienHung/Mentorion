import os
import json
import requests
import streamlit as st
from core.config import settings
from core.logger import msg_logger, error_logger

# ------------------
# Page Configuration
# ------------------

st.set_page_config(page_title="Mentorion", layout="wide")

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

msg_logger.info("Application started.")


# -----
# Title
# -----

st.markdown(
    """
    <div style='text-align: center;'>
        <h1>Mentorion</h1>
    </div>
    """,
    unsafe_allow_html=True
)

st.write("---")


# ------
# Layout
# ------
col1, col2 = st.columns([1, 3])

# ----------
# Repository
# ----------

with col1:
    with st.container(border=True):
        st.markdown("<div class='section-container'>", unsafe_allow_html=True)
        st.header("Repository")

        # Web URL Input
        # -------------
        url_input = st.text_input("Enter a note URL", value="", key="url_input")
        if st.button("➕ Add Note from URL"):
            if url_input.strip():
                with st.spinner("Fetching and parsing note..."):
                    try:
                        response = requests.post(
                            "http://localhost:8000/api/v1/notes/scrape",
                            json={"url": url_input.strip()}
                        )
                        response.raise_for_status()

                    except Exception as e:
                        st.error(f"Failed to scrape note: {e}")
                        error_logger.error(f"Failed to scrape note: {e}")

                structured_note = response.json()
                structured_note_title = structured_note.get("title", "Untitled")
                st.session_state.repository_notes[structured_note_title] = structured_note
                st.success("Note fetched and parsed successfully!")
            else:
                st.error("Please enter a valid URL.")
                error_logger.error("Invalid URL entered for note scraping.")

        
        # File uploader
        # -------------
        uploaded_file = st.file_uploader("Upload a note (json or txt file)", type=["json", "txt"], key=f"note_uploader_{st.session_state.uploader_key}")

        if uploaded_file:
            upload_file = uploaded_file.read().decode("utf-8")

            with st.spinner("Uploading and parsing note..."):
                try:
                    response = requests.post(
                    "http://localhost:8000/api/v1/notes/parse",
                    json={"raw_content": upload_file}
                )
                    response.raise_for_status()

                except Exception as e:
                    st.error(f"Failed to parse note: {e}")
                    st.stop()

                structured_note = response.json()
            
            structured_note_title = structured_note.get("title", "Untitled")
            st.session_state.repository_notes[structured_note_title] = structured_note
            
            st.session_state.uploader_key += 1
            st.rerun()


        # Repository Notes
        # ----------------
        for title in st.session_state.repository_notes.keys():
            if st.button(title, use_container_width=True):
                st.session_state.selected_note_title = title

        # Find selected note
        selected_note = None
        if st.session_state.selected_note_title:
            selected_note = st.session_state.repository_notes.get(st.session_state.selected_note_title)

        st.markdown("</div>", unsafe_allow_html=True)

# ------------
# Note Preview
# ------------

with col2:
    with st.container(border=True):

        # Header row (title left, edit button right)
        # ------------------------------------------
        title_col, button_col, download_col = st.columns([8.1, 0.9, 1.5])

        with title_col:
            st.header("Note Preview")

        # Edit Button
        # -----------
        with button_col:
            st.write("")  # vertical alignment spacer
            if not st.session_state.get("edit_mode", False):
                if st.button("Edit"):
                    if selected_note:
                        st.session_state.title = selected_note.get("title", "")
                        st.session_state.summary = selected_note.get("summary", "")
                        st.session_state.content = selected_note.get("content", "")
                        st.session_state.related_concepts = selected_note.get("related_concepts", [])
                        qa_list = selected_note.get("qa", [])
                        st.session_state.questions_answers = {qa.get("question"): qa.get("answer") for qa in qa_list}

                    st.session_state.edit_mode = True


        # Download Button
        # ---------------
        with download_col:
            st.write("")
            ready_to_download = selected_note if selected_note else None
            note_json = json.dumps(ready_to_download, indent=2)
            st.download_button(
                label="Download",
                data=note_json,
                file_name=f"{ready_to_download.get('title', 'note')}.json" if ready_to_download else "note.json",
                mime="application/json"
            )

        st.write("---")

        # Edit Mode
        # ---------
        if st.session_state.edit_mode:
            title_input = st.text_input(
                "Title",
                value=st.session_state.title
            )
            summary_input = st.text_area(
                "Summary",
                value=st.session_state.summary,
                height=300
            )
            content_input = st.text_area(
                "Content",
                value=st.session_state.content,
                height=300
            )
            related_concepts_input = st.text_area(
                "Related Concepts (One per Line)",
                value="\n".join(st.session_state.related_concepts),
                height=150
            )
            related_concepts_list = [line.strip() for line in related_concepts_input.split("\n") if line.strip()]
            
            # Previous Title
            # --------------
            old_title = st.session_state.selected_note_title

            # If Title Changed, Check for Duplicates
            # --------------------------------------
            if title_input != old_title and title_input in st.session_state.repository_notes:
                st.error("A note with this title already exists.")
                
            else:
                if st.button("💾 Save Note"):
                    if selected_note:
                        # Update existing note in repository
                        # ----------------------------------
                        selected_note["title"] = title_input
                        selected_note["summary"] = summary_input
                        selected_note["content"] = content_input
                        selected_note["related_concepts"] = related_concepts_list
                        
                    else:
                        # Create new note and add to repository
                        # -------------------------------------
                        new_note = {
                            "title": title_input,
                            "summary": summary_input,
                            "content": content_input,
                            "related_concepts": related_concepts_list,
                            "qa": []
                        }
                        selected_note = new_note
                        
                    
                    # Update Session State
                    # --------------------
                    if title_input != old_title:
                        st.session_state.repository_notes.pop(old_title, None)
                    
                    st.session_state.repository_notes[title_input] = selected_note

                    # Remove Old File
                    # ---------------
                    if f"{selected_note['title']}.json" != f"{st.session_state.selected_note_title}.json":
                        
                        old_file_path = os.path.join(settings.NOTE_FOLDER, f"{st.session_state.selected_note_title}.json")
                        if os.path.exists(old_file_path):
                            os.remove(old_file_path)
                            
                    # Save Note
                    # ---------
                    note_json = json.dumps(selected_note, indent=2)
                    file_path = os.path.join(settings.NOTE_FOLDER, f"{selected_note['title']}.json")
                    with open(file_path, "w", encoding='utf-8') as f:
                        f.write(note_json)
                    
                    st.session_state.selected_note_title = title_input
                    st.session_state.edit_mode = False
                    st.rerun()
    
        # View Mode
        # ---------
        else:
            if selected_note:
                st.session_state.title = selected_note.get("title", "")
                st.session_state.summary = selected_note.get("summary", "")
                st.session_state.content = selected_note.get("content", "")
                st.session_state.related_concepts = selected_note.get("related_concepts", [])
                qa_list = selected_note.get("qa", [])
                st.session_state.questions_answers = {qa.get("question"): qa.get("answer") for qa in qa_list}

                # Title Section
                # -------------
                if st.session_state.title:
                    st.header(st.session_state.title)

                # Summary and Content Section
                # ---------------------------
                if st.session_state.summary:
                    st.subheader("Summary")
                    st.write(st.session_state.summary)

                # Content Section
                # ---------------
                if st.session_state.content:
                    st.subheader("Content")
                    st.write(st.session_state.content)

                # Related Concepts Section
                # ------------------------
                if st.session_state.related_concepts:
                    st.subheader("Related Concepts")
                    concepts_section: str = ""
                    for concept in st.session_state.related_concepts:
                        concepts_section += f"1. {concept}\n"

                    st.markdown(concepts_section)

                # Q&A Section
                # -----------
                if st.session_state.questions_answers:
                    st.subheader("Q&A")
                    qa_section = ""
                    for question, answer in st.session_state.questions_answers.items():
                        qa_section += f"**Q:** {question}\n\n"
                        qa_section += f"**A:** {answer}\n\n"

                    st.markdown(qa_section)

            else:
                st.write("No note selected.")
