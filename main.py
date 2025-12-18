import asyncio
from src.agent import Agent
from src.schema import Note


async def main():
    client = Agent()  # Initialize a LLM Agent
    result = await client.scrape_note(
        "https://en.wikipedia.org/wiki/Machine_learning"
    )
    assert result.success
    assert isinstance(result, Note)
    result: Note = client.generate_qa(result)
    assert isinstance(result, Note)
    for question, answer in zip(result.questions, result.answers):
        print(f"Q: {question}\nA: {answer}\n")

if __name__ == "__main__":
    asyncio.run(main())
