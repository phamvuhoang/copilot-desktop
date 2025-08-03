"""
Process API routes for AI Copilot Desktop
Handles unified command processing with intent recognition and action instructions.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, Union
import time
import base64
from datetime import datetime

from services.llm import get_llm_service, LLMService
from services.stt import get_stt_service, STTService
from services.tts import get_tts_service, TTSService
from services.intent import get_intent_service, IntentRecognitionService

router = APIRouter()

# Request/Response Models
class ProcessRequest(BaseModel):
    """Process request payload for unified command processing"""
    input_type: str = Field(..., description="Input type: 'text' or 'audio'")
    text: Optional[str] = Field(None, description="Text input (required if input_type is 'text')")
    audio_data: Optional[str] = Field(None, description="Base64-encoded audio data (required if input_type is 'audio')")
    conversation_history: Optional[List[Dict[str, str]]] = Field(
        default=[],
        description="Previous messages in conversation"
    )
    system_prompt: Optional[str] = Field(
        None,
        description="System prompt to set context",
        max_length=500
    )
    provider: Optional[str] = Field(None, description="Specific LLM provider to use")
    include_audio_response: Optional[bool] = Field(False, description="Whether to include audio response")
    language: Optional[str] = Field("en-US", description="Language code for audio processing")

class ProcessResponse(BaseModel):
    """Process response payload"""
    response: Optional[str] = Field(None, description="Direct text response")
    response_type: Optional[str] = Field(None, description="Response type: 'text' or 'audio'")
    action: Optional[str] = Field(None, description="Action to perform (e.g., 'take_screenshot')")
    query: Optional[str] = Field(None, description="Query for action processing")
    audio_data: Optional[str] = Field(None, description="Base64-encoded audio response")
    audio_format: Optional[str] = Field(None, description="Audio format (mp3, wav, etc.)")
    processing_time: Optional[float] = Field(None, description="Processing time in seconds")
    intent: Optional[str] = Field(None, description="Detected user intent")
    confidence: Optional[float] = Field(None, description="Intent detection confidence")
    transcription: Optional[str] = Field(None, description="Transcribed text from audio input")



@router.post("/process", response_model=ProcessResponse)
async def process_endpoint(
    request: ProcessRequest,
    llm_service: LLMService = Depends(get_llm_service),
    stt_service: STTService = Depends(get_stt_service),
    tts_service: TTSService = Depends(get_tts_service)
):
    """
    Process unified command with intent recognition
    
    This endpoint handles both text and audio inputs, performs intent recognition,
    and returns either direct responses or action instructions.
    """
    start_time = time.time()
    
    try:
        # Validate input
        if request.input_type not in ["text", "audio"]:
            raise HTTPException(
                status_code=400,
                detail="input_type must be 'text' or 'audio'"
            )
        
        if request.input_type == "text" and not request.text:
            raise HTTPException(
                status_code=400,
                detail="text field is required when input_type is 'text'"
            )
        
        if request.input_type == "audio" and not request.audio_data:
            raise HTTPException(
                status_code=400,
                detail="audio_data field is required when input_type is 'audio'"
            )
        
        # Process audio input if needed
        user_text = request.text
        transcription_confidence = None
        
        if request.input_type == "audio":
            if not stt_service.is_available():
                raise HTTPException(
                    status_code=503,
                    detail="Speech-to-Text service not available"
                )
            
            try:
                audio_bytes = base64.b64decode(request.audio_data)
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid audio data: {str(e)}"
                )
            
            # Transcribe audio
            transcription_result = await stt_service.transcribe_audio(
                audio_data=audio_bytes,
                audio_format="webm",  # Default format from frontend MediaRecorder
                language_code=request.language
            )
            
            user_text = transcription_result["text"]
            transcription_confidence = transcription_result["confidence"]
            
            if not user_text.strip():
                raise HTTPException(
                    status_code=400,
                    detail="No speech detected in audio"
                )
        
        # Classify intent using enhanced service
        intent_service = get_intent_service(llm_service)
        intent_result = await intent_service.classify_intent(user_text, use_llm=True)
        
        # Handle different intents
        if intent_result["action"]:
            # Return action instruction
            processing_time = time.time() - start_time

            return ProcessResponse(
                action=intent_result["action"],
                query=intent_result["query"],
                intent=intent_result["intent"],
                confidence=intent_result["confidence"],
                processing_time=processing_time,
                transcription=user_text if request.input_type == "audio" else None
            )
        else:
            # Handle as regular chat
            if not llm_service.is_available():
                raise HTTPException(
                    status_code=503,
                    detail="LLM service not available"
                )
            
            # Prepare conversation history
            conversation_history = []
            if request.conversation_history:
                conversation_history = [
                    {"role": msg["role"], "content": msg["content"]}
                    for msg in request.conversation_history
                ]
            
            # Get LLM response
            if conversation_history:
                llm_response = await llm_service.contextual_chat(
                    user_message=user_text,
                    conversation_history=conversation_history,
                    system_prompt=request.system_prompt,
                    provider=request.provider
                )
                response_text = llm_response["content"]
            else:
                response_text = await llm_service.simple_chat(
                    user_message=user_text,
                    system_prompt=request.system_prompt or "You are AI Copilot, a helpful assistant. Provide clear, concise responses.",
                    provider=request.provider
                )
            
            # Generate audio response if requested
            audio_data = None
            audio_format = None
            
            if request.include_audio_response and response_text and tts_service.is_available():
                try:
                    tts_result = await tts_service.synthesize_speech(
                        text=response_text,
                        language_code=request.language,
                        audio_encoding="mp3"
                    )
                    audio_data = base64.b64encode(tts_result["audio_data"]).decode('utf-8')
                    audio_format = tts_result["audio_format"]
                except Exception as e:
                    print(f"TTS synthesis error: {e}")
                    # Continue without audio response
            
            processing_time = time.time() - start_time
            
            return ProcessResponse(
                response=response_text,
                response_type="audio" if audio_data else "text",
                audio_data=audio_data,
                audio_format=audio_format,
                intent=intent_result["intent"],
                confidence=intent_result["confidence"],
                processing_time=processing_time,
                transcription=user_text if request.input_type == "audio" else None
            )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Process command error: {str(e)}"
        )

@router.get("/process/intents")
async def get_supported_intents():
    """Get list of supported intents and their descriptions"""
    return {
        "intents": [
            {
                "name": "chat",
                "description": "General conversation and questions",
                "examples": ["How are you?", "What's the weather like?", "Help me with this problem"]
            },
            {
                "name": "take_screenshot",
                "description": "Capture a screenshot",
                "examples": ["Take a screenshot", "Capture my screen", "Grab a screen shot"]
            },
            {
                "name": "take_screenshot_and_analyze",
                "description": "Capture and analyze a screenshot",
                "examples": [
                    "Take a screenshot to understand the email I received",
                    "Capture screen and tell me what's happening",
                    "Screenshot and analyze this error message"
                ]
            },
            {
                "name": "open_application",
                "description": "Open an application or program",
                "examples": ["Open Notion", "Launch Chrome", "Start Terminal"]
            }
        ],
        "total_intents": 4
    }

@router.get("/process/status")
async def get_process_status(
    llm_service: LLMService = Depends(get_llm_service),
    stt_service: STTService = Depends(get_stt_service),
    tts_service: TTSService = Depends(get_tts_service)
):
    """Get process service status"""
    return {
        "status": "available",
        "message": "Process command functionality is available",
        "features": {
            "text_processing": llm_service.is_available(),
            "audio_input": stt_service.is_available(),
            "audio_output": tts_service.is_available(),
            "intent_recognition": True,
            "action_commands": True
        },
        "supported_input_types": ["text", "audio"],
        "supported_actions": ["take_screenshot", "open_application"],
        "timestamp": datetime.now().isoformat()
    }
