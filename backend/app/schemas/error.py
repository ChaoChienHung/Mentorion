from pydantic import BaseModel, Field, ConfigDict


class ErrorResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"detail": "Too many requests"}]}
    )

    detail: str = Field(description="Human-readable error detail.")
