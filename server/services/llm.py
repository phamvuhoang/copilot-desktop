"""
Large Language Model (LLM) service for AI Copilot Desktop
Handles integration with OpenAI API for chat completions.
"""

import asyncio
from typing import List, Dict, Any, Optional
from openai import AsyncOpenAI
from config.settings import get_settings, get_openai_config

settings = get_settings()

class LLMService:
    """Service for handling LLM interactions with OpenAI"""
    
    def __init__(self):
        self.client = None
        self.config = get_openai_config()
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize OpenAI client"""
        if self.config["api_key"] and self.config["api_key"] != "demo_key_replace_with_real_key":
            self.client = AsyncOpenAI(api_key=self.config["api_key"])
        else:
            print("Warning: OpenAI API key not configured. Using demo mode.")
    
    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        stream: bool = False
    ) -> Dict[str, Any]:
        """
        Generate chat completion using OpenAI API
        
        Args:
            messages: List of message objects with 'role' and 'content'
            model: Model to use (defaults to configured model)
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            stream: Whether to stream the response
            
        Returns:
            Dict containing the response and metadata
        """
        if not self.client:
            # Return demo response when API is not available
            return await self._get_demo_response(messages)
        
        try:
            # Use provided parameters or fall back to config defaults
            model = model or self.config["model"]
            max_tokens = max_tokens or self.config["max_tokens"]
            temperature = temperature or self.config["temperature"]
            
            # Make API call
            response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stream=stream
            )
            
            if stream:
                return {"stream": response}
            else:
                return {
                    "content": response.choices[0].message.content,
                    "role": response.choices[0].message.role,
                    "model": response.model,
                    "usage": {
                        "prompt_tokens": response.usage.prompt_tokens,
                        "completion_tokens": response.usage.completion_tokens,
                        "total_tokens": response.usage.total_tokens
                    },
                    "finish_reason": response.choices[0].finish_reason
                }
                
        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")

    async def _get_demo_response(self, messages: List[Dict[str, str]]) -> Dict[str, Any]:
        """Generate demo response when OpenAI API is not available"""
        import asyncio
        import random

        # Simulate API delay
        await asyncio.sleep(0.5 + random.random())

        # Get the last user message
        user_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_message = msg.get("content", "")
                break

        # Generate contextual demo responses
        demo_responses = [
            f"I understand you're asking about: '{user_message[:50]}...' This is a demo response since no OpenAI API key is configured.",
            "I'm currently running in demo mode. To get real AI responses, please configure your OpenAI API key in the server/.env file.",
            f"Thank you for your message. In demo mode, I can acknowledge your input: '{user_message[:30]}...' but cannot provide intelligent responses without a proper API key.",
            "I'm AI Copilot running in demonstration mode. The interface is working correctly, but I need an OpenAI API key to provide real assistance.",
            f"Your message '{user_message[:40]}...' has been received. This is a simulated response - configure OPENAI_API_KEY for real AI interactions."
        ]

        response_content = random.choice(demo_responses)

        return {
            "content": response_content,
            "role": "assistant",
            "model": "demo-mode",
            "usage": {
                "prompt_tokens": len(user_message.split()),
                "completion_tokens": len(response_content.split()),
                "total_tokens": len(user_message.split()) + len(response_content.split())
            },
            "finish_reason": "stop"
        }

    async def simple_chat(self, user_message: str, system_prompt: Optional[str] = None) -> str:
        """
        Simple chat interface for single message exchanges
        
        Args:
            user_message: The user's message
            system_prompt: Optional system prompt to set context
            
        Returns:
            The assistant's response as a string
        """
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        messages.append({"role": "user", "content": user_message})
        
        response = await self.chat_completion(messages)
        return response["content"]
    
    async def contextual_chat(
        self,
        user_message: str,
        conversation_history: List[Dict[str, str]],
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Chat with conversation context
        
        Args:
            user_message: The current user message
            conversation_history: Previous messages in the conversation
            system_prompt: Optional system prompt
            
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
        
        return await self.chat_completion(messages)
    
    def is_available(self) -> bool:
        """Check if LLM service is available (including demo mode)"""
        return True  # Always available - either real API or demo mode
    
    def get_available_models(self) -> List[str]:
        """Get list of available models"""
        # Common OpenAI models - in production, you might want to fetch this dynamically
        return [
            "gpt-3.5-turbo",
            "gpt-3.5-turbo-16k",
            "gpt-4",
            "gpt-4-32k",
            "gpt-4-turbo-preview",
            "gpt-4-nano"
        ]

# Global LLM service instance
llm_service = LLMService()

async def get_llm_service() -> LLMService:
    """Get LLM service instance"""
    return llm_service
