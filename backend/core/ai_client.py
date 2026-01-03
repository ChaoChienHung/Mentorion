from google import genai
from backend.core.config import settings

def create_gemini_client():
    """
    Create and intialize a client using configured API key.

    Steps:
    1. Looks for GEMINI_API_KEY in environment variables
    2. Tests the connection with a simple API call
    3. Returns the client or None if setup fails
    """
    print("🔐 Setting up Gemini client...")

    if not settings.API_KEY:
        print("❌ No GEMINI_API_KEY found in environment variables.")
        print("💡 Set it with:")
        print("   • Linux/Mac: export GEMINI_API_KEY=your_key")
        print("   • Windows:  setx GEMINI_API_KEY your_key")
        raise RuntimeError("GEMINI_API_KEY not set")

    try:
        client = genai.Client(api_key=settings.API_KEY)
        client.models.generate_content(
            model=settings.MODEL,
            contents="Test my API key with a simple prompt."
        )
        print("✅ Gemini client created and tested successfully.")

    except Exception as e:
        print(f"❌ Failed to create Gemini client: {e}")
        print("🔍 Check your API key and internet connection.")

    # Optional: lightweight test
    client.models.generate_content(
        model=settings.MODEL,
        contents="ping"
    )

    return client
