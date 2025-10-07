# AI Copilot Desktop

AI Copilot for Desktops is a cross-platform desktop AI assistant powered by Electron and a Python backend. It provides various services including chat, OCR, speech-to-text, and text-to-speech, leveraging different AI providers.

## Features

-   **Cross-Platform:** Works on Windows, macOS, and Linux.
-   **AI-Powered Chat:** Engage in conversations with an AI assistant.
-   **Optical Character Recognition (OCR):** Extract text from images.
-   **Speech-to-Text (STT):** Convert spoken language into text.
-   **Text-to-Speech (TTS):** Convert text into spoken language.
-   **Multiple AI Providers:** Supports various AI providers like OpenAI, Google Gemini, and Ollama.

## Tech Stack

**Client (Frontend):**

-   [Electron](https://www.electronjs.org/)
-   HTML, CSS, JavaScript
-   [axios](https://axios-http.com/) for API requests
-   [Howler.js](https://howlerjs.com/) for audio playback

**Server (Backend):**

-   [Python](https://www.python.org/)
-   [FastAPI](https://fastapi.tiangolo.com/)
-   [Uvicorn](https://www.uvicorn.org/)
-   Google Cloud Services (Speech, Text-to-Speech, Vision)
-   OpenAI API

## Prerequisites

-   [Node.js](https://nodejs.org/) and npm
-   [Python](https://www.python.org/downloads/) 3.7+ and pip
-   Google Cloud SDK (if using Google Cloud services)

## Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/phamvuhoang/copilot-desktop.git
    cd copilot-desktop
    ```

2.  **Install client dependencies:**

    ```bash
    npm install
    ```

3.  **Install server dependencies:**

    ```bash
    cd server
    pip install -r requirements.txt
    ```

4.  **Set up environment variables:**

    Create a `.env` file in the `server` directory by copying the `.env.example` file.

    ```bash
    cp .env.example .env
    ```

    Update the `.env` file with your API keys and configurations.

## Google Cloud Setup

To use the Google Cloud services (Speech-to-Text, Text-to-Speech, Vision, and Gemini), you need to set up a Google Cloud project and create a service account.

**📖 For detailed step-by-step instructions, see [server/GOOGLE_CLOUD_SETUP.md](server/GOOGLE_CLOUD_SETUP.md)**

### Quick Setup Summary

1.  **Create a Google Cloud Project**
    - Go to [Google Cloud Console](https://console.cloud.google.com/)
    - Create a new project (e.g., `copilot-desktop-123456`)
    - Note your project ID and project number

2.  **Enable Required APIs**
    - Cloud Speech-to-Text API
    - Cloud Text-to-Speech API
    - Cloud Vision API
    - Generative Language API (for Gemini)

3.  **Create a Service Account**
    - Navigate to "IAM & Admin" > "Service Accounts"
    - Create a new service account
    - Grant appropriate roles (Speech Client, Text-to-Speech Client, Vision API User)
    - Download the JSON key file
    - Save as `service-account-key.json` in the `server/` directory

4.  **Get Gemini API Key**
    - Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
    - Create an API key for your project
    - Copy the API key

5.  **Update Configuration**
    - Copy `server/.env.example` to `server/.env`
    - Update `GOOGLE_CLOUD_PROJECT_ID` with your project ID
    - Update `GEMINI_API_KEY` with your Gemini API key
    - Verify `GOOGLE_APPLICATION_CREDENTIALS` points to `service-account-key.json`

For complete instructions with screenshots and troubleshooting, see the [detailed setup guide](server/GOOGLE_CLOUD_SETUP.md).

## Usage

1.  **Start the Python backend server:**

    ```bash
    cd server
    uvicorn app:app --reload
    ```

2.  **Start the Electron application:**

    In a new terminal, from the root directory:

    ```bash
    npm start
    ```

## Project Structure

```
copilot-desktop/
├── client/              # Electron client application
│   ├── main.js          # Main Electron process
│   ├── renderer.js      # Electron renderer process
│   ├── index.html       # HTML for the main window
│   └── ...
├── server/              # Python backend server
│   ├── app.py           # FastAPI application
│   ├── requirements.txt # Python dependencies
│   ├── routes/          # API routes
│   └── services/        # Business logic and AI services
└── ...
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
