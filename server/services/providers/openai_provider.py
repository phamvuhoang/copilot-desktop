"""
OpenAI provider implementation for LLM services
Handles integration with OpenAI API for chat completions.
"""

import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
from openai import AsyncOpenAI
from .base_provider import BaseLLMProvider, LLMResponse, LLMMessage


class OpenAIProvider(BaseLLMProvider):
    """OpenAI provider for LLM services"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.client = None
        self.api_key = config.get("api_key")
        self.base_url = config.get("base_url")  # For custom OpenAI-compatible endpoints
        self.default_model = config.get("model", "gpt-3.5-turbo")
        self.default_max_tokens = config.get("max_tokens", 1000)
        self.default_temperature = config.get("temperature", 0.7)
    
    async def initialize(self) -> bool:
        """Initialize OpenAI client"""
        if not self.validate_config(["api_key"]):
            return False
        
        try:
            client_kwargs = {"api_key": self.api_key}
            if self.base_url:
                client_kwargs["base_url"] = self.base_url
            
            self.client = AsyncOpenAI(**client_kwargs)
            
            # Test the connection by listing models
            await self.client.models.list()
            return True
        except Exception as e:
            print(f"Failed to initialize OpenAI provider: {e}")
            return False
    
    async def chat_completion(
        self,
        messages: List[LLMMessage],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        stream: bool = False
    ) -> LLMResponse:
        """Generate chat completion using OpenAI API"""
        if not self.client:
            raise Exception("OpenAI provider not initialized")
        
        # Use provided parameters or fall back to defaults
        model = model or self.default_model
        max_tokens = max_tokens or self.default_max_tokens
        temperature = temperature or self.default_temperature
        
        # Convert messages to OpenAI format
        openai_messages = self._convert_messages(messages)
        
        try:
            response = await self.client.chat.completions.create(
                model=model,
                messages=openai_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=stream
            )
            
            if stream:
                # For streaming, we'll handle this differently
                raise NotImplementedError("Use stream_completion for streaming responses")
            
            return LLMResponse(
                content=response.choices[0].message.content,
                role=response.choices[0].message.role,
                model=response.model,
                usage={
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                } if response.usage else None,
                finish_reason=response.choices[0].finish_reason,
                provider="openai"
            )
            
        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")
    
    async def stream_completion(
        self,
        messages: List[LLMMessage],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion tokens"""
        if not self.client:
            raise Exception("OpenAI provider not initialized")
        
        # Use provided parameters or fall back to defaults
        model = model or self.default_model
        max_tokens = max_tokens or self.default_max_tokens
        temperature = temperature or self.default_temperature
        
        # Convert messages to OpenAI format
        openai_messages = self._convert_messages(messages)
        
        try:
            stream = await self.client.chat.completions.create(
                model=model,
                messages=openai_messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=True
            )
            
            async for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    yield chunk.choices[0].delta.content
                    
        except Exception as e:
            raise Exception(f"OpenAI streaming error: {str(e)}")
    
    def get_available_models(self) -> List[str]:
        """Get list of available OpenAI models"""
        return [
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-16k",
            "gpt-4",
            "gpt-4-32k",
            "gpt-4-turbo-preview",
            "gpt-4o",
            "gpt-4o-mini"
        ]
    
    def is_available(self) -> bool:
        """Check if OpenAI provider is available"""
        return self.client is not None and self.api_key is not None
    
    def get_default_model(self) -> str:
        """Get the default OpenAI model"""
        return self.default_model
