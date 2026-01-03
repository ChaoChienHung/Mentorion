import sys
import streamlit as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.domain.agent import Agent

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
        
        # Repository notes
        repository_notes = ["Note 1", "Note 2", "Note 3"]
        selected_note = st.radio("Select a note to view:", options=repository_notes)
        
        # File uploader
        st.write("Or upload a new note below:")
        uploaded_file = st.file_uploader("Upload a note (txt file)", type=["txt"])
        if uploaded_file:
            uploaded_text = uploaded_file.read().decode("utf-8")
            selected_note = uploaded_file.name
        st.markdown("</div>", unsafe_allow_html=True)

# ------------
# Note Preview
# ------------

with col2:
    with st.container(border=True):
        st.header("Note Preview")

        if "edit_mode" not in st.session_state:
            st.session_state.edit_mode = False

        if st.session_state.edit_mode:
            note_content = st.text_area("Edit your note:", value=st.session_state.note_content)
            if st.button("Save Note"):
                st.session_state.edit_mode = False
                st.session_state.note_content = note_content
        else:
            if uploaded_file:
                st.session_state.note_content = uploaded_text
            elif selected_note:
                st.session_state.note_content = f"This is the content of **{selected_note}**. Replace this with actual note content."

            st.write(st.session_state.note_content)
            if st.button("✏️ Edit"):
                st.session_state.edit_mode = True
