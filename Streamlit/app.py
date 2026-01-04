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
        # ----------------
        repository_notes = []
        selected_note = st.radio("Notes", options=repository_notes)
        
        # File uploader
        # -------------
        uploaded_file = st.file_uploader("Upload a note (json or txt file)", type=["json", "txt"])

        if uploaded_file:
            uploaded_text = uploaded_file.read().decode("utf-8")
            selected_note = uploaded_file.name
        st.markdown("</div>", unsafe_allow_html=True)

# ------------
# Note Preview
# ------------

with col2:
    with st.container(border=True):

        # --- Header row (title left, edit button right) ---
        title_col, button_col = st.columns([9, 1])

        with title_col:
            st.header("Note Preview")

        with button_col:
            st.write("")  # vertical alignment spacer
            if not st.session_state.get("edit_mode", False):
                if st.button("Edit"):
                    st.session_state.edit_mode = True

        # --- State initialization ---
        if "edit_mode" not in st.session_state:
            st.session_state.edit_mode = False

        if "note_content" not in st.session_state:
            st.session_state.note_content = ""

        # --- Content ---
        if st.session_state.edit_mode:
            note_content = st.text_area(
                "Edit your note:",
                value=st.session_state.note_content,
                height=300
            )

            if st.button("💾 Save Note"):
                st.session_state.note_content = note_content
                st.session_state.edit_mode = False
        else:
            if uploaded_file:
                st.session_state.note_content = uploaded_text
            elif selected_note:
                st.session_state.note_content = (
                    f"This is the content of **{selected_note}**. "
                    "Replace this with actual note content."
                )

            st.write(st.session_state.note_content)
