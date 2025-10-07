from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import base64
import logging
from typing import List, Dict, Any, Optional
from services.ocr import get_ocr_service, OCRService
from services.llm import get_llm_service, LLMService

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

class ActiveWindow(BaseModel):
    appName: str = None
    windowTitle: str = None
    fullTitle: str = None

class ImageData(BaseModel):
    image_data: str
    monitored_apps: List[str] = ['chrome', 'slack']  # Default apps to monitor
    active_window: Optional[ActiveWindow] = None  # Active window info for better app detection

class Message(BaseModel):
    sender: str
    snippet: str
    location: dict
    app: str = 'unknown'

def _normalize_app_name(app_name: str) -> str:
    """
    Normalize app name to standard format across different platforms.

    Handles variations like:
    - "Google Chrome" vs "chrome.exe" vs "google-chrome" → "chrome"
    - "Microsoft Teams" vs "teams.exe" → "teams"
    - Case variations and file extensions

    Args:
        app_name: Raw app name from OS

    Returns:
        Normalized app name in lowercase
    """
    if not app_name:
        return 'unknown'

    # Convert to lowercase and strip whitespace
    normalized = app_name.lower().strip()

    # Remove common file extensions
    for ext in ['.exe', '.app', '.AppImage', '.desktop']:
        if normalized.endswith(ext.lower()):
            normalized = normalized[:-len(ext)]

    # Handle common app name variations
    app_variations = {
        # Browsers
        'google chrome': 'chrome',
        'google-chrome': 'chrome',
        'chrome': 'chrome',
        'chromium': 'chrome',
        'chromium-browser': 'chrome',
        'firefox': 'firefox',
        'mozilla firefox': 'firefox',
        'msedge': 'chrome',  # Edge is Chromium-based, treat similarly
        'microsoft edge': 'chrome',
        'safari': 'safari',

        # Messaging apps
        'slack': 'slack',
        'discord': 'discord',
        'microsoft teams': 'teams',
        'teams': 'teams',
        'microsoft outlook': 'outlook',
        'outlook': 'outlook',
        'whatsapp': 'whatsapp',
        'telegram': 'telegram',
        'telegram desktop': 'telegram',
        'signal': 'signal',
        'zoom': 'zoom',
        'skype': 'skype',

        # Email clients
        'thunderbird': 'thunderbird',
        'mail': 'mail',
        'mailspring': 'mailspring',
    }

    # Return normalized name if found in mappings, otherwise return as-is
    return app_variations.get(normalized, normalized)

def _detect_web_app_from_title(window_title: str, app_name: str) -> Optional[str]:
    """
    Detect specific web application from browser window title.

    Many messaging apps have web versions that run in browsers.
    This function detects them from the window title pattern.

    Args:
        window_title: The window title (e.g., "Gmail - Google Chrome")
        app_name: The normalized app name (e.g., "chrome")

    Returns:
        Detected web app name or None if not a recognized web app
    """
    if not window_title:
        return None

    title_lower = window_title.lower()

    # Only check for web apps if we're in a browser
    browsers = ['chrome', 'firefox', 'safari', 'edge']
    if app_name not in browsers:
        return None

    # Web app patterns - check for these in window title
    web_app_patterns = {
        'gmail': ['gmail', 'google mail'],
        'slack': ['slack |', 'slack workspace', '| slack'],
        'discord': ['discord |', '| discord'],
        'teams': ['microsoft teams', 'teams |'],
        'outlook': ['outlook', 'office 365'],
        'whatsapp': ['whatsapp web', 'whatsapp'],
        'telegram': ['telegram web', 'web telegram'],
        'messenger': ['messenger', 'facebook messenger'],
        'zoom': ['zoom meeting', 'zoom.us'],
    }

    # Check each web app pattern
    for web_app, patterns in web_app_patterns.items():
        for pattern in patterns:
            if pattern in title_lower:
                logger.info(f"Detected web app '{web_app}' from window title: {window_title}")
                return web_app

    return None

