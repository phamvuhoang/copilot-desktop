from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import base64
from services.ocr import get_ocr_service, OCRService
from services.llm import get_llm_service, LLMService

router = APIRouter()

class ImageData(BaseModel):
    image_data: str

class Message(BaseModel):
    sender: str
    snippet: str
    location: dict

@router.post("/messaging/check-new")
async def check_new_messages(
    image_data: ImageData,
    ocr_service: OCRService = Depends(get_ocr_service)
):
    try:
        image_bytes = base64.b64decode(image_data.image_data)
        ocr_result = await ocr_service.extract_text_with_structure(image_data=image_bytes)

        messages = []
        # TODO: This is a very basic and brittle implementation. A more robust solution
        # would require more advanced image analysis or a different approach entirely,
        # such as accessibility APIs if available.
        for paragraph in ocr_result.get("paragraphs", []):
            if paragraph['bounding_box'][0]['x'] < 300:  # Assuming sender is in the first 300 pixels
                # TODO: This is a placeholder for actual bold detection. The OCR result from
                # Google Cloud Vision does not directly provide font weight. This would require
                # a more complex analysis of the image or a different tool.
                is_bold = all(word['confidence'] > 0.8 for word in paragraph['words'])
                if is_bold:
                    sender = paragraph['text']
                    # TODO: This is a simplified example. We'd need to find the snippet
                    # from a neighboring block, which requires analyzing the geometric layout.
                    snippet = "Unread message detected"
                    messages.append({
                        "sender": sender,
                        "snippet": snippet,
                        "location": paragraph['bounding_box']
                    })

        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/messaging/find-reply-button")
async def find_reply_button(
    image_data: ImageData,
    ocr_service: OCRService = Depends(get_ocr_service)
):
    try:
        image_bytes = base64.b64decode(image_data.image_data)
        ocr_result = await ocr_service.extract_text_with_structure(image_data=image_bytes)

        # TODO: This is a very basic implementation. It will find the first occurrence
        # of the word "reply" on the screen, which might not be the button. A more
        # robust solution would look for UI elements with a button role or use more
        # context from the layout.
        for paragraph in ocr_result.get("paragraphs", []):
            if "reply" in paragraph['text'].lower():
                return {"location": paragraph['bounding_box']}

        raise HTTPException(status_code=404, detail="Reply button not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))