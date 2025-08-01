"""
Configuration settings for AI Copilot Desktop API
Manages environment variables and application settings.
"""

import os
from typing import Optional

class Settings:
    """Application settings loaded from environment variables"""

    def __init__(self):
        # Load environment variables
        from dotenv import load_dotenv
        load_dotenv()

        # API Configuration
        self.api_host: str = os.getenv("HOST", "127.0.0.1")
        self.api_port: int = int(os.getenv("PORT", "8000"))
        self.debug: bool = os.getenv("DEBUG", "false").lower() == "true"

        # LLM Provider Configuration
        self.preferred_provider: str = os.getenv("LLM_PROVIDER", "openai")
        self.fallback_enabled: bool = os.getenv("LLM_FALLBACK_ENABLED", "true").lower() == "true"

        # OpenAI Configuration
        self.openai_api_key: Optional[str] = os.getenv("OPENAI_API_KEY")
        self.openai_model: str = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
        self.openai_max_tokens: int = int(os.getenv("OPENAI_MAX_TOKENS", "1000"))
        self.openai_temperature: float = float(os.getenv("OPENAI_TEMPERATURE", "0.7"))
        self.openai_base_url: Optional[str] = os.getenv("OPENAI_BASE_URL")

        # Gemini Configuration
        self.gemini_api_key: Optional[str] = os.getenv("GEMINI_API_KEY")
        self.gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-pro")
        self.gemini_max_tokens: int = int(os.getenv("GEMINI_MAX_TOKENS", "1000"))
        self.gemini_temperature: float = float(os.getenv("GEMINI_TEMPERATURE", "0.7"))

        # Ollama Configuration
        self.ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.ollama_model: str = os.getenv("OLLAMA_MODEL", "llama2")
        self.ollama_max_tokens: int = int(os.getenv("OLLAMA_MAX_TOKENS", "1000"))
        self.ollama_temperature: float = float(os.getenv("OLLAMA_TEMPERATURE", "0.7"))
        self.ollama_timeout: int = int(os.getenv("OLLAMA_TIMEOUT", "60"))

        # Google Cloud Configuration
        self.google_cloud_project_id: Optional[str] = os.getenv("GOOGLE_CLOUD_PROJECT_ID")
        self.google_application_credentials: Optional[str] = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")

        # Speech-to-Text Configuration
        self.stt_language_code: str = os.getenv("STT_LANGUAGE_CODE", "en-US")
        self.stt_sample_rate_hertz: int = int(os.getenv("STT_SAMPLE_RATE_HERTZ", "16000"))
        self.stt_encoding: str = os.getenv("STT_ENCODING", "LINEAR16")

        # Text-to-Speech Configuration
        self.tts_language_code: str = os.getenv("TTS_LANGUAGE_CODE", "en-US")
        self.tts_voice_name: str = os.getenv("TTS_VOICE_NAME", "en-US-Wavenet-D")
        self.tts_audio_encoding: str = os.getenv("TTS_AUDIO_ENCODING", "MP3")

        # Vision API Configuration
        self.vision_max_results: int = int(os.getenv("VISION_MAX_RESULTS", "10"))

        # Security Configuration
        self.cors_origins: list = ["*"]  # In production, specify exact origins

        # Performance Configuration
        self.request_timeout: int = int(os.getenv("REQUEST_TIMEOUT", "30"))
        self.max_file_size: int = int(os.getenv("MAX_FILE_SIZE", str(10 * 1024 * 1024)))  # 10MB

# Create global settings instance
settings = Settings()

def get_settings() -> Settings:
    """Get application settings"""
    return settings

def validate_api_keys():
    """Validate that required API keys are present"""
    missing_keys = []
    
    if not settings.openai_api_key:
        missing_keys.append("OPENAI_API_KEY")
    
    if not settings.google_application_credentials and not settings.google_cloud_project_id:
        missing_keys.append("GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_PROJECT_ID")
    
    if missing_keys:
        print("Warning: Missing API keys for full functionality:")
        for key in missing_keys:
            print(f"  - {key}")
        print("Some features may not work without proper API configuration.")
        return False
    
    return True

def get_llm_providers_config():
    """Get configuration for all LLM providers"""
    return {
        "preferred_provider": settings.preferred_provider,
        "fallback_order": ["openai", "gemini", "ollama"],
        "openai": {
            "enabled": bool(settings.openai_api_key),
            "api_key": settings.openai_api_key,
            "model": settings.openai_model,
            "max_tokens": settings.openai_max_tokens,
            "temperature": settings.openai_temperature,
            "base_url": settings.openai_base_url
        },
        "gemini": {
            "enabled": bool(settings.gemini_api_key),
            "api_key": settings.gemini_api_key,
            "model": settings.gemini_model,
            "max_tokens": settings.gemini_max_tokens,
            "temperature": settings.gemini_temperature
        },
        "ollama": {
            "enabled": True,  # Always enabled if Ollama server is running
            "base_url": settings.ollama_base_url,
            "model": settings.ollama_model,
            "max_tokens": settings.ollama_max_tokens,
            "temperature": settings.ollama_temperature,
            "timeout": settings.ollama_timeout
        }
    }

def get_openai_config():
    """Get OpenAI configuration (legacy support)"""
    return {
        "api_key": settings.openai_api_key,
        "model": settings.openai_model,
        "max_tokens": settings.openai_max_tokens,
        "temperature": settings.openai_temperature
    }

def get_google_cloud_config():
    """Get Google Cloud configuration"""
    return {
        "project_id": settings.google_cloud_project_id,
        "credentials_path": settings.google_application_credentials
    }

def get_stt_config():
    """Get Speech-to-Text configuration"""
    return {
        "language_code": settings.stt_language_code,
        "sample_rate_hertz": settings.stt_sample_rate_hertz,
        "encoding": settings.stt_encoding
    }

def get_tts_config():
    """Get Text-to-Speech configuration"""
    return {
        "language_code": settings.tts_language_code,
        "voice_name": settings.tts_voice_name,
        "audio_encoding": settings.tts_audio_encoding
    }