def _detect_app_from_window_title(active_window: Optional[ActiveWindow], monitored_apps: List[str]) -> str:
    """
    Detect app from active window title (most reliable method).

    Uses normalization to handle platform-specific app name variations
    and detects web apps running in browsers.
    """
    if not active_window or not active_window.fullTitle:
        return 'unknown'

    title_lower = active_window.fullTitle.lower()
    raw_app_name = active_window.appName or ''
    window_title = active_window.windowTitle or ''

    logger.info(f"Detecting app from window - Raw app name: '{raw_app_name}', Window title: '{window_title}'")

    # Exclude the Copilot Desktop app itself
    if 'ai copilot desktop' in title_lower or 'ai copilot desktop' in raw_app_name.lower():
        logger.info(f"Ignoring AI Copilot Desktop itself")
        return 'unknown'

    # Normalize the app name to handle platform variations
    normalized_app_name = _normalize_app_name(raw_app_name)
    logger.info(f"Normalized app name: '{raw_app_name}' → '{normalized_app_name}'")

    # Check if this is a browser with a web app
    web_app = _detect_web_app_from_title(window_title, normalized_app_name)
    if web_app and web_app in monitored_apps:
        logger.info(f"Detected web app '{web_app}' in browser from window title: {active_window.fullTitle}")
        return web_app

    # Check if the normalized app name matches any monitored app
    if normalized_app_name in monitored_apps:
        logger.info(f"Detected app '{normalized_app_name}' from normalized app name: {active_window.fullTitle}")
        return normalized_app_name

    # Fallback: Check for app name keywords in window title
    # This helps when app name normalization doesn't match but the title contains app info
    app_keywords_in_title = {
        'slack': ['slack workspace', 'slack |', '| slack'],
        'discord': ['discord |', '| discord', 'discord server'],
        'teams': ['microsoft teams', 'teams |', 'teams meeting'],
        'outlook': ['outlook |', 'microsoft outlook'],
        'whatsapp': ['whatsapp'],
        'telegram': ['telegram'],
        'gmail': ['gmail'],
        'zoom': ['zoom meeting', 'zoom.us'],
    }

    for app, keywords in app_keywords_in_title.items():
        if app in monitored_apps:
            for keyword in keywords:
                if keyword in title_lower:
                    logger.info(f"Detected app '{app}' from window title keyword '{keyword}': {active_window.fullTitle}")
                    return app

    logger.info(f"Could not detect monitored app from window. Normalized app: '{normalized_app_name}', Monitored: {monitored_apps}")
    return 'unknown'

def _detect_app_from_text(full_text: str, monitored_apps: List[str]) -> str:
    """
    Detect which app the message is from based on OCR text.

    This is a fallback method when window title detection fails.
    Uses keyword matching to identify apps from visible text.

    Note: This is less reliable than window title detection.
    For better accuracy, ensure window title detection is working.
    """
    text_lower = full_text.lower()

    # Exclude the Copilot Desktop app itself
    if 'ai copilot desktop' in text_lower:
        logger.info(f"Ignoring AI Copilot Desktop itself (from OCR)")
        return 'unknown'

    # App-specific keywords - prioritize more specific keywords
    # Avoid generic terms that might appear in the Copilot Desktop UI
    # Order matters: more specific patterns first
    app_keywords = {
        # Messaging apps - look for distinctive UI elements
        'slack': [
            'slack workspace',
            'slack |',
            'direct message to',
            'jump to...',
            'threads',
            'slack'
        ],
        'discord': [
            'discord |',
            'discord server',
            'voice connected',
            'discord'
        ],
        'teams': [
            'microsoft teams',
            'teams meeting',
            'teams |',
            'teams chat'
        ],
        'whatsapp': [
            'whatsapp web',
            'whatsapp',
            'type a message'
        ],
        'telegram': [
            'telegram web',
            'telegram desktop',
            'telegram'
        ],
        'signal': [
            'signal private messenger',
            'signal'
        ],
        'zoom': [
            'zoom meeting',
            'zoom.us',
            'zoom'
        ],

        # Email clients
        'outlook': [
            'outlook |',
            'microsoft outlook',
            'focused inbox',
            'outlook'
        ],
        'gmail': [
            'gmail',
            'compose',
            'inbox'
        ],

        # Browsers with web apps - look for web app indicators
        'chrome': [
            'gmail',
            'google meet',
            'google calendar',
            'messenger.com',
            'web.whatsapp.com',
            'web.telegram.org'
        ],
        'firefox': [
            'gmail',
            'google meet',
            'messenger.com'
        ]
    }

    # Check each monitored app in priority order
    for app in monitored_apps:
        if app in app_keywords:
            keywords = app_keywords[app]
            for keyword in keywords:
                if keyword in text_lower:
                    logger.info(f"Detected app '{app}' from OCR text using keyword '{keyword}'")
                    return app

    logger.info(f"Could not detect any monitored app from OCR text. Monitored apps: {monitored_apps}")
    return 'unknown'

