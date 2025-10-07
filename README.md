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

## Messaging Assistance Feature (Experimental)

The messaging assistance feature helps you monitor for new messages and generate AI-powered draft replies.

### ✨ Recent Improvements (October 2025)

The application detection system has been completely overhauled for better reliability:

-   ✅ **Cross-Platform Support**: Now works reliably on macOS, Windows, and Linux
-   ✅ **Smart App Detection**: Automatically detects Gmail, Slack, Discord, Teams, and more
-   ✅ **Web App Support**: Recognizes web apps in browsers (Gmail in Chrome, Slack Web, etc.)
-   ✅ **Better Accuracy**: Handles platform-specific app name variations automatically
-   ✅ **Comprehensive Logging**: Detailed logs for easy troubleshooting

See [APPLICATION_DETECTION_FIX.md](APPLICATION_DETECTION_FIX.md) for technical details.

### How It Works

1. **Configure Settings**: Click the settings icon (⚙️) to select which apps to monitor and set check interval
2. **Start Watching**: Click the eye icon (👁️) button to start monitoring for new messages
3. **Automatic Detection**: The app uses OS-level window detection and OCR to identify messages
4. **AI-Powered Replies**: When a new message is detected, click "Copy Draft Reply" to generate an AI response
5. **Manual Pasting**: Paste the draft (Cmd+V / Ctrl+V) into your messaging application

### Supported Applications

**Messaging Apps:**
- Slack (desktop and web)
- Discord (desktop and web)
- Microsoft Teams (desktop and web)
- WhatsApp (desktop and web)
- Telegram (desktop and web)

**Email Clients:**
- Gmail (web)
- Outlook (desktop and web)
- Thunderbird

**Browsers:**
- Google Chrome
- Firefox
- Microsoft Edge
- Safari

### Important Limitations

⚠️ **This is an experimental feature with known limitations:**

-   **Accuracy**: Message detection uses window detection + OCR, which may not work reliably in all scenarios
-   **Screen Layout**: Works best with messaging apps that have consistent layouts
-   **Performance**: Captures screenshots periodically, which may impact system performance
-   **Privacy**: Screenshots are processed locally and sent to the backend for OCR analysis
-   **Manual Action Required**: You must manually paste the generated reply - no automated clicking or typing

### Requirements

**Platform-Specific:**
-   **macOS**: Accessibility and screen recording permissions
-   **Windows**: PowerShell execution policy allows scripts
-   **Linux**: `xdotool` and `xprop` installed (`sudo apt-get install xdotool x11-utils`)

**General:**
-   Backend server running with Google Cloud Vision API configured
-   Messaging application visible on screen
-   App selected in monitoring settings

### Best Practices

1. **Configure First**: Open settings (⚙️) and select which apps to monitor
2. **Test First**: Try the feature with a test conversation to understand its behavior
3. **Review Drafts**: Always review AI-generated replies before sending
4. **Check Logs**: If detection isn't working, check backend logs for detailed information
5. **Stop When Not Needed**: Click the eye icon again to stop monitoring and save system resources

### Troubleshooting

**No messages detected?**
1. Check that the app is selected in monitoring settings
2. Verify screen recording/accessibility permissions are granted
3. Check backend logs for detection details
4. See [APPLICATION_DETECTION_TESTING_GUIDE.md](APPLICATION_DETECTION_TESTING_GUIDE.md)

**App not detected correctly?**
1. Check backend logs for raw app name
2. Report the issue with app name and platform
3. See [APPLICATION_DETECTION_FIX.md](APPLICATION_DETECTION_FIX.md) for adding new apps

### Documentation

-   **Quick Start**: [MESSAGING_ASSISTANCE_QUICK_START.md](MESSAGING_ASSISTANCE_QUICK_START.md)
-   **Technical Details**: [APPLICATION_DETECTION_FIX.md](APPLICATION_DETECTION_FIX.md)
-   **Testing Guide**: [APPLICATION_DETECTION_TESTING_GUIDE.md](APPLICATION_DETECTION_TESTING_GUIDE.md)
-   **Version 2 Updates**: [MESSAGING_ASSISTANCE_V2_UPDATE.md](MESSAGING_ASSISTANCE_V2_UPDATE.md)

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
