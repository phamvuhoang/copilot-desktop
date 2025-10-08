# AI Copilot Desktop

AI Copilot for Desktops is a cross-platform desktop AI assistant powered by Electron and a Python backend. It provides various services including chat, OCR, speech-to-text, and text-to-speech, leveraging different AI providers.

## Features

-   **Cross-Platform:** Works on Windows, macOS, and Linux.
-   **AI-Powered Chat:** Engage in conversations with an AI assistant.
-   **Optical Character Recognition (OCR):** Extract text from images.
-   **Speech-to-Text (STT):** Convert spoken language into text.
-   **Text-to-Speech (TTS):** Convert text into spoken language.
-   **Multiple AI Providers:** Supports various AI providers like OpenAI, Google Gemini, and Ollama.
-   **Messaging Assistance (Experimental):** Monitor screen for new messages and generate AI-powered draft replies.

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

To use Google Cloud services (Vision, Speech-to-Text, Text-to-Speech), you need to set up a Google Cloud project and enable the necessary APIs.

1.  **Create or Select a Project**: Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project or select an existing one.

2.  **Enable APIs**: Enable the following APIs for your project:
    *   Cloud Vision API
    *   Cloud Speech-to-Text API
    *   Cloud Text-to-Speech API
    *   Generative Language API (for Gemini)

3.  **Create a Service Account**:
    *   Navigate to **IAM & Admin > Service Accounts**.
    *   Click **Create Service Account**.
    *   Give it a name (e.g., `copilot-desktop-service`).
    *   Grant it the following roles: `Cloud Vision AI User`, `Cloud Speech-to-Text User`, `Cloud Text-to-Speech User`.
    *   Create a JSON key for the service account and download it.

4.  **Configure Environment**:
    *   Place the downloaded JSON key in the `server/` directory.
    *   Rename the key file to `service-account-key.json` or update the `.env` file to point to your key file.
    *   Update `server/.env` with your `GOOGLE_CLOUD_PROJECT_ID`.

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

## Messaging Assistance Feature (Experimental)

This experimental feature monitors your screen for new messages in supported applications and helps you draft replies using AI.

-   **How it Works**: Enable the feature via the "eye" icon (👁️). The app periodically takes screenshots, uses OCR to detect new messages, and notifies you. You can then generate a draft reply and copy it to your clipboard.
-   **Configuration**: Use the settings icon (⚙️) to select which applications to monitor and adjust the check frequency.
-   **Privacy**: Screenshots are processed locally and sent to the backend for analysis. Be mindful of on-screen content when this feature is active.
-   **Limitations**: This feature relies on screen layout and OCR, so its accuracy may vary. It requires the messaging app to be visible on the screen.

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

This project is licensed under the MIT License.
