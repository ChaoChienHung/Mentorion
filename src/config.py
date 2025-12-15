# Import required libraries
import os
import getpass
from typing import List

# Configure the OpenAI API key for client access
try:
    # Prompt the user to enter the API key securely
    api_key: str = getpass.getpass("Enter your OpenAI API key (it will not be shown as you type): ")

    # If no input is provided, attempt to retrieve it from the environment
    if not api_key:
        api_key: str = os.environ.get("OPENAI_API_KEY")

    # Raise an error if no API key is found
    if not api_key:
        raise ValueError("No API key provided and no default found in environment.")

    # Save the API key in the environment for later use and notify the user
    os.environ["OPENAI_API_KEY"] = api_key
    print("API key set successfully.")

# Catch and display any errors
except ValueError as e:
    print(f"Error: {e}")

# Set the URLs to be crawled
URLs: List[str] = ["https://en.wikipedia.org/wiki/Path_tracing", "https://en.wikipedia.org/wiki/Radiosity_(computer_graphics)", "https://en.wikipedia.org/wiki/Ray_tracing_(graphics)", "https://en.wikipedia.org/wiki/Gouraud_shading#Comparison_with_other_shading_techniques", "https://en.wikipedia.org/wiki/Phong_shading", "https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_reflection_model#Code_samples"]
API: str = api_key # For later testing purpose