"""
Provider manager for LLM services
Manages multiple LLM providers and handles provider selection and fallback.
"""

import asyncio
from typing import List, Dict, Any, Optional, Type
from .base_provider import BaseLLMProvider, LLMResponse, LLMMessage
from .openai_provider import OpenAIProvider
from .gemini_provider import GeminiProvider
from .ollama_provider import OllamaProvider


class ProviderManager:
    """Manages multiple LLM providers"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.providers: Dict[str, BaseLLMProvider] = {}
        self.active_provider: Optional[str] = None
        self.fallback_order: List[str] = []
        
        # Register available providers
        self.provider_classes: Dict[str, Type[BaseLLMProvider]] = {
            "openai": OpenAIProvider,
            "gemini": GeminiProvider,
            "ollama": OllamaProvider
        }
    
    async def initialize(self) -> bool:
        """Initialize all configured providers"""
        success_count = 0
        
        # Initialize providers based on configuration
        for provider_name, provider_class in self.provider_classes.items():
            provider_config = self.config.get(provider_name, {})
            
            if provider_config.get("enabled", False):
                try:
                    provider = provider_class(provider_config)
                    if await provider.initialize():
                        self.providers[provider_name] = provider
                        success_count += 1
                        print(f"Successfully initialized {provider_name} provider")
                    else:
                        print(f"Failed to initialize {provider_name} provider")
                except Exception as e:
                    print(f"Error initializing {provider_name} provider: {e}")
        
        # Set active provider and fallback order
        self._setup_provider_order()
        
        return success_count > 0
    
    def _setup_provider_order(self):
        """Setup active provider and fallback order based on configuration and availability"""
        # Get preferred provider from config
        preferred_provider = self.config.get("preferred_provider", "openai")
        
        # Set active provider
        if preferred_provider in self.providers:
            self.active_provider = preferred_provider
        elif self.providers:
            # Use first available provider
            self.active_provider = list(self.providers.keys())[0]
        
        # Setup fallback order (excluding active provider)
        priority_order = self.config.get("fallback_order", ["openai", "gemini", "ollama"])
        self.fallback_order = [
            provider for provider in priority_order 
            if provider in self.providers and provider != self.active_provider
        ]
        
        print(f"Active provider: {self.active_provider}")
        print(f"Fallback order: {self.fallback_order}")
    
    async def chat_completion(
        self,
        messages: List[LLMMessage],
        provider: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        stream: bool = False,
        use_fallback: bool = True
    ) -> LLMResponse:
        """
        Generate chat completion using specified or active provider
        
        Args:
            messages: List of conversation messages
            provider: Specific provider to use (optional)
            model: Model to use (provider-specific)
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            stream: Whether to stream the response
            use_fallback: Whether to try fallback providers on failure
            
        Returns:
            LLMResponse object
        """
        # Determine which provider to use
        target_provider = provider or self.active_provider
        
        if not target_provider or target_provider not in self.providers:
            raise Exception(f"Provider '{target_provider}' not available")
        
        # Try the target provider
        try:
            return await self.providers[target_provider].chat_completion(
                messages, model, max_tokens, temperature, stream
            )
        except Exception as e:
            print(f"Error with {target_provider} provider: {e}")
            
            # Try fallback providers if enabled
            if use_fallback and not provider:  # Only use fallback if no specific provider was requested
                for fallback_provider in self.fallback_order:
                    try:
                        print(f"Trying fallback provider: {fallback_provider}")
                        return await self.providers[fallback_provider].chat_completion(
                            messages, model, max_tokens, temperature, stream
                        )
                    except Exception as fallback_error:
                        print(f"Fallback provider {fallback_provider} also failed: {fallback_error}")
                        continue
            
            # If all providers failed, raise the original error
            raise e
    
    async def stream_completion(
        self,
        messages: List[LLMMessage],
        provider: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None
    ):
        """Stream chat completion using specified or active provider"""
        target_provider = provider or self.active_provider
        
        if not target_provider or target_provider not in self.providers:
            raise Exception(f"Provider '{target_provider}' not available")
        
        return self.providers[target_provider].stream_completion(
            messages, model, max_tokens, temperature
        )
    
    def get_available_providers(self) -> List[str]:
        """Get list of available providers"""
        return list(self.providers.keys())
    
    def get_provider_info(self, provider_name: Optional[str] = None) -> Dict[str, Any]:
        """Get information about a specific provider or all providers"""
        if provider_name:
            if provider_name in self.providers:
                return self.providers[provider_name].get_provider_info()
            else:
                return {"error": f"Provider '{provider_name}' not found"}
        else:
            return {
                name: provider.get_provider_info() 
                for name, provider in self.providers.items()
            }
    
    def set_active_provider(self, provider_name: str) -> bool:
        """Set the active provider"""
        if provider_name in self.providers:
            self.active_provider = provider_name
            # Update fallback order to exclude new active provider
            self.fallback_order = [
                p for p in self.fallback_order if p != provider_name
            ]
            return True
        return False
    
    def get_active_provider(self) -> Optional[str]:
        """Get the currently active provider"""
        return self.active_provider
    
    def is_available(self) -> bool:
        """Check if any provider is available"""
        return len(self.providers) > 0 and self.active_provider is not None
