# Development Notes

1. **Why JSON over Markdown**:
I chose JSON for storing notes because it is **easier for non-AI systems to parse**. Its structure also closely mirrors Python dictionaries, making it simple to manipulate, format, and convert within Python.

1. **`NoteAgent`**:
This class provides **core functionality** for **working with notes**, including **parsing**, **generating Q&A**, and **creating** or **updating notes**.

1. **Domain vs Services**:
The **Domain** layer handles fundamental business logic, while **Services** build on these core functions to provide integrated or refined functionality for end-user operations.

1. **API vs Services in FastAPI**:
In FastAPI, the **API layer (`api/v1/`)** handles **HTTP endpoints**, receiving and validating requests, converting input into **schemas**, and returning responses, while keeping the logic lightweight and free of heavy business operations. The **services layer (`services/`)** implements the **core business logic**, such as **database operations**, **AI orchestration**, and **reusable workflows**, often leveraging the **domain layer** for actual operations. This separation keeps **endpoints clean, testable, and maintainable**, with **`main.py`** serving only to **initialize the app** and include routers. The typical flow is: **Client → API Endpoint → Service → Domain/Database → Service → API → Client**.

1. **FastAPI Project Structure and Best Practices**:
**All API endpoints are defined in `routes.py` files**, **grouped by version** (e.g., api/v1/routes.py), while **shared dependencies** such as services, agents, database sessions, and middleware (e.g., rate limiters) are **placed in separate `dependencies.py` files**. **Core business logic resides in `services/`**, while **schemas and models live in schemas/ and domain-specific modules**. The **main application (`main.py`) initializes the FastAPI app and includes routers for each version**, allowing **multiple API versions to coexist cleanly**. This **separation of concerns—routes for endpoints**, **dependencies for reusable components**, **services for logic**, and **schemas/models for data—enables easier testing**, **flexible versioning**, and **smoother scaling in production**. **Middleware can be applied globally** at the **app level or selectively per endpoint via dependencies**, depending on the use case.

1. **Rate Limiting Choice**:
Three common O(1) rate-limiting approaches serve different needs. **Sliding Window** (optimized with a deque) provides **simple throttling** by tracking recent events within a fixed time window, but it **does not handle bursts well** and **can feel rigid at window boundaries—best for straightforward limits**. **Token Bucket** allows **controlled bursts** while **enforcing an average rate** by accumulating tokens over time, making it **ideal for APIs**, **login attempts**, and **user-driven actions** where **occasional spikes are acceptable**. **Leaky Bucket enforces a constant processing rate** by **leaking requests at a fixed pace**, **disallowing bursts** and **providing strict smoothing and predictable throughput**, which makes it **well-suited for queues**, **background workers**, and **traffic shaping**.

# TODO

- [ ] Add revision test using LLM
- [ ] Store the revision record for further spaced repetition revision
- [ ] Add difficulty as the revision level increase
- [ ] Add questions reviewer and answer checker

# Optional Improvements

1. **`generate_qa` return type**:
Currently, it returns the full `Note` object, mainly because the `success` flag and `error_messages` are needed. This approach is acceptable.
   - Alternative approach: The QA generation could be separated to return just a `List[QA]` or a `Dict[str, str]`, which would make the design cleaner and more modular.
   - For now, returning the full `Note` object is fine.
