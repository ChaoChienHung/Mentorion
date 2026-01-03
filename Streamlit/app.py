import Streamlit.streamlit as st

st.set_page_config(page_title="My Note", layout="centered")

st.title("📒 My Note")

note = st.text_area(
    "Write your note below:",
    placeholder="Type your note here..."
)

if note:
    st.subheader("Your Note:")
    st.write(note)
