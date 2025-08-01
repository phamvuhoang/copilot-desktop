"""
Base provider interface for LLM services
Defines the common interface that all LLM providers must implement.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, AsyncGenerator
from dataclasses import dataclass


@dataclass
class LLMResponse:
    """Standard response format for all LLM providers"""
    content: str
    role: str = "assistant"
    model: str = ""
    usage: Optional[Dict[str, int]] = None
    finish_reason: str = "stop"
    provider: str = ""


@dataclass
class LLMMessage:
    """Standard message format for all LLM providers"""
    role: str  # "system", "user", "assistant"
    content: str


class BaseLLMProvider(ABC):
    """Abstract base class for all LLM providers"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.provider_name = self.__class__.__name__.replace('Provider', '').lower()
    
    @abstractmethod
    async def initialize(self) -> bool:
        """
        Initialize the provider with configuration
        Returns True if successful, False otherwise
        """
        pass
    
    @abstractmethod
    async def chat_completion(
        self,
        messages: List[LLMMessage],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        stream: bool = False
    ) -> LLMResponse:
        """
        Generate chat completion
        
        Args:
            messages: List of conversation messages
            model: Model to use (provider-specific)
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0.0 to 2.0)
            stream: Whether to stream the response
            
        Returns:
            LLMResponse object with the completion
        """
        pass
    
    @abstractmethod
    async def stream_completion(
        self,
        messages: List[LLMMessage],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream chat completion tokens
        
        Args:
            messages: List of conversation messages
            model: Model to use (provider-specific)
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0.0 to 2.0)
            
        Yields:
            Individual tokens or chunks of the response
        """
        pass
    
    @abstractmethod
    def get_available_models(self) -> List[str]:
        """
        Get list of available models for this provider
        
        Returns:
            List of model names/identifiers
        """
        pass
    
    @abstractmethod
    def is_available(self) -> bool:
        """
        Check if the provider is properly configured and available
        
        Returns:
            True if provider is ready to use, False otherwise
        """
        pass
    
    @abstractmethod
    def get_default_model(self) -> str:
        """
        Get the default model for this provider
        
        Returns:
            Default model name/identifier
        """
        pass
    
    def get_provider_info(self) -> Dict[str, Any]:
        """
        Get information about this provider
        
        Returns:
            Dictionary with provider metadata
        """
        return {
            "name": self.provider_name,
            "available": self.is_available(),
            "models": self.get_available_models(),
            "default_model": self.get_default_model() if self.is_available() else None
        }
    
    def validate_config(self, required_keys: List[str]) -> bool:
        """
        Validate that required configuration keys are present
        
        Args:
            required_keys: List of required configuration keys
            
        Returns:
            True if all required keys are present and non-empty
        """
        for key in required_keys:
            if key not in self.config or not self.config[key]:
                return False
        return True
    
    def _convert_messages(self, messages: List[LLMMessage]) -> List[Dict[str, str]]:
        """
        Convert LLMMessage objects to dictionary format
        
        Args:
            messages: List of LLMMessage objects
            
        Returns:
            List of message dictionaries
        """
        return [{"role": msg.role, "content": msg.content} for msg in messages]
