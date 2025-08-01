"""
Text-to-Speech (TTS) service for AI Copilot Desktop
Handles audio synthesis using Google Cloud Text-to-Speech API.
"""

import asyncio
import io
from typing import Optional, Dict, Any
from google.cloud import texttospeech
from config.settings import get_settings, get_google_cloud_config, get_tts_config

settings = get_settings()


class TTSService:
    """Service for handling Text-to-Speech operations"""
    
    def __init__(self):
        self.client = None
        self.config = get_tts_config()
        self.google_config = get_google_cloud_config()
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Google Cloud Text-to-Speech client"""
        try:
            if self.google_config["credentials_path"]:
                # Use service account credentials
                import os
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = self.google_config["credentials_path"]
            
            self.client = texttospeech.TextToSpeechClient()
            print("Google Cloud Text-to-Speech client initialized successfully")
        except Exception as e:
            print(f"Failed to initialize TTS client: {e}")
            self.client = None
    
    async def synthesize_speech(
        self,
        text: str,
        language_code: Optional[str] = None,
        voice_name: Optional[str] = None,
        audio_encoding: Optional[str] = None,
        speaking_rate: Optional[float] = None,
        pitch: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Synthesize speech from text
        
        Args:
            text: Text to synthesize
            language_code: Language code (e.g., 'en-US')
            voice_name: Specific voice name
            audio_encoding: Audio encoding format
            speaking_rate: Speaking rate (0.25 to 4.0)
            pitch: Voice pitch (-20.0 to 20.0)
            
        Returns:
            Dict containing audio data and metadata
        """
        if not self.client:
            raise Exception("TTS service not available. Please check Google Cloud configuration.")
        
        try:
            # Configure synthesis input
            synthesis_input = texttospeech.SynthesisInput(text=text)
            
            # Configure voice settings
            language_code = language_code or self.config["language_code"]
            voice_name = voice_name or self.config["voice_name"]
            
            voice = texttospeech.VoiceSelectionParams(
                language_code=language_code,
                name=voice_name
            )
            
            # Configure audio settings
            encoding_map = {
                "mp3": texttospeech.AudioEncoding.MP3,
                "wav": texttospeech.AudioEncoding.LINEAR16,
                "ogg": texttospeech.AudioEncoding.OGG_OPUS
            }
            
            audio_encoding = audio_encoding or self.config["audio_encoding"]
            encoding = encoding_map.get(audio_encoding.lower(), texttospeech.AudioEncoding.MP3)
            
            audio_config = texttospeech.AudioConfig(
                audio_encoding=encoding,
                speaking_rate=speaking_rate or 1.0,
                pitch=pitch or 0.0
            )
            
            # Perform synthesis
            response = self.client.synthesize_speech(
                input=synthesis_input,
                voice=voice,
                audio_config=audio_config
            )
            
            return {
                "audio_data": response.audio_content,
                "audio_format": audio_encoding.lower(),
                "language_code": language_code,
                "voice_name": voice_name,
                "text": text,
                "duration_estimate": len(text) * 0.1  # Rough estimate: 100ms per character
            }
            
        except Exception as e:
            raise Exception(f"TTS synthesis error: {str(e)}")
    
    async def get_available_voices(self, language_code: Optional[str] = None) -> list:
        """
        Get list of available voices
        
        Args:
            language_code: Filter by language code
            
        Returns:
            List of available voices
        """
        if not self.client:
            raise Exception("TTS service not available. Please check Google Cloud configuration.")
        
        try:
            response = self.client.list_voices()
            voices = []
            
            for voice in response.voices:
                # Filter by language if specified
                if language_code and language_code not in voice.language_codes:
                    continue
                
                voices.append({
                    "name": voice.name,
                    "language_codes": list(voice.language_codes),
                    "gender": voice.ssml_gender.name,
                    "natural_sample_rate": voice.natural_sample_rate_hertz
                })
            
            return voices
            
        except Exception as e:
            raise Exception(f"Failed to get available voices: {str(e)}")
    
    def is_available(self) -> bool:
        """Check if TTS service is available"""
        return self.client is not None
    
    def get_supported_formats(self) -> list:
        """Get list of supported audio formats"""
        return ["mp3", "wav", "ogg"]
    
    def get_supported_languages(self) -> list:
        """Get list of supported language codes"""
        return [
            "en-US", "en-GB", "en-AU", "en-CA", "en-IN",
            "es-ES", "es-US", "fr-FR", "fr-CA", "de-DE",
            "it-IT", "pt-BR", "pt-PT", "ru-RU", "ja-JP",
            "ko-KR", "zh-CN", "zh-TW", "ar-SA", "hi-IN",
            "nl-NL", "sv-SE", "da-DK", "no-NO", "fi-FI",
            "pl-PL", "cs-CZ", "sk-SK", "hu-HU", "ro-RO",
            "bg-BG", "hr-HR", "sl-SI", "et-EE", "lv-LV",
            "lt-LT", "mt-MT", "ga-IE", "cy-GB"
        ]
    
    def estimate_audio_duration(self, text: str, speaking_rate: float = 1.0) -> float:
        """
        Estimate audio duration in seconds
        
        Args:
            text: Text to estimate duration for
            speaking_rate: Speaking rate multiplier
            
        Returns:
            Estimated duration in seconds
        """
        # Rough estimation: average 150 words per minute at normal rate
        words = len(text.split())
        base_duration = (words / 150) * 60  # seconds
        return base_duration / speaking_rate


# Global TTS service instance
tts_service = TTSService()


async def get_tts_service() -> TTSService:
    """Get TTS service instance"""
    return tts_service
