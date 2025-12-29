import asyncio
from backend.domain.agent import Agent
from backend.schemas.note import Note

async def main():
    client = Agent()  # Initialize a LLM Agent
    result = await client.scrape_note(
        "https://medium.com/ching-i/mobilenetv2-%E8%AB%96%E6%96%87%E9%96%B1%E8%AE%80-94f710e7fe51"
    )
    assert result.success
    assert isinstance(result, Note)
    result: Note = client.generate_qa(result)
    assert isinstance(result, Note)
    for question, answer in zip(result.questions, result.answers):
        print(f"Q: {question}\nA: {answer}\n")

if __name__ == "__main__":
    asyncio.run(main())
