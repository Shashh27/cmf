from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional


class ChatRequest(BaseModel):
    question: str = Field(..., description="User's question in natural language")
    session_id: str = Field(..., description="Session ID for chat history")


class ChatResponse(BaseModel):
    answer: str = Field(..., description="Human-readable answer from the LLM")
    sql: str = Field(..., description="Generated SQL query")
    data: List[Dict[str, Any]] = Field(default_factory=list, description="Query results as list of dictionaries")


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ChatHistory(BaseModel):
    session_id: str
    messages: List[ChatMessage]
