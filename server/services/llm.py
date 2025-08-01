"""
Large Language Model (LLM) service for AI Copilot Desktop
Handles integration with multiple LLM providers including OpenAI, Gemini, and Ollama.
"""

import asyncio
from typing import List, Dict, Any, Optional
from config.settings import get_settings, get_llm_providers_config
from .providers import ProviderManager, LLMMessage, LLMResponse

settings = get_settings()

class LLMService:
    """Service for handling LLM interactions with multiple providers"""

    def __init__(self):
        self.provider_manager = None
        self.config = get_llm_providers_config()
        self._initialize_providers()

    def _initialize_providers(self):
        """Initialize provider manager with all configured providers"""
        self.provider_manager = ProviderManager(self.config)

    async def initialize(self):
        """Initialize all providers asynchronously"""
        if self.provider_manager:
            return await self.provider_manager.initialize()
        return False
    
    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        provider: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        stream: bool = False
    ) -> Dict[str, Any]:
        """
        Generate chat completion using specified or active provider

        Args:
            messages: List of message objects with 'role' and 'content'
            provider: Specific provider to use (optional)
            model: Model to use (provider-specific)
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            stream: Whether to stream the response

        Returns:
            Dict containing the response and metadata
        """
        if not self.provider_manager:
            raise Exception("Provider manager not initialized.")

        # Convert dict messages to LLMMessage objects
        llm_messages = [LLMMessage(role=msg["role"], content=msg["content"]) for msg in messages]

        try:
            response = await self.provider_manager.chat_completion(
                messages=llm_messages,
                provider=provider,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=stream
            )

            # Convert LLMResponse back to dict format for compatibility
            return {
                "content": response.content,
                "role": response.role,
                "model": response.model,
                "usage": response.usage,
                "finish_reason": response.finish_reason,
                "provider": response.provider
            }

        except Exception as e:
            raise Exception(f"LLM API error: {str(e)}")



    async def simple_chat(
        self,
        user_message: str,
        system_prompt: Optional[str] = None,
        provider: Optional[str] = None
    ) -> str:
        """
        Simple chat interface for single message exchanges

        Args:
            user_message: The user's message
            system_prompt: Optional system prompt to set context
            provider: Specific provider to use (optional)

        Returns:
            The assistant's response as a string
        """
        messages = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        messages.append({"role": "user", "content": user_message})

        response = await self.chat_completion(messages, provider=provider)
        return response["content"]
    
    async def contextual_chat(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        provider: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Chat with conversation context

        Args:
            user_message: The current user message
            conversation_history: Previous messages in the conversation
            system_prompt: Optional system prompt
            provider: Specific provider to use (optional)

        Returns:
            Complete response with metadata
        """
        messages = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        # Add conversation history
        messages.extend(conversation_history)

        # Add current user message
        messages.append({"role": "user", "content": user_message})

        return await self.chat_completion(messages, provider=provider)
    
    def is_available(self) -> bool:
        """Check if LLM service is available"""
        return self.provider_manager is not None and self.provider_manager.is_available()

    def get_available_models(self) -> List[str]:
        """Get list of available models from all providers"""
        if not self.provider_manager:
            return []

        all_models = []
        for provider_name in self.provider_manager.get_available_providers():
            provider_info = self.provider_manager.get_provider_info(provider_name)
            models = provider_info.get("models", [])
            # Prefix models with provider name for clarity
            prefixed_models = [f"{provider_name}:{model}" for model in models]
            all_models.extend(prefixed_models)

        return all_models

    def get_available_providers(self) -> List[str]:
        """Get list of available providers"""
        if not self.provider_manager:
            return []
        return self.provider_manager.get_available_providers()

    def get_provider_info(self, provider_name: Optional[str] = None) -> Dict[str, Any]:
        """Get information about providers"""
        if not self.provider_manager:
            return {}
        return self.provider_manager.get_provider_info(provider_name)

    def set_active_provider(self, provider_name: str) -> bool:
        """Set the active provider"""
        if not self.provider_manager:
            return False
        return self.provider_manager.set_active_provider(provider_name)

    def get_active_provider(self) -> Optional[str]:
        """Get the currently active provider"""
        if not self.provider_manager:
            return None
        return self.provider_manager.get_active_provider()

# Global LLM service instance
llm_service = LLMService()

async def get_llm_service() -> LLMService:
    """Get LLM service instance and ensure it's initialized"""
    # Initialize providers if not already done
    if not llm_service.is_available():
        await llm_service.initialize()
    return llm_service
