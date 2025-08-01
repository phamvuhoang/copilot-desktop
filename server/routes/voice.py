"""
Voice API routes for AI Copilot Desktop
Handles voice input/output interactions (Speech-to-Text and Text-to-Speech).
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional
import base64
import io
from services.stt import get_stt_service, STTService
from services.tts import get_tts_service, TTSService
from services.llm import get_llm_service, LLMService

router = APIRouter()

class VoiceRequest(BaseModel):
    """Voice request payload"""
    audio_data: str = Field(..., description="Base64 encoded audio data")
    format: Optional[str] = Field("wav", description="Audio format (wav, mp3, flac, webm)")
    language: Optional[str] = Field("en-US", description="Language code for transcription")
    sample_rate: Optional[int] = Field(16000, description="Audio sample rate in Hz")
    include_audio_response: Optional[bool] = Field(False, description="Include TTS audio in response")
    system_prompt: Optional[str] = Field(None, description="System prompt for LLM")

class TranscriptionRequest(BaseModel):
    """Transcription-only request payload"""
    audio_data: str = Field(..., description="Base64 encoded audio data")
    format: Optional[str] = Field("wav", description="Audio format")
    language: Optional[str] = Field("en-US", description="Language code")
    sample_rate: Optional[int] = Field(16000, description="Audio sample rate in Hz")

class TTSRequest(BaseModel):
    """Text-to-Speech request payload"""
    text: str = Field(..., description="Text to synthesize", max_length=5000)
    language: Optional[str] = Field("en-US", description="Language code")
    voice_name: Optional[str] = Field(None, description="Specific voice name")
    audio_format: Optional[str] = Field("mp3", description="Audio format (mp3, wav, ogg)")
    speaking_rate: Optional[float] = Field(1.0, description="Speaking rate (0.25-4.0)", ge=0.25, le=4.0)
    pitch: Optional[float] = Field(0.0, description="Voice pitch (-20.0 to 20.0)", ge=-20.0, le=20.0)

class VoiceResponse(BaseModel):
    """Voice response payload"""
    transcription: str = Field(..., description="Transcribed text from audio")
    confidence: Optional[float] = Field(None, description="Transcription confidence score")
    llm_response: Optional[str] = Field(None, description="LLM response to transcribed text")
    audio_data: Optional[str] = Field(None, description="Base64 encoded audio response")
    audio_format: Optional[str] = Field(None, description="Audio response format")
    processing_time: Optional[float] = Field(None, description="Total processing time in seconds")

class TranscriptionResponse(BaseModel):
    """Transcription response payload"""
    text: str = Field(..., description="Transcribed text")
    confidence: float = Field(..., description="Confidence score")
    language_code: str = Field(..., description="Detected/used language code")
    alternatives: list = Field(default=[], description="Alternative transcriptions")
    words: list = Field(default=[], description="Word-level timing and confidence")

class TTSResponse(BaseModel):
    """Text-to-Speech response payload"""
    audio_data: str = Field(..., description="Base64 encoded audio data")
    audio_format: str = Field(..., description="Audio format")
    duration_estimate: float = Field(..., description="Estimated audio duration in seconds")
    text: str = Field(..., description="Original text")
    voice_name: str = Field(..., description="Voice used for synthesis")

@router.post("/voice", response_model=VoiceResponse)
async def voice_endpoint(
    request: VoiceRequest,
    stt_service: STTService = Depends(get_stt_service),
    tts_service: TTSService = Depends(get_tts_service),
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    Process voice input and return text/audio response

    This endpoint handles the complete voice interaction flow:
    1. Transcribe audio to text using STT
    2. Process text with LLM
    3. Optionally synthesize response to audio using TTS
    """
    import time
    start_time = time.time()

    try:
        # Check service availability
        if not stt_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Speech-to-Text service not available. Please check Google Cloud configuration."
            )

        # Decode audio data
        try:
            audio_bytes = base64.b64decode(request.audio_data)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid audio data: {str(e)}"
            )

        # Transcribe audio to text
        transcription_result = await stt_service.transcribe_audio(
            audio_data=audio_bytes,
            audio_format=request.format,
            language_code=request.language,
            sample_rate=request.sample_rate
        )

        transcribed_text = transcription_result["text"]
        confidence = transcription_result["confidence"]

        if not transcribed_text.strip():
            raise HTTPException(
                status_code=400,
                detail="No speech detected in audio"
            )

        # Process with LLM
        llm_response = None
        if llm_service.is_available():
            try:
                llm_response = await llm_service.simple_chat(
                    user_message=transcribed_text,
                    system_prompt=request.system_prompt or "You are AI Copilot, a helpful voice assistant. Provide concise, clear responses suitable for audio playback."
                )
            except Exception as e:
                print(f"LLM processing error: {e}")
                llm_response = "I heard you, but I'm having trouble processing your request right now."
        else:
            llm_response = "Voice transcription successful, but LLM service is not available."

        # Optionally synthesize audio response
        audio_data = None
        audio_format = None

        if request.include_audio_response and llm_response and tts_service.is_available():
            try:
                tts_result = await tts_service.synthesize_speech(
                    text=llm_response,
                    language_code=request.language,
                    audio_encoding="mp3"
                )
                audio_data = base64.b64encode(tts_result["audio_data"]).decode('utf-8')
                audio_format = tts_result["audio_format"]
            except Exception as e:
                print(f"TTS synthesis error: {e}")
                # Continue without audio response

        processing_time = time.time() - start_time

        return VoiceResponse(
            transcription=transcribed_text,
            confidence=confidence,
            llm_response=llm_response,
            audio_data=audio_data,
            audio_format=audio_format,
            processing_time=processing_time
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Voice processing error: {str(e)}"
        )

