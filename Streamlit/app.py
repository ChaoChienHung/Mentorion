# TODO

import sys
import json
import requests
import streamlit as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

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
    st.session_state.repository_notes = []


# Uploader Key
# --------------------------------
if "uploader_key" not in st.session_state:
    st.session_state.uploader_key = 0

# ------------------
# Page Configuration
# ------------------

st.set_page_config(page_title="Mentorion", layout="wide")

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

        # Note Titles
        # -----------
        note_titles = [note.get("title", "Untitled") for note in st.session_state.repository_notes]

        # Web URL Input
        # -------------
        url_input = st.text_input("Enter a note URL", value="")
        if st.button("➕ Add Note from URL"):
            if url_input.strip():
                with st.spinner("Fetching and parsing note..."):
                    structured_note = requests.post(
                        "http://localhost:8000/notes/scrape",
                        json={"url": url_input.strip()}
                    ).json()
                
                structured_note_title = structured_note.get("title", "Untitled")
                if structured_note_title not in note_titles:
                    st.session_state.repository_notes.append(structured_note)
                    note_titles.append(structured_note_title)

                else:
                    for i in range(len(st.session_state.repository_notes)):
                        if st.session_state.repository_notes[i]["title"] == structured_note_title:
                            st.session_state.repository_notes[i] = structured_note
                            break

                st.success("Note fetched and parsed successfully!")
            else:
                st.error("Please enter a valid URL.")

        
        # File uploader
        # -------------
        uploaded_file = st.file_uploader("Upload a note (json or txt file)", type=["json", "txt"], key=f"note_uploader_{st.session_state.uploader_key}")

        if uploaded_file:
            upload_file = uploaded_file.read().decode("utf-8")

            with st.spinner("Uploading and parsing note..."):
                structured_note = requests.post(
                    "http://localhost:8000/notes/parse",
                    json={"raw_content": upload_file}
                ).json()
            
            structured_note_title = structured_note.get("title", "Untitled")

            if structured_note_title not in note_titles:
                st.session_state.repository_notes.append(structured_note)
                note_titles.append(structured_note_title)

            else:
                for i in range(len(st.session_state.repository_notes)):
                    if st.session_state.repository_notes[i]["title"] == structured_note_title:
                        st.session_state.repository_notes[i] = structured_note
                        break

            st.success("Note uploaded and parsed successfully!")
            
            st.session_state.uploader_key += 1
            st.rerun()


        # Repository Notes
        # ----------------
        selected_note_title = st.radio("Notes", options=note_titles)

        # Find selected note
        selected_note = None
        for note in st.session_state.repository_notes:
            if note.get("title") == selected_note_title:
                selected_note = note
                break

        st.markdown("</div>", unsafe_allow_html=True)

# ------------
# Note Preview
# ------------

with col2:
    with st.container(border=True):

        # Header row (title left, edit button right)
        # ------------------------------------------
        title_col, button_col, download_col = st.columns([8.1, 0.7, 1.2])

        with title_col:
            st.header("Note Preview")

        # Edit Button
        # -----------
        with button_col:
            st.write("")  # vertical alignment spacer
            if not st.session_state.get("edit_mode", False):
                if st.button("Edit"):
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
                    if new_note["title"] not in note_titles:
                        st.session_state.repository_notes.append(new_note)

                    else:
                        for i in range(len(st.session_state.repository_notes)):
                            if st.session_state.repository_notes[i]["title"] == new_note["title"]:
                                st.session_state.repository_notes[i] = new_note
                                break

                st.session_state.edit_mode = False
    
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

                st.header(st.session_state.title)
                st.subheader("Summary")
                st.write(st.session_state.summary)
                st.subheader("Content")
                st.write(st.session_state.content)

                # Related Concepts Section
                # ------------------------
                st.subheader("Related Concepts")
                concepts_section: str = ""
                for concept in st.session_state.related_concepts:
                    concepts_section += f"1. {concept}\n"

                st.markdown(concepts_section)

                # Q&A Section
                # -----------
                st.subheader("Q&A")
                qa_section = ""
                for question, answer in st.session_state.questions_answers.items():
                    qa_section += f"**Q:** {question}\n\n"
                    qa_section += f"**A:** {answer}\n\n"

                st.markdown(qa_section)

            else:
                st.write("No note selected.")
