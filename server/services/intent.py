"""
Intent Recognition Service for AI Copilot Desktop
Handles classification of user intents for command processing.
"""

import json
import re
from typing import Dict, Any, List, Optional
from .llm import LLMService

class IntentRecognitionService:
    """Service for recognizing user intents from text input"""
    
    def __init__(self, llm_service: Optional[LLMService] = None):
        self.llm_service = llm_service
        self.intent_patterns = self._initialize_patterns()
    
    def _initialize_patterns(self) -> Dict[str, Dict[str, Any]]:
        """Initialize intent recognition patterns"""
        return {
            "take_screenshot_and_analyze": {
                "keywords": [
                    "screenshot", "screen shot", "capture screen", "take a picture",
                    "screen capture", "grab screen", "snap screen", "image of screen"
                ],
                "analysis_keywords": [
                    "analyze", "understand", "explain", "what is", "what does",
                    "tell me about", "describe", "read", "interpret", "help with"
                ],
                "patterns": [
                    r"take.*screenshot.*(analyze|understand|explain|tell me|describe)",
                    r"capture.*screen.*(analyze|understand|explain|tell me|describe)",
                    r"screenshot.*(email|error|message|document|page)",
                    r"(analyze|understand|explain).*screenshot"
                ],
                "confidence_boost": 0.2
            },
            "take_screenshot": {
                "keywords": [
                    "screenshot", "screen shot", "capture screen", "take a picture",
                    "screen capture", "grab screen", "snap screen", "image of screen"
                ],
                "patterns": [
                    r"take.*screenshot",
                    r"capture.*screen",
                    r"grab.*screen",
                    r"snap.*screen"
                ],
                "confidence_boost": 0.1
            },
            "open_application": {
                "keywords": ["open", "launch", "start", "run"],
                "app_keywords": ["app", "application", "program", "software"],
                "common_apps": [
                    "notion", "chrome", "safari", "finder", "terminal", "vscode",
                    "slack", "discord", "spotify", "mail", "calendar", "notes"
                ],
                "patterns": [
                    r"(open|launch|start|run).*(notion|chrome|safari|finder|terminal|vscode|slack|discord|spotify|mail|calendar|notes)",
                    r"(open|launch|start|run).*(app|application|program)"
                ],
                "confidence_boost": 0.15
            },
            "chat": {
                "keywords": [],  # Default fallback
                "patterns": [],
                "confidence_boost": 0.0
            }
        }
    
    async def classify_intent(self, text: str, use_llm: bool = True) -> Dict[str, Any]:
        """
        Classify user intent from text input
        
        Args:
            text: User input text
            use_llm: Whether to use LLM for enhanced classification
            
        Returns:
            Dict with intent, confidence, action, and parameters
        """
        text_lower = text.lower().strip()
        
        # First, try rule-based classification
        rule_based_result = self._rule_based_classification(text_lower)
        
        # If LLM is available and enabled, enhance with LLM classification
        if use_llm and self.llm_service and self.llm_service.is_available():
            try:
                llm_result = await self._llm_based_classification(text)
                # Combine rule-based and LLM results
                return self._combine_classifications(rule_based_result, llm_result, text)
            except Exception as e:
                print(f"LLM intent classification error: {e}")
                # Fall back to rule-based result
                return rule_based_result
        
        return rule_based_result
    
    def _rule_based_classification(self, text_lower: str) -> Dict[str, Any]:
        """Rule-based intent classification using keywords and patterns"""
        
        best_intent = "chat"
        best_confidence = 0.3
        best_params = {}
        
        for intent_name, intent_config in self.intent_patterns.items():
            confidence = 0.0
            
            # Check keywords
            keywords = intent_config.get("keywords", [])
            keyword_matches = sum(1 for keyword in keywords if keyword in text_lower)
            if keywords:
                confidence += (keyword_matches / len(keywords)) * 0.4
            
            # Check additional keyword categories
            if intent_name == "take_screenshot_and_analyze":
                analysis_keywords = intent_config.get("analysis_keywords", [])
                analysis_matches = sum(1 for keyword in analysis_keywords if keyword in text_lower)
                if analysis_matches > 0 and keyword_matches > 0:
                    confidence += 0.4  # Boost for combined screenshot + analysis
            
            elif intent_name == "open_application":
                app_keywords = intent_config.get("app_keywords", [])
                common_apps = intent_config.get("common_apps", [])
                
                app_keyword_matches = sum(1 for keyword in app_keywords if keyword in text_lower)
                app_name_matches = sum(1 for app in common_apps if app in text_lower)
                
                if app_keyword_matches > 0 or app_name_matches > 0:
                    confidence += 0.3
            
            # Check regex patterns
            patterns = intent_config.get("patterns", [])
            for pattern in patterns:
                if re.search(pattern, text_lower):
                    confidence += 0.3
                    break
            
            # Apply confidence boost
            confidence += intent_config.get("confidence_boost", 0.0)
            
            # Update best match
            if confidence > best_confidence:
                best_intent = intent_name
                best_confidence = confidence
                best_params = self._extract_parameters(intent_name, text_lower)
        
        # Generate action and query based on intent
        action, query = self._generate_action_query(best_intent, text_lower, best_params)
        
        return {
            "intent": best_intent,
            "confidence": min(best_confidence, 1.0),
            "action": action,
            "query": query,
            "parameters": best_params,
            "method": "rule_based"
        }
    
    async def _llm_based_classification(self, text: str) -> Dict[str, Any]:
        """LLM-based intent classification for enhanced accuracy"""
        
        system_prompt = """You are an intent classifier for an AI desktop assistant. 
Classify the user's intent into one of these categories:

1. "take_screenshot_and_analyze" - User wants to capture a screenshot and analyze it
2. "take_screenshot" - User wants to capture a screenshot only
3. "open_application" - User wants to open/launch an application
4. "chat" - General conversation or questions

Respond with a JSON object containing:
- "intent": the classified intent
- "confidence": confidence score (0.0 to 1.0)
- "reasoning": brief explanation of classification
- "extracted_info": any relevant extracted information

Examples:
- "take a screenshot to understand this email" → take_screenshot_and_analyze
- "capture my screen" → take_screenshot  
- "open Notion" → open_application
- "what's the weather?" → chat"""

        try:
            response = await self.llm_service.simple_chat(
                user_message=f"Classify this user input: '{text}'",
                system_prompt=system_prompt
            )
            
            # Try to parse JSON response
            try:
                result = json.loads(response)
                return {
                    "intent": result.get("intent", "chat"),
                    "confidence": result.get("confidence", 0.7),
                    "reasoning": result.get("reasoning", ""),
                    "extracted_info": result.get("extracted_info", {}),
                    "method": "llm_based"
                }
            except json.JSONDecodeError:
                # If JSON parsing fails, extract intent from text response
                intent = self._extract_intent_from_text(response)
                return {
                    "intent": intent,
                    "confidence": 0.6,
                    "reasoning": response,
                    "extracted_info": {},
                    "method": "llm_text_based"
                }
                
        except Exception as e:
            raise Exception(f"LLM classification failed: {str(e)}")
    
    def _extract_intent_from_text(self, response: str) -> str:
        """Extract intent from LLM text response"""
        response_lower = response.lower()
        
        if "take_screenshot_and_analyze" in response_lower or "screenshot.*analyz" in response_lower:
            return "take_screenshot_and_analyze"
        elif "take_screenshot" in response_lower or "screenshot" in response_lower:
            return "take_screenshot"
        elif "open_application" in response_lower or "open.*app" in response_lower:
            return "open_application"
        else:
            return "chat"
    
    def _combine_classifications(self, rule_result: Dict[str, Any], llm_result: Dict[str, Any], original_text: str) -> Dict[str, Any]:
        """Combine rule-based and LLM classification results"""
        
        # If both agree, use higher confidence
        if rule_result["intent"] == llm_result["intent"]:
            combined_confidence = max(rule_result["confidence"], llm_result["confidence"])
            combined_confidence = min(combined_confidence + 0.1, 1.0)  # Boost for agreement
            
            return {
                "intent": rule_result["intent"],
                "confidence": combined_confidence,
                "action": rule_result["action"],
                "query": rule_result["query"],
                "parameters": rule_result["parameters"],
                "method": "combined",
                "llm_reasoning": llm_result.get("reasoning", "")
            }
        
        # If they disagree, use the one with higher confidence
        if llm_result["confidence"] > rule_result["confidence"]:
            action, query = self._generate_action_query(llm_result["intent"], original_text.lower(), {})
            return {
                "intent": llm_result["intent"],
                "confidence": llm_result["confidence"],
                "action": action,
                "query": query,
                "parameters": llm_result.get("extracted_info", {}),
                "method": "llm_preferred",
                "llm_reasoning": llm_result.get("reasoning", "")
            }
        else:
            return {
                **rule_result,
                "method": "rule_preferred",
                "llm_reasoning": llm_result.get("reasoning", "")
            }
    
    def _extract_parameters(self, intent: str, text: str) -> Dict[str, Any]:
        """Extract parameters specific to each intent"""
        params = {}
        
        if intent == "open_application":
            # Extract application name
            common_apps = self.intent_patterns["open_application"]["common_apps"]
            for app in common_apps:
                if app in text:
                    params["application_name"] = app
                    break
            
            # If no common app found, try to extract from context
            if "application_name" not in params:
                words = text.split()
                for i, word in enumerate(words):
                    if word in ["open", "launch", "start", "run"] and i + 1 < len(words):
                        params["application_name"] = words[i + 1]
                        break
        
        elif intent in ["take_screenshot", "take_screenshot_and_analyze"]:
            params["auto_capture"] = True
            if intent == "take_screenshot_and_analyze":
                params["analysis_query"] = text
            else:
                params["analysis_query"] = "What do you see in this screenshot?"
        
        return params
    
    def _generate_action_query(self, intent: str, text: str, params: Dict[str, Any]) -> tuple[Optional[str], Optional[str]]:
        """Generate action and query based on intent"""
        
        if intent == "take_screenshot_and_analyze":
            return "take_screenshot", text
        elif intent == "take_screenshot":
            return "take_screenshot", "What do you see in this screenshot?"
        elif intent == "open_application":
            return "open_application", text
        else:
            return None, None

# Dependency injection function
_intent_service = None

def get_intent_service(llm_service: Optional[LLMService] = None) -> IntentRecognitionService:
    """Get intent recognition service instance"""
    global _intent_service
    if _intent_service is None:
        _intent_service = IntentRecognitionService(llm_service)
    return _intent_service
