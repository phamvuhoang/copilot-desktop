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

To use the Google Cloud services (Speech-to-Text, Text-to-Speech, and Vision), you need to set up a Google Cloud project and create a service account.

### Creating a Service Account

1.  **Go to the Google Cloud Console:** [https://console.cloud.google.com/](https://console.cloud.google.com/)
2.  **Create a new project** or select an existing one.
3.  **Navigate to "IAM & Admin" > "Service Accounts".**
4.  **Click "Create Service Account".**
5.  **Give the service account a name** (e.g., "copilot-desktop-service-account").
6.  **Grant the service account the "Editor" role** for simplicity. For production environments, it is recommended to create a custom role with only the necessary permissions.
7.  **Click "Done" to create the service account.**
8.  **Click on the newly created service account.**
9.  **Go to the "Keys" tab and click "Add Key" > "Create new key".**
10. **Select "JSON" as the key type and click "Create".** A JSON file will be downloaded to your computer.
11. **Rename the downloaded JSON file to `service-account-key.json`** and place it in the `server` and update `server/config/settings.py` if necessary.

### Enabling APIs

You need to enable the following APIs for your project:

*   **Cloud Speech-to-Text API**
*   **Cloud Text-to-Speech API**
*   **Cloud Vision API**
*   **Vertex AI API** (for Gemini)

You can enable these APIs by navigating to the **"APIs & Services" > "Library"** in the Google Cloud Console and searching for each API.

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
