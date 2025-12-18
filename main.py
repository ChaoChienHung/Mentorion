import asyncio
from src.agent import Agent

async def main():
    client = Agent()  # Initialize a LLM Agent
    result = await client.scrape_note(
        "https://en.wikipedia.org/wiki/Machine_learning"
    )
    print(result)

if __name__ == "__main__":
    asyncio.run(main())
