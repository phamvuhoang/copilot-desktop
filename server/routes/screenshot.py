"""
Screenshot API routes for AI Copilot Desktop
Handles screenshot analysis with OCR and contextual AI responses.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class ScreenshotRequest(BaseModel):
    """Screenshot request payload (placeholder)"""
    image_data: str  # Base64 encoded image data
    query: str  # User's question about the screenshot
    format: Optional[str] = "png"

class ScreenshotResponse(BaseModel):
    """Screenshot response payload (placeholder)"""
    extracted_text: str
    analysis: str
    confidence: Optional[float] = None

@router.post("/screenshot", response_model=ScreenshotResponse)
async def screenshot_endpoint(request: ScreenshotRequest):
    """
    Process screenshot and return analysis
    
    This endpoint will be implemented in Milestone 5: Screenshot Capture
    """
    raise HTTPException(
        status_code=501,
        detail="Screenshot functionality not yet implemented. Coming in Milestone 5."
    )

@router.get("/screenshot/status")
async def get_screenshot_status():
    """Get screenshot service status"""
    return {
        "status": "not_implemented",
        "message": "Screenshot functionality will be available in Milestone 5",
        "features": {
            "ocr": False,
            "image_analysis": False
        }
    }