async def _extract_messages_with_ai(
    full_text: str,
    detected_app: str,
    llm_service: LLMService
) -> List[Dict[str, Any]]:
    """
    Use AI to intelligently extract actual message content from OCR text.

    This is much more reliable than heuristic-based detection because:
    - AI can understand context and distinguish UI elements from messages
    - AI can identify sender names and message content accurately
    - AI can handle different app layouts and formats
    - AI can filter out noise and false positives

    Args:
        full_text: Full OCR text from the screen
        detected_app: The detected messaging app (gmail, slack, discord, etc.)
        llm_service: LLM service for AI analysis

    Returns:
        List of extracted messages with sender and full content
    """
    try:
        # Create a prompt for the AI to extract messages
        prompt = f"""You are analyzing text extracted from a {detected_app} messaging application screen.

Your task is to identify and extract ONLY actual new/unread messages or emails from the text below.

Rules:
1. Extract ONLY actual message/email content - ignore UI elements, buttons, labels, navigation items
2. For each message, identify:
   - sender: The person/entity who sent the message (name or email)
   - content: The FULL message content (not just a snippet)
3. Ignore:
   - UI elements like "New message", "Copy Draft Reply", "Dismiss"
   - Navigation items, menu items, app names
   - Timestamps, read/unread indicators
   - Single words or very short fragments that are clearly not messages
4. Only extract messages that appear to be NEW or UNREAD
5. If there are no actual messages, return an empty array

OCR Text:
{full_text}

Respond with a JSON array of messages in this exact format:
[
  {{
    "sender": "Sender Name or Email",
    "content": "Full message content here"
  }}
]

If no actual messages are found, respond with: []
"""

        logger.info("Calling AI to extract messages from OCR text...")

        # Call LLM to extract messages using chat_completion with proper parameters
        messages = [
            {
                "role": "system",
                "content": "You are a helpful assistant that extracts message content from OCR text. Always respond with valid JSON arrays only, no additional text."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]

        response_dict = await llm_service.chat_completion(
            messages=messages,
            max_tokens=2000,
            temperature=0.1  # Low temperature for more consistent extraction
        )

        response = response_dict.get("content", "")
        logger.info(f"AI response received: {response[:200]}...")

        # Parse the JSON response
        import json
        import re

        # Extract JSON from response (handle markdown code blocks)
        json_match = re.search(r'\[[\s\S]*\]', response)
        if not json_match:
            logger.warning("No JSON array found in AI response")
            return []

        json_str = json_match.group(0)
        extracted_messages = json.loads(json_str)

        # Validate and format messages
        messages = []
        for msg in extracted_messages:
            if isinstance(msg, dict) and 'sender' in msg and 'content' in msg:
                sender = msg['sender'].strip()
                content = msg['content'].strip()

                # Filter out obvious false positives
                if (len(sender) > 0 and len(content) > 5 and
                    sender.lower() not in ['new message', 'dismiss', 'copy draft reply', 'chrome', 'slack', 'discord']):

                    messages.append({
                        "sender": sender,
                        "snippet": content,  # Full content, not just snippet
                        "location": {},  # No location info from AI extraction
                        "app": detected_app
                    })

        logger.info(f"AI extracted {len(messages)} actual messages")
        return messages

    except Exception as e:
        logger.error(f"Error extracting messages with AI: {e}")
        logger.error(f"Error details: {str(e)}")
        return []

def _detect_messages_from_ocr(
    ocr_result: Dict[str, Any],
    monitored_apps: List[str] = None,
    active_window: Optional[ActiveWindow] = None
) -> List[Dict[str, Any]]:
    """
    Detect potential new messages from OCR results.

    This is a heuristic-based approach with known limitations:
    - Works best with messaging apps that have consistent layouts
    - May produce false positives/negatives
    - Screen resolution and DPI affect pixel-based detection

    For production use, consider:
    - Platform-specific accessibility APIs
    - Machine learning-based UI element detection
    - Integration with messaging app APIs
    """
    if monitored_apps is None:
        monitored_apps = ['chrome', 'slack']

    messages = []
    paragraphs = ocr_result.get("paragraphs", [])

    if not paragraphs:
        return messages

    # Detect which app - try window title first (most reliable), then OCR text
    detected_app = 'unknown'

    logger.info("=" * 60)
    logger.info("Starting app detection process")
    logger.info(f"Monitored apps: {monitored_apps}")

    # Method 1: Use active window title (most reliable)
    if active_window and active_window.appName:
        logger.info(f"Method 1: Window Title Detection")
        logger.info(f"  Raw app name: '{active_window.appName}'")
        logger.info(f"  Window title: '{active_window.windowTitle}'")
        logger.info(f"  Full title: '{active_window.fullTitle}'")

        detected_app = _detect_app_from_window_title(active_window, monitored_apps)

        if detected_app != 'unknown':
            logger.info(f"  ✅ Window title detection successful: '{detected_app}'")
        else:
            logger.info(f"  ⚠️ Window title detection failed, will try OCR fallback")
    else:
        logger.warning("⚠️ No active window information provided")
        logger.warning("  This usually means:")
        logger.warning("  - Window detection failed on the client side")
        logger.warning("  - Platform doesn't support window detection")
        logger.warning("  - Permissions issue (accessibility/screen recording)")
        logger.warning("  Will use OCR text detection only (less reliable)")

    # Method 2: Fallback to OCR text analysis (less reliable but better than nothing)
    if detected_app == 'unknown':
        logger.info(f"Method 2: OCR Text Detection (Fallback)")
        full_text = ocr_result.get("full_text", "")
        text_preview = full_text[:200] if len(full_text) > 200 else full_text
        logger.info(f"  OCR text preview (first 200 chars): '{text_preview}...'")
        logger.info(f"  Total OCR text length: {len(full_text)} characters")

        detected_app = _detect_app_from_text(full_text, monitored_apps)

        if detected_app != 'unknown':
            logger.info(f"  ✅ OCR text detection successful: '{detected_app}'")
        else:
            logger.info(f"  ❌ OCR text detection failed")

    # Validation: Check if detected app is in monitored list
    logger.info(f"Detection result: '{detected_app}'")

    if detected_app == 'unknown':
        logger.warning(f"❌ No monitored app detected")
        logger.warning(f"  Active window: {active_window.fullTitle if active_window else 'None'}")
        logger.warning(f"  Monitored apps: {monitored_apps}")
        logger.warning(f"  Suggestion: Check if the app is in the monitored list and window detection is working")
        logger.info("=" * 60)
        return messages

    if detected_app not in monitored_apps:
        logger.warning(f"❌ Detected app '{detected_app}' is not in monitored apps list")
        logger.warning(f"  Monitored apps: {monitored_apps}")
        logger.warning(f"  This app will be ignored")
        logger.info("=" * 60)
        return messages

    logger.info(f"✅ App detection successful: '{detected_app}'")
    logger.info(f"✅ App '{detected_app}' is in monitored list")
    logger.info("=" * 60)

    # Return the detected app and full text for AI processing
    # The actual message extraction will be done by AI in the endpoint
    return {
        'detected_app': detected_app,
        'full_text': ocr_result.get("full_text", ""),
        'needs_ai_extraction': True
    }

@router.post("/messaging/check-new")
async def check_new_messages(
    image_data: ImageData,
    ocr_service: OCRService = Depends(get_ocr_service),
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    Check for new messages by analyzing screen content.

    Uses AI to intelligently extract actual message content from OCR text,
    filtering out UI elements and false positives.

    This approach is much more reliable than heuristic-based detection.
    """
    try:
        monitored_apps = image_data.monitored_apps
        active_window = image_data.active_window

        logger.info(f"Checking for new messages from apps: {', '.join(monitored_apps)}")
        if active_window:
            logger.info(f"Active window: {active_window.fullTitle}")

        # Step 1: Extract text from screenshot using OCR
        image_bytes = base64.b64decode(image_data.image_data)
        ocr_result = await ocr_service.extract_text_with_structure(image_data=image_bytes)

        # Step 2: Detect which app is active
        detection_result = _detect_messages_from_ocr(ocr_result, monitored_apps, active_window)

        # Check if we got a detection result that needs AI extraction
        if isinstance(detection_result, dict) and detection_result.get('needs_ai_extraction'):
            detected_app = detection_result['detected_app']
            full_text = detection_result['full_text']

            logger.info(f"App detected: '{detected_app}', extracting messages with AI...")

            # Step 3: Use AI to extract actual messages from OCR text
            messages = await _extract_messages_with_ai(full_text, detected_app, llm_service)

            logger.info(f"AI extracted {len(messages)} actual message(s)")
            return {"messages": messages}
        else:
            # Old format or no app detected
            messages = detection_result if isinstance(detection_result, list) else []
            logger.info(f"Detected {len(messages)} potential message(s)")
            return {"messages": messages}

    except Exception as e:
        logger.error(f"Error checking for new messages: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to check messages: {str(e)}")

@router.post("/messaging/find-reply-button")
async def find_reply_button(
    image_data: ImageData,
    ocr_service: OCRService = Depends(get_ocr_service)
):
    """
    Find reply button location on screen.

    Note: This endpoint is deprecated in favor of clipboard-based approach.
    Automated clicking is unreliable and may not work across different
    messaging applications. Use the clipboard-based draft reply instead.
    """
    try:
        logger.info("Searching for reply button...")
        image_bytes = base64.b64decode(image_data.image_data)
        ocr_result = await ocr_service.extract_text_with_structure(image_data=image_bytes)

        # Search for common reply button text
        reply_keywords = ["reply", "respond", "answer", "message"]

        for paragraph in ocr_result.get("paragraphs", []):
            text_lower = paragraph.get('text', '').lower()

            # Look for reply-related keywords
            if any(keyword in text_lower for keyword in reply_keywords):
                # Prefer exact "reply" match
                if "reply" in text_lower:
                    logger.info(f"Found reply button: {paragraph['text']}")
                    return {"location": paragraph['bounding_box']}

        logger.warning("Reply button not found in screen content")
        raise HTTPException(
            status_code=404,
            detail="Reply button not found. Try using the clipboard-based approach instead."
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding reply button: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to find reply button: {str(e)}")