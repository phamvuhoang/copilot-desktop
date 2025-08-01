"""
Speech-to-Text (STT) service for AI Copilot Desktop
Handles audio transcription using Google Cloud Speech-to-Text API.
"""

import asyncio
import io
from typing import Optional, Dict, Any
from google.cloud import speech
from config.settings import get_settings, get_google_cloud_config, get_stt_config

settings = get_settings()


class STTService:
    """Service for handling Speech-to-Text operations"""
    
    def __init__(self):
        self.client = None
        self.config = get_stt_config()
        self.google_config = get_google_cloud_config()
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Google Cloud Speech client"""
        try:
            if self.google_config["credentials_path"]:
                # Use service account credentials
                import os
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = self.google_config["credentials_path"]
            
            self.client = speech.SpeechClient()
            print("Google Cloud Speech-to-Text client initialized successfully")
        except Exception as e:
            print(f"Failed to initialize STT client: {e}")
            self.client = None
    
    async def transcribe_audio(
        self,
        audio_data: bytes,
        audio_format: str = "wav",
        language_code: Optional[str] = None,
        sample_rate: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Transcribe audio data to text
        
        Args:
            audio_data: Raw audio bytes
            audio_format: Audio format (wav, mp3, etc.)
            language_code: Language code (e.g., 'en-US')
            sample_rate: Audio sample rate in Hz
            
        Returns:
            Dict containing transcription results
        """
        if not self.client:
            raise Exception("STT service not available. Please check Google Cloud configuration.")
        
        try:
            # Configure audio settings
            language_code = language_code or self.config["language_code"]
            sample_rate = sample_rate or self.config["sample_rate_hertz"]
            
            # Determine encoding based on format
            encoding_map = {
                "wav": speech.RecognitionConfig.AudioEncoding.LINEAR16,
                "mp3": speech.RecognitionConfig.AudioEncoding.MP3,
                "flac": speech.RecognitionConfig.AudioEncoding.FLAC,
                "webm": speech.RecognitionConfig.AudioEncoding.WEBM_OPUS
            }
            
            encoding = encoding_map.get(audio_format.lower(), speech.RecognitionConfig.AudioEncoding.LINEAR16)
            
            # Configure recognition
            config = speech.RecognitionConfig(
                encoding=encoding,
                sample_rate_hertz=sample_rate,
                language_code=language_code,
                enable_automatic_punctuation=True,
                enable_word_confidence=True,
                enable_word_time_offsets=True
            )
            
            audio = speech.RecognitionAudio(content=audio_data)
            
            # Perform transcription
            response = self.client.recognize(config=config, audio=audio)
            
            # Process results
            if not response.results:
                return {
                    "text": "",
                    "confidence": 0.0,
                    "alternatives": [],
                    "error": "No speech detected"
                }
            
            # Get the best result
            result = response.results[0]
            alternative = result.alternatives[0]
            
            # Extract word-level information
            words = []
            if hasattr(alternative, 'words'):
                for word_info in alternative.words:
                    words.append({
                        "word": word_info.word,
                        "confidence": word_info.confidence,
                        "start_time": word_info.start_time.total_seconds(),
                        "end_time": word_info.end_time.total_seconds()
                    })
            
            # Prepare alternatives
            alternatives = []
            for alt in result.alternatives:
                alternatives.append({
                    "text": alt.transcript,
                    "confidence": alt.confidence
                })
            
            return {
                "text": alternative.transcript,
                "confidence": alternative.confidence,
                "alternatives": alternatives,
                "words": words,
                "language_code": language_code
            }
            
        except Exception as e:
            raise Exception(f"STT transcription error: {str(e)}")
    
    async def transcribe_streaming(self, audio_stream):
        """
        Transcribe streaming audio (for future implementation)
        
        Args:
            audio_stream: Async audio stream
            
        Yields:
            Partial transcription results
        """
        # Placeholder for streaming transcription
        raise NotImplementedError("Streaming transcription not yet implemented")
    
    def is_available(self) -> bool:
        """Check if STT service is available"""
        return self.client is not None
    
    def get_supported_formats(self) -> list:
        """Get list of supported audio formats"""
        return ["wav", "mp3", "flac", "webm"]
    
    def get_supported_languages(self) -> list:
        """Get list of supported language codes"""
        return [
            "en-US", "en-GB", "en-AU", "en-CA", "en-IN",
            "es-ES", "es-US", "fr-FR", "fr-CA", "de-DE",
            "it-IT", "pt-BR", "pt-PT", "ru-RU", "ja-JP",
            "ko-KR", "zh-CN", "zh-TW", "ar-SA", "hi-IN"
        ]


# Global STT service instance
stt_service = STTService()


async def get_stt_service() -> STTService:
    """Get STT service instance"""
    return stt_service
