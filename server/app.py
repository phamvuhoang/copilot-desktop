"""
AI Copilot Desktop - FastAPI Backend Server
Main application entry point for the AI Copilot backend API.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import route modules
from routes.chat import router as chat_router
from routes.voice import router as voice_router
from routes.screenshot import router as screenshot_router
from routes.process import router as process_router
from routes.messaging import router as messaging_router

# Create FastAPI application
app = FastAPI(
    title="AI Copilot Desktop API",
    description="Backend API for AI Copilot Desktop application",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat_router, prefix="/api/v1", tags=["chat"])
app.include_router(voice_router, prefix="/api/v1", tags=["voice"])
app.include_router(screenshot_router, prefix="/api/v1", tags=["screenshot"])
app.include_router(process_router, prefix="/api/v1", tags=["process"])
app.include_router(messaging_router, prefix="/api/v1", tags=["messaging"])

@app.get("/")
async def root():
    """Root endpoint - API health check"""
    return {
        "message": "AI Copilot Desktop API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "chat": "/api/v1/chat",
            "voice": "/api/v1/voice",
            "screenshot": "/api/v1/screenshot",
            "process": "/api/v1/process",
            "messaging": "/api/v1/messaging",
            "docs": "/docs"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "message": "AI Copilot Desktop API is running"
    }

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Global HTTP exception handler"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "message": exc.detail,
            "status_code": exc.status_code
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Global exception handler for unexpected errors"""
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "message": "Internal server error",
            "status_code": 500
        }
    )

if __name__ == "__main__":
    # Get configuration from environment variables
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 8000))
    debug = os.getenv("DEBUG", "false").lower() == "true"
    
    print(f"Starting AI Copilot Desktop API server...")
    print(f"Host: {host}")
    print(f"Port: {port}")
    print(f"Debug: {debug}")
    print(f"Docs: http://{host}:{port}/docs")
    
    uvicorn.run(
        "app:app",
        host=host,
        port=port,
        reload=debug,
        log_level="info" if not debug else "debug"
    )
