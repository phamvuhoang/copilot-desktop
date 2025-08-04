"""
Screenshot API routes for AI Copilot Desktop
Handles screenshot analysis with OCR and contextual AI responses.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import base64
import time
from services.ocr import get_ocr_service, OCRService
from services.llm import get_llm_service, LLMService

router = APIRouter()

class ScreenshotRequest(BaseModel):
    """Screenshot request payload"""
    image_data: str  # Base64 encoded image data
    query: str  # User's question about the screenshot
    image_format: Optional[str] = "png"
    use_structured_ocr: Optional[bool] = False
    language_hints: Optional[List[str]] = None

class ScreenshotResponse(BaseModel):
    """Screenshot response payload"""
    extracted_text: str
    analysis: str
    confidence: Optional[float] = None
    word_count: Optional[int] = None
    processing_time: Optional[float] = None
    ocr_language: Optional[str] = None

class OCROnlyRequest(BaseModel):
    """OCR-only request payload"""
    image_data: str  # Base64 encoded image data
    image_format: Optional[str] = "png"
    use_structured_ocr: Optional[bool] = False
    language_hints: Optional[List[str]] = None

class OCROnlyResponse(BaseModel):
    """OCR-only response payload"""
    extracted_text: str
    confidence: Optional[float] = None
    word_count: Optional[int] = None
    processing_time: Optional[float] = None
    language: Optional[str] = None
    text_blocks: Optional[List[Dict[str, Any]]] = None

@router.post("/screenshot", response_model=ScreenshotResponse)
async def screenshot_endpoint(
    request: ScreenshotRequest,
    ocr_service: OCRService = Depends(get_ocr_service),
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    Process screenshot with OCR and return AI analysis

    This endpoint:
    1. Extracts text from the screenshot using OCR
    2. Processes the extracted text and user query with LLM
    3. Returns both the extracted text and AI analysis
    """
    start_time = time.time()

    try:
        # Check service availability
        if not ocr_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="OCR service not available. Please check Google Cloud Vision configuration."
            )

        # Decode image data
        try:
            image_bytes = base64.b64decode(request.image_data)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid image data: {str(e)}"
            )

        # Extract text using OCR
        if request.use_structured_ocr:
            ocr_result = await ocr_service.extract_text_with_structure(
                image_data=image_bytes,
                image_format=request.image_format
            )
        else:
            ocr_result = await ocr_service.extract_text_from_image(
                image_data=image_bytes,
                image_format=request.image_format,
                language_hints=request.language_hints
            )

        extracted_text = ocr_result["full_text"]
        confidence = ocr_result["confidence"]
        word_count = ocr_result["word_count"]
        detected_language = ocr_result.get("language")

        if not extracted_text.strip():
            # No text found in image
            analysis = "I can see the screenshot, but I couldn't detect any readable text in it. The image might contain graphics, diagrams, or text that's too small or unclear to read."
        else:
            # Process with LLM if available
            if llm_service.is_available():
                try:
                    # Create context for LLM
                    context = f"I've extracted the following text from a screenshot:\n\n{extracted_text}\n\nUser's question: {request.query}"

                    analysis = await llm_service.simple_chat(
                        user_message=context,
                        system_prompt="You are AI Copilot analyzing a screenshot. The user has shared a screenshot and asked a question about it. I've extracted the text content using OCR. Please provide a helpful analysis based on the extracted text and answer the user's question. Be specific and reference the actual content you can see in the text."
                    )
                except Exception as e:
                    print(f"LLM processing error: {e}")
                    analysis = f"I extracted the following text from the screenshot:\n\n{extracted_text}\n\nHowever, I'm having trouble processing your question right now. Please try again or rephrase your question."
            else:
                analysis = f"I extracted the following text from the screenshot:\n\n{extracted_text}\n\nLLM service is not available for analysis, but you can see the extracted text above."

        processing_time = time.time() - start_time

        return ScreenshotResponse(
            extracted_text=extracted_text,
            analysis=analysis,
            confidence=confidence,
            word_count=word_count,
            processing_time=processing_time,
            ocr_language=detected_language
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Screenshot processing error: {str(e)}"
        )

@router.post("/screenshot/ocr", response_model=OCROnlyResponse)
async def ocr_only_endpoint(
    request: OCROnlyRequest,
    ocr_service: OCRService = Depends(get_ocr_service)
):
    """
    Extract text from screenshot using OCR only (no LLM analysis)
    """
    start_time = time.time()

    try:
        # Check service availability
        if not ocr_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="OCR service not available. Please check Google Cloud Vision configuration."
            )

        # Decode image data
        try:
            image_bytes = base64.b64decode(request.image_data)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid image data: {str(e)}"
            )

        # Extract text using OCR
        if request.use_structured_ocr:
            ocr_result = await ocr_service.extract_text_with_structure(
                image_data=image_bytes,
                image_format=request.image_format
            )
            text_blocks = ocr_result.get("paragraphs", [])
        else:
            ocr_result = await ocr_service.extract_text_from_image(
                image_data=image_bytes,
                image_format=request.image_format,
                language_hints=request.language_hints
            )
            text_blocks = ocr_result.get("text_blocks", [])

        processing_time = time.time() - start_time

        return OCROnlyResponse(
            extracted_text=ocr_result["full_text"],
            confidence=ocr_result["confidence"],
            word_count=ocr_result["word_count"],
            processing_time=processing_time,
            language=ocr_result.get("language"),
            text_blocks=text_blocks
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"OCR processing error: {str(e)}"
        )

@router.get("/screenshot/status")
async def get_screenshot_status(
    ocr_service: OCRService = Depends(get_ocr_service),
    llm_service: LLMService = Depends(get_llm_service)
):
    """Get screenshot service status"""
    return {
        "status": "available",
        "message": "Screenshot functionality is available",
        "features": {
            "ocr": ocr_service.is_available(),
            "image_analysis": llm_service.is_available(),
            "structured_ocr": ocr_service.is_available()
        },
        "supported_formats": ["png", "jpg", "jpeg", "gif", "bmp", "webp"],
        "max_image_size": "10MB"
    }
