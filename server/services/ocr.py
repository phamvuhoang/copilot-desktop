"""
OCR Service for AI Copilot Desktop
Handles Optical Character Recognition using Google Cloud Vision API.
"""

from google.cloud import vision
from typing import Dict, Any, Optional, List
import base64
import io
from PIL import Image
from config.settings import get_google_cloud_config


class OCRService:
    """Service for handling Optical Character Recognition operations"""
    
    def __init__(self):
        self.client = None
        self.google_config = get_google_cloud_config()
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Google Cloud Vision client"""
        try:
            if self.google_config["credentials_path"]:
                # Use service account credentials
                import os
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = self.google_config["credentials_path"]
            
            self.client = vision.ImageAnnotatorClient()
            print("Google Cloud Vision client initialized successfully")
        except Exception as e:
            print(f"Failed to initialize OCR client: {e}")
            self.client = None
    
    def is_available(self) -> bool:
        """Check if OCR service is available"""
        return self.client is not None
    
    async def extract_text_from_image(
        self,
        image_data: bytes,
        image_format: str = "png",
        language_hints: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Extract text from image using OCR
        
        Args:
            image_data: Raw image bytes
            image_format: Image format (png, jpg, etc.)
            language_hints: List of language codes to hint OCR
            
        Returns:
            Dict containing OCR results
        """
        if not self.client:
            raise Exception("OCR service not available. Please check Google Cloud Vision configuration.")
        
        try:
            # Optimize image size for better performance
            optimized_image_data = self._optimize_image_for_ocr(image_data, image_format)

            # Create Vision API image object
            image = vision.Image(content=optimized_image_data)

            # Configure text detection
            image_context = vision.ImageContext()
            if language_hints:
                image_context.language_hints = language_hints
            
            # Perform text detection
            response = self.client.text_detection(
                image=image,
                image_context=image_context
            )
            
            # Check for errors
            if response.error.message:
                raise Exception(f"Vision API error: {response.error.message}")
            
            # Extract text annotations
            texts = response.text_annotations
            
            if not texts:
                return {
                    "full_text": "",
                    "text_blocks": [],
                    "confidence": 0.0,
                    "language": None,
                    "word_count": 0
                }
            
            # Get full text (first annotation contains all detected text)
            full_text = texts[0].description
            
            # Extract individual text blocks
            text_blocks = []
            for text in texts[1:]:  # Skip first annotation (full text)
                # Get bounding box
                vertices = [(vertex.x, vertex.y) for vertex in text.bounding_poly.vertices]
                
                text_blocks.append({
                    "text": text.description,
                    "bounding_box": vertices,
                    "confidence": getattr(text, 'confidence', 0.0)
                })
            
            # Detect language if available
            detected_language = None
            if hasattr(response, 'text_annotations') and response.text_annotations:
                for text_annotation in response.text_annotations:
                    if hasattr(text_annotation, 'locale') and text_annotation.locale:
                        detected_language = text_annotation.locale
                        break
            
            # Calculate basic statistics
            word_count = len(full_text.split()) if full_text else 0
            
            return {
                "full_text": full_text,
                "text_blocks": text_blocks,
                "confidence": self._calculate_average_confidence(text_blocks),
                "language": detected_language,
                "word_count": word_count,
                "image_format": image_format
            }
            
        except Exception as e:
            print(f"OCR processing error: {e}")
            raise Exception(f"Failed to extract text from image: {str(e)}")
    
    async def extract_text_with_structure(
        self,
        image_data: bytes,
        image_format: str = "png"
    ) -> Dict[str, Any]:
        """
        Extract text with document structure analysis
        
        Args:
            image_data: Raw image bytes
            image_format: Image format
            
        Returns:
            Dict containing structured OCR results
        """
        if not self.client:
            raise Exception("OCR service not available. Please check Google Cloud Vision configuration.")
        
        try:
            # Create Vision API image object
            image = vision.Image(content=image_data)
            
            # Perform document text detection for better structure
            response = self.client.document_text_detection(image=image)
            
            # Check for errors
            if response.error.message:
                raise Exception(f"Vision API error: {response.error.message}")
            
            # Extract full text annotation
            document = response.full_text_annotation
            
            if not document.text:
                return {
                    "full_text": "",
                    "pages": [],
                    "paragraphs": [],
                    "words": [],
                    "confidence": 0.0
                }
            
            # Extract structured information
            pages = []
            paragraphs = []
            words = []
            
            for page in document.pages:
                page_info = {
                    "width": page.width,
                    "height": page.height,
                    "confidence": page.confidence
                }
                pages.append(page_info)
                
                for block in page.blocks:
                    for paragraph in block.paragraphs:
                        paragraph_text = ""
                        paragraph_words = []
                        
                        for word in paragraph.words:
                            word_text = "".join([symbol.text for symbol in word.symbols])
                            paragraph_text += word_text + " "
                            
                            # Get word bounding box
                            vertices = [(vertex.x, vertex.y) for vertex in word.bounding_box.vertices]
                            
                            word_info = {
                                "text": word_text,
                                "confidence": word.confidence,
                                "bounding_box": vertices
                            }
                            paragraph_words.append(word_info)
                            words.append(word_info)
                        
                        # Get paragraph bounding box
                        para_vertices = [(vertex.x, vertex.y) for vertex in paragraph.bounding_box.vertices]
                        
                        paragraph_info = {
                            "text": paragraph_text.strip(),
                            "confidence": paragraph.confidence,
                            "bounding_box": para_vertices,
                            "words": paragraph_words
                        }
                        paragraphs.append(paragraph_info)
            
            return {
                "full_text": document.text,
                "pages": pages,
                "paragraphs": paragraphs,
                "words": words,
                "confidence": self._calculate_average_confidence(words),
                "image_format": image_format
            }
            
        except Exception as e:
            print(f"Structured OCR processing error: {e}")
            raise Exception(f"Failed to extract structured text from image: {str(e)}")
    
    def _optimize_image_for_ocr(self, image_data: bytes, image_format: str) -> bytes:
        """Optimize image for better OCR performance"""
        try:
            # Open image with PIL
            image = Image.open(io.BytesIO(image_data))

            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')

            # Resize if image is too large (max 2048x2048 for good OCR performance)
            max_size = 2048
            if image.width > max_size or image.height > max_size:
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

            # Save optimized image
            output = io.BytesIO()
            # Use JPEG with high quality for good OCR results
            image.save(output, format='JPEG', quality=90, optimize=True)
            return output.getvalue()

        except Exception as e:
            print(f"Image optimization failed, using original: {e}")
            return image_data

    def _calculate_average_confidence(self, text_elements: List[Dict]) -> float:
        """Calculate average confidence from text elements"""
        if not text_elements:
            return 0.0

        confidences = [elem.get('confidence', 0.0) for elem in text_elements if 'confidence' in elem]
        if not confidences:
            return 0.0

        return sum(confidences) / len(confidences)


# Service instance
_ocr_service = None

def get_ocr_service() -> OCRService:
    """Get OCR service instance (singleton)"""
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService()
    return _ocr_service
