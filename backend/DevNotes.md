# Development Notes
1. **Why JSON over Markdown**: I chose JSON for storing notes because it is **easier for non-AI systems to parse**. Its structure also closely mirrors Python dictionaries, making it simple to manipulate, format, and convert within Python.
2. **`NoteAgent`**: This class provides **core functionality** for **working with notes**, including **parsing**, **generating Q&A**, and **creating** or **updating notes**.
3. **Domain vs Services**: The **Domain** layer handles fundamental business logic, while **Services** build on these core functions to provide integrated or refined functionality for end-user operations.
4. 

# TODO
- [ ] Add revision test using LLM
- [ ] Store the revision record for further spaced repetition revision
- [ ] Add difficulty as the revision level increase
- [ ] Add questions reviewer and answer checker

# Optional Improvements
1. **`generate_qa` return type**: Currently, it returns the full `Note` object, mainly because the `success` flag and `error_messages` are needed. This approach is acceptable.
   - Alternative approach: The QA generation could be separated to return just a `List[QA]` or a `Dict[str, str]`, which would make the design cleaner and more modular.
   - For now, returning the full `Note` object is fine.
