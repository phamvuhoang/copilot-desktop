"""
Chat API routes for AI Copilot Desktop
Handles text-based chat interactions with the LLM.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
import time
from datetime import datetime

from services.llm import get_llm_service, LLMService

router = APIRouter()

# Request/Response Models
class ChatMessage(BaseModel):
    """Individual chat message"""
    role: str = Field(..., description="Message role: 'user', 'assistant', or 'system'")
    content: str = Field(..., description="Message content")
    timestamp: Optional[str] = Field(None, description="Message timestamp")

class ChatRequest(BaseModel):
    """Chat request payload"""
    message: str = Field(..., description="User message", min_length=1, max_length=2000)
    conversation_history: Optional[List[ChatMessage]] = Field(
        default=[],
        description="Previous messages in conversation"
    )
    system_prompt: Optional[str] = Field(
        None,
        description="System prompt to set context",
        max_length=500
    )
    provider: Optional[str] = Field(None, description="Specific provider to use (openai, gemini, ollama)")
    model: Optional[str] = Field(None, description="Specific model to use")
    temperature: Optional[float] = Field(
        None,
        description="Sampling temperature (0.0 to 2.0)",
        ge=0.0,
        le=2.0
    )

class ChatResponse(BaseModel):
    """Chat response payload"""
    message: str = Field(..., description="Assistant's response")
    role: str = Field(default="assistant", description="Response role")
    timestamp: str = Field(..., description="Response timestamp")
    model: str = Field(..., description="Model used for generation")
    usage: Optional[Dict[str, int]] = Field(None, description="Token usage information")
    conversation_id: Optional[str] = Field(None, description="Conversation identifier")

class ErrorResponse(BaseModel):
    """Error response payload"""
    error: bool = Field(default=True)
    message: str = Field(..., description="Error message")
    code: Optional[str] = Field(None, description="Error code")
    timestamp: str = Field(..., description="Error timestamp")

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(
    request: ChatRequest,
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    Process chat message and return AI response
    
    This endpoint accepts a user message and optional conversation history,
    processes it through the LLM, and returns the assistant's response.
    """
    try:
        # Check if LLM service is available
        if not llm_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="LLM service is not available. Please check API configuration."
            )
        
        # Prepare conversation history
        conversation_history = []
        if request.conversation_history:
            for msg in request.conversation_history:
                conversation_history.append({
                    "role": msg.role,
                    "content": msg.content
                })
        
        # Set default system prompt if none provided
        system_prompt = request.system_prompt or (
            "You are AI Copilot, a helpful desktop assistant. "
            "Provide concise, accurate, and helpful responses. "
            "Be friendly and professional in your interactions."
        )
        
        # Get response from LLM
        start_time = time.time()
        
        if conversation_history:
            # Use contextual chat for conversations with history
            response = await llm_service.contextual_chat(
                user_message=request.message,
                conversation_history=conversation_history,
                system_prompt=system_prompt,
                provider=request.provider
            )
        else:
            # Use simple chat for single messages
            response_content = await llm_service.simple_chat(
                user_message=request.message,
                system_prompt=system_prompt,
                provider=request.provider
            )
            response = {
                "content": response_content,
                "role": "assistant",
                "model": request.model or "default",
                "usage": None,
                "finish_reason": "stop",
                "provider": request.provider or llm_service.get_active_provider()
            }
        
        processing_time = time.time() - start_time
        
        # Prepare response
        chat_response = ChatResponse(
            message=response["content"],
            role=response["role"],
            timestamp=datetime.now().isoformat(),
            model=response["model"],
            usage=response.get("usage")
        )
        
        # Log successful request (in production, use proper logging)
        print(f"Chat request processed in {processing_time:.2f}s")
        
        return chat_response
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Handle unexpected errors
        error_message = f"Failed to process chat request: {str(e)}"
        print(f"Chat error: {error_message}")
        
        raise HTTPException(
            status_code=500,
            detail=error_message
        )

@router.get("/chat/models")
async def get_available_models(llm_service: LLMService = Depends(get_llm_service)):
    """Get list of available chat models from all providers"""
    try:
        models = llm_service.get_available_models()
        active_provider = llm_service.get_active_provider()
        return {
            "models": models,
            "active_provider": active_provider,
            "available": llm_service.is_available()
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get available models: {str(e)}"
        )

@router.get("/chat/providers")
async def get_available_providers(llm_service: LLMService = Depends(get_llm_service)):
    """Get list of available LLM providers"""
    try:
        providers = llm_service.get_available_providers()
        provider_info = llm_service.get_provider_info()
        active_provider = llm_service.get_active_provider()

        return {
            "providers": providers,
            "active_provider": active_provider,
            "provider_info": provider_info,
            "available": llm_service.is_available()
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get available providers: {str(e)}"
        )

@router.post("/chat/provider")
async def set_active_provider(
    provider_name: str,
    llm_service: LLMService = Depends(get_llm_service)
):
    """Set the active LLM provider"""
    try:
        success = llm_service.set_active_provider(provider_name)
        if success:
            return {
                "success": True,
                "active_provider": llm_service.get_active_provider(),
                "message": f"Successfully switched to {provider_name} provider"
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Provider '{provider_name}' not available"
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to set active provider: {str(e)}"
        )

@router.get("/chat/status")
async def get_chat_status(llm_service: LLMService = Depends(get_llm_service)):
    """Get chat service status"""
    active_provider = llm_service.get_active_provider()
    provider_info = llm_service.get_provider_info(active_provider) if active_provider else {}

    return {
        "status": "available" if llm_service.is_available() else "unavailable",
        "active_provider": active_provider,
        "available_providers": llm_service.get_available_providers(),
        "provider_info": provider_info,
        "timestamp": datetime.now().isoformat()
    }