@router.post("/voice/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    request: TranscriptionRequest,
    stt_service: STTService = Depends(get_stt_service)
):
    """
    Transcribe audio to text only (no LLM processing)
    """
    try:
        if not stt_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Speech-to-Text service not available. Please check Google Cloud configuration."
            )

        # Decode audio data
        try:
            audio_bytes = base64.b64decode(request.audio_data)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid audio data: {str(e)}"
            )

        # Transcribe audio
        result = await stt_service.transcribe_audio(
            audio_data=audio_bytes,
            audio_format=request.format,
            language_code=request.language,
            sample_rate=request.sample_rate
        )

        return TranscriptionResponse(
            text=result["text"],
            confidence=result["confidence"],
            language_code=result["language_code"],
            alternatives=result.get("alternatives", []),
            words=result.get("words", [])
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Transcription error: {str(e)}"
        )

@router.post("/voice/synthesize", response_model=TTSResponse)
async def synthesize_speech(
    request: TTSRequest,
    tts_service: TTSService = Depends(get_tts_service)
):
    """
    Synthesize text to speech
    """
    try:
        if not tts_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Text-to-Speech service not available. Please check Google Cloud configuration."
            )

        # Synthesize speech
        result = await tts_service.synthesize_speech(
            text=request.text,
            language_code=request.language,
            voice_name=request.voice_name,
            audio_encoding=request.audio_format,
            speaking_rate=request.speaking_rate,
            pitch=request.pitch
        )

        # Encode audio data to base64
        audio_data_b64 = base64.b64encode(result["audio_data"]).decode('utf-8')

        return TTSResponse(
            audio_data=audio_data_b64,
            audio_format=result["audio_format"],
            duration_estimate=result["duration_estimate"],
            text=result["text"],
            voice_name=result["voice_name"]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Speech synthesis error: {str(e)}"
        )

@router.get("/voice/voices")
async def get_available_voices(
    language: Optional[str] = None,
    tts_service: TTSService = Depends(get_tts_service)
):
    """Get list of available TTS voices"""
    try:
        if not tts_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Text-to-Speech service not available."
            )

        voices = await tts_service.get_available_voices(language)
        return {
            "voices": voices,
            "total_count": len(voices),
            "language_filter": language
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get voices: {str(e)}"
        )

@router.get("/voice/status")
async def get_voice_status(
    stt_service: STTService = Depends(get_stt_service),
    tts_service: TTSService = Depends(get_tts_service)
):
    """Get voice service status"""
    stt_available = stt_service.is_available()
    tts_available = tts_service.is_available()

    return {
        "status": "available" if (stt_available and tts_available) else "partial" if (stt_available or tts_available) else "unavailable",
        "services": {
            "speech_to_text": {
                "available": stt_available,
                "supported_formats": stt_service.get_supported_formats() if stt_available else [],
                "supported_languages": stt_service.get_supported_languages() if stt_available else []
            },
            "text_to_speech": {
                "available": tts_available,
                "supported_formats": tts_service.get_supported_formats() if tts_available else [],
                "supported_languages": tts_service.get_supported_languages() if tts_available else []
            }
        },
        "endpoints": {
            "full_voice_interaction": "/api/v1/voice",
            "transcription_only": "/api/v1/voice/transcribe",
            "synthesis_only": "/api/v1/voice/synthesize",
            "available_voices": "/api/v1/voice/voices"
        }
    }
