"""
Google Gemini provider implementation for LLM services
Handles integration with Google Gemini API for chat completions.
"""

import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
import google.generativeai as genai
from .base_provider import BaseLLMProvider, LLMResponse, LLMMessage


class GeminiProvider(BaseLLMProvider):
    """Google Gemini provider for LLM services"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.client = None
        self.api_key = config.get("api_key")
        self.default_model = config.get("model", "gemini-pro")
        self.default_max_tokens = config.get("max_tokens", 1000)
        self.default_temperature = config.get("temperature", 0.7)
    
    async def initialize(self) -> bool:
        """Initialize Gemini client"""
        if not self.validate_config(["api_key"]):
            return False
        
        try:
            genai.configure(api_key=self.api_key)
            self.client = genai.GenerativeModel(self.default_model)
            
            # Test the connection
            test_response = await self._test_connection()
            return test_response
        except Exception as e:
            print(f"Failed to initialize Gemini provider: {e}")
            return False
    
    async def _test_connection(self) -> bool:
        """Test the Gemini API connection"""
        try:
            # Simple test prompt
            response = await self.client.generate_content_async("Hello")
            return True
        except Exception:
            return False
    
    async def chat_completion(
        self,
        messages: List[LLMMessage],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        stream: bool = False
    ) -> LLMResponse:
        """Generate chat completion using Gemini API"""
        if not self.client:
            raise Exception("Gemini provider not initialized")
        
        # Use provided parameters or fall back to defaults
        model = model or self.default_model
        max_tokens = max_tokens or self.default_max_tokens
        temperature = temperature or self.default_temperature
        
        # Convert messages to Gemini format
        gemini_prompt = self._convert_to_gemini_format(messages)
        
        try:
            # Configure generation parameters
            generation_config = genai.types.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
            
            if stream:
                raise NotImplementedError("Use stream_completion for streaming responses")
            
            # Generate response
            response = await self.client.generate_content_async(
                gemini_prompt,
                generation_config=generation_config
            )
            
            return LLMResponse(
                content=response.text,
                role="assistant",
                model=model,
                usage={
                    "prompt_tokens": getattr(response.usage_metadata, 'prompt_token_count', 0),
                    "completion_tokens": getattr(response.usage_metadata, 'candidates_token_count', 0),
                    "total_tokens": getattr(response.usage_metadata, 'total_token_count', 0)
                } if hasattr(response, 'usage_metadata') else None,
                finish_reason=response.candidates[0].finish_reason.name if response.candidates else "stop",
                provider="gemini"
            )
            
        except Exception as e:
            raise Exception(f"Gemini API error: {str(e)}")
    
    async def stream_completion(
        self,
        messages: List[LLMMessage],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion tokens"""
        if not self.client:
            raise Exception("Gemini provider not initialized")
        
        # Use provided parameters or fall back to defaults
        model = model or self.default_model
        max_tokens = max_tokens or self.default_max_tokens
        temperature = temperature or self.default_temperature
        
        # Convert messages to Gemini format
        gemini_prompt = self._convert_to_gemini_format(messages)
        
        try:
            # Configure generation parameters
            generation_config = genai.types.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
            
            # Generate streaming response
            response = await self.client.generate_content_async(
                gemini_prompt,
                generation_config=generation_config,
                stream=True
            )
            
            async for chunk in response:
                if chunk.text:
                    yield chunk.text
                    
        except Exception as e:
            raise Exception(f"Gemini streaming error: {str(e)}")
    
    def _convert_to_gemini_format(self, messages: List[LLMMessage]) -> str:
        """Convert messages to Gemini prompt format"""
        # Gemini uses a simpler prompt format
        # We'll combine all messages into a single prompt
        prompt_parts = []
        
        for message in messages:
            if message.role == "system":
                prompt_parts.append(f"System: {message.content}")
            elif message.role == "user":
                prompt_parts.append(f"User: {message.content}")
            elif message.role == "assistant":
                prompt_parts.append(f"Assistant: {message.content}")
        
        return "\n\n".join(prompt_parts)
    
    def get_available_models(self) -> List[str]:
        """Get list of available Gemini models"""
        return [
            "gemini-pro",
            "gemini-pro-vision",
            "gemini-1.5-pro",
            "gemini-1.5-flash"
        ]
    
    def is_available(self) -> bool:
        """Check if Gemini provider is available"""
        return self.client is not None and self.api_key is not None
    
    def get_default_model(self) -> str:
        """Get the default Gemini model"""
        return self.default_model
