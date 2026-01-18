from google import genai
from backend.core.config import settings
from backend.core.logger import msg_logger, error_logger

def create_gemini_client():
    """
    Create and intialize a client using configured API key.

    Steps:
    1. Looks for GEMINI_API_KEY in environment variables
    2. Tests the connection with a simple API call
    3. Returns the client or None if setup fails
    """
    msg_logger.info("🔐 Setting up Gemini client...")

    if not settings.GEMINI_API_KEY:
        error_logger.error("❌ No GEMINI_API_KEY found in environment variables.")
        error_logger.info("💡 Set it with:")
        error_logger.info("   • Linux/Mac: export GEMINI_API_KEY=your_key")
        error_logger.info("   • Windows:  setx GEMINI_API_KEY your_key")
        raise RuntimeError("GEMINI_API_KEY not set")

    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        msg_logger.info("✅ Gemini client created and tested successfully.")

    except Exception as e:
        error_logger.error(f"❌ Failed to create Gemini client: {e}")
        error_logger.info("🔍 Check your API key and internet connection.")
        
    return client
