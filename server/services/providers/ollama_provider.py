"""
Ollama provider implementation for LLM services
Handles integration with local Ollama API for chat completions.
"""

import asyncio
import aiohttp
from typing import List, Dict, Any, Optional, AsyncGenerator
from .base_provider import BaseLLMProvider, LLMResponse, LLMMessage


class OllamaProvider(BaseLLMProvider):
    """Ollama provider for local LLM services"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.base_url = config.get("base_url", "http://localhost:11434")
        self.default_model = config.get("model", "llama2")
        self.default_max_tokens = config.get("max_tokens", 1000)
        self.default_temperature = config.get("temperature", 0.7)
        self.timeout = config.get("timeout", 60)
        self.available_models = []
        self.is_initialized = False
    
    async def initialize(self) -> bool:
        """Initialize Ollama client and fetch available models"""
        try:
            # Test connection and get available models
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
                async with session.get(f"{self.base_url}/api/tags") as response:
                    if response.status == 200:
                        data = await response.json()
                        self.available_models = [model["name"] for model in data.get("models", [])]
                        self.is_initialized = True
                        return True
                    else:
                        print(f"Failed to connect to Ollama: HTTP {response.status}")
                        return False
        except Exception as e:
            print(f"Failed to initialize Ollama provider: {e}")
            return False
    
    async def chat_completion(
        self,
        messages: List[LLMMessage],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        stream: bool = False
    ) -> LLMResponse:
        """Generate chat completion using Ollama API"""
        if not self.is_initialized:
            raise Exception("Ollama provider not initialized")
        
        # Use provided parameters or fall back to defaults
        model = model or self.default_model
        max_tokens = max_tokens or self.default_max_tokens
        temperature = temperature or self.default_temperature
        
        # Convert messages to Ollama format
        ollama_messages = self._convert_messages(messages)
        
        # Prepare request payload
        payload = {
            "model": model,
            "messages": ollama_messages,
            "stream": False,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature
            }
        }
        
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.timeout)) as session:
                async with session.post(f"{self.base_url}/api/chat", json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        return LLMResponse(
                            content=data["message"]["content"],
                            role=data["message"]["role"],
                            model=data["model"],
                            usage={
                                "prompt_tokens": data.get("prompt_eval_count", 0),
                                "completion_tokens": data.get("eval_count", 0),
                                "total_tokens": data.get("prompt_eval_count", 0) + data.get("eval_count", 0)
                            },
                            finish_reason="stop",
                            provider="ollama"
                        )
                    else:
                        error_text = await response.text()
                        raise Exception(f"Ollama API error: HTTP {response.status} - {error_text}")
                        
        except Exception as e:
            raise Exception(f"Ollama API error: {str(e)}")
    
    async def stream_completion(
        self,
        messages: List[LLMMessage],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None
    ) -> AsyncGenerator[str, None]:
        """Stream chat completion tokens"""
        if not self.is_initialized:
            raise Exception("Ollama provider not initialized")
        
        # Use provided parameters or fall back to defaults
        model = model or self.default_model
        max_tokens = max_tokens or self.default_max_tokens
        temperature = temperature or self.default_temperature
        
        # Convert messages to Ollama format
        ollama_messages = self._convert_messages(messages)
        
        # Prepare request payload
        payload = {
            "model": model,
            "messages": ollama_messages,
            "stream": True,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature
            }
        }
        
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.timeout)) as session:
                async with session.post(f"{self.base_url}/api/chat", json=payload) as response:
                    if response.status == 200:
                        async for line in response.content:
                            if line:
                                try:
                                    import json
                                    data = json.loads(line.decode('utf-8'))
                                    if "message" in data and "content" in data["message"]:
                                        content = data["message"]["content"]
                                        if content:
                                            yield content
                                except json.JSONDecodeError:
                                    continue
                    else:
                        error_text = await response.text()
                        raise Exception(f"Ollama streaming error: HTTP {response.status} - {error_text}")
                        
        except Exception as e:
            raise Exception(f"Ollama streaming error: {str(e)}")
    
    def get_available_models(self) -> List[str]:
        """Get list of available Ollama models"""
        if self.available_models:
            return self.available_models
        else:
            # Return common Ollama models as fallback
            return [
                "llama2",
                "llama2:13b",
                "llama2:70b",
                "codellama",
                "mistral",
                "mixtral",
                "phi",
                "neural-chat",
                "starling-lm"
            ]
    
    def is_available(self) -> bool:
        """Check if Ollama provider is available"""
        return self.is_initialized
    
    def get_default_model(self) -> str:
        """Get the default Ollama model"""
        return self.default_model
    
    async def pull_model(self, model_name: str) -> bool:
        """Pull a model from Ollama registry"""
        if not self.is_initialized:
            return False
        
        try:
            payload = {"name": model_name}
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=300)) as session:
                async with session.post(f"{self.base_url}/api/pull", json=payload) as response:
                    return response.status == 200
        except Exception as e:
            print(f"Failed to pull model {model_name}: {e}")
            return False
