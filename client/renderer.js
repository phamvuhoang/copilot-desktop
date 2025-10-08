// No direct require needed - we use window.electronAPI from preload script

class AICopilotRenderer {
    constructor() {
        this.messageInput = null;
        this.chatHistory = null;
        this.sendBtn = null;
        this.statusIndicator = null;
        this.charCount = null;
        this.loadingOverlay = null;

        this.isProcessing = false;
        this.messageHistory = [];
        this.apiBaseUrl = window.clientConfig ? window.clientConfig.getApiBaseUrl() : 'http://127.0.0.1:8000/api/v1';
        this.failedMessages = new Map(); // Store failed messages for retry

        console.log('AICopilotRenderer constructor - API Base URL:', this.apiBaseUrl);

        // Voice functionality
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];

        // Message watching
        this.isWatchingMessages = false;
        this.messageWatcherInterval = null;
        this.seenMessages = new Set(); // Track seen messages to avoid duplicates
        this.messageCheckInterval = 10000; // 10 seconds default
        this.detectedMessages = []; // Store all detected messages
        this.monitoredApps = ['chrome', 'slack']; // Default apps to monitor

        // Load settings from localStorage
        this.loadMessagingSettings();

        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupUI());
        } else {
            this.setupUI();
        }
    }

    setupUI() {
        console.log('Setting up UI...');

        // Get DOM elements
        this.messageInput = document.getElementById('messageInput');
        this.chatHistory = document.getElementById('chatHistory');
        this.sendBtn = document.getElementById('sendBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.charCount = document.querySelector('.char-count');
        this.loadingOverlay = document.getElementById('loadingOverlay');

        console.log('DOM elements found:', {
            messageInput: !!this.messageInput,
            chatHistory: !!this.chatHistory,
            sendBtn: !!this.sendBtn,
            statusIndicator: !!this.statusIndicator,
            charCount: !!this.charCount,
            loadingOverlay: !!this.loadingOverlay
        });

        // Setup event listeners
        this.setupEventListeners();

        // Initialize UI state
        this.updateUI();

        // Check API status
        this.initializeAPI();

        console.log('AI Copilot Renderer initialized');
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');

        // Message input events - combine input handlers
        this.messageInput.addEventListener('input', () => {
            this.handleInputChange();
            this.autoResizeTextarea();
        });
        this.messageInput.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Button events
        this.sendBtn.addEventListener('click', () => {
            console.log('Send button clicked');
            this.sendMessage();
        });
        document.getElementById('minimizeBtn').addEventListener('click', () => this.hideWindow());
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        document.getElementById('overlayBtn').addEventListener('click', () => this.toggleOverlayMode());

        // Voice and screenshot buttons
        document.getElementById('voiceBtn').addEventListener('click', () => this.handleVoiceInput());
        document.getElementById('screenshotBtn').addEventListener('click', () => this.handleScreenshot());
        document.getElementById('watchMessagesBtn').addEventListener('click', () => this.toggleMessageWatcher());
        document.getElementById('messagingSettingsBtn').addEventListener('click', () => this.openMessagingSettings());

        // Screenshot preview controls
        document.getElementById('screenshotClose').addEventListener('click', () => this.closeScreenshotPreview());
        document.getElementById('analyzeScreenshot').addEventListener('click', () => this.analyzeScreenshot());
        document.getElementById('screenshotQuery').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.analyzeScreenshot();
            }
        });

        // Focus input when window is shown
        window.addEventListener('focus', () => {
            setTimeout(() => this.messageInput.focus(), 100);
        });

        console.log('Event listeners set up successfully');
    }

    handleInputChange() {
        const text = this.messageInput.value;
        const length = text.length;
        
        // Update character count
        this.charCount.textContent = `${length}/2000`;
        
        // Update send button state
        this.sendBtn.disabled = length === 0 || this.isProcessing;
        
        // Update character count color
        if (length > 1800) {
            this.charCount.style.color = '#ef4444';
        } else if (length > 1500) {
            this.charCount.style.color = '#f59e0b';
        } else {
            this.charCount.style.color = '#6b7280';
        }
    }

    handleKeyDown(e) {
        console.log('Key pressed:', e.key, 'Shift:', e.shiftKey);

        // Send message on Enter (without Shift)
        if (e.key === 'Enter' && !e.shiftKey) {
            console.log('Enter key detected, preventing default and sending message');
            e.preventDefault();
            if (!this.sendBtn.disabled) {
                console.log('Send button not disabled, calling sendMessage');
                this.sendMessage();
            } else {
                console.log('Send button is disabled');
            }
        }

        // Hide window on Escape
        if (e.key === 'Escape') {
            this.hideWindow();
        }
    }

    autoResizeTextarea() {
        const textarea = this.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    async sendMessage() {
        console.log('sendMessage called');
        const message = this.messageInput.value.trim();
        console.log('Message content:', message);
        console.log('Is processing:', this.isProcessing);
        if (!message || this.isProcessing) {
            console.log('Returning early - no message or processing');
            return;
        }

        // Add user message to chat
        this.addMessage(message, 'user');
        
        // Clear input
        this.messageInput.value = '';
        this.handleInputChange();
        this.autoResizeTextarea();
        
        // Set processing state
        this.setProcessingState(true);
        
        try {
            // Use the new process endpoint for enhanced command processing
            await this.processCommand(message, 'text');

        } catch (error) {
            console.error('Error sending message:', error);

            let errorMessage = 'Sorry, I encountered an error processing your request.';

            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = 'Unable to connect to the AI service. Please check that the backend server is running.';
                this.setStatus('error', 'Connection failed');
            } else if (error.message.includes('timed out')) {
                errorMessage = 'The request timed out. Please try again with a shorter message.';
                this.setStatus('error', 'Request timeout');
            } else {
                errorMessage = `Error: ${error.message}`;
                this.setStatus('error', 'Error occurred');
            }

            this.addMessage(errorMessage, 'assistant', true, null, message);
        } finally {
            this.setProcessingState(false);
        }
    }

    // Enhanced command processing using the new /process endpoint
    async processCommand(input, inputType = 'text', audioData = null) {
        try {
            this.setStatus('processing', 'Processing command...');

            const requestBody = {
                input_type: inputType,
                conversation_history: this.messageHistory
                    .filter(msg => msg.sender !== 'system')
                    .slice(-10) // Keep last 10 messages for context
                    .map(msg => ({
                        role: msg.sender === 'user' ? 'user' : 'assistant',
                        content: msg.content,
                        timestamp: msg.timestamp
                    })),
                include_audio_response: inputType === 'audio', // Enable audio response for voice input
                language: 'en-US'
            };

            if (inputType === 'text') {
                requestBody.text = input;
            } else if (inputType === 'audio') {
                requestBody.audio_data = audioData;
            }

            const response = await fetch(`${this.apiBaseUrl}/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Debug logging
            console.log('=== PROCESS RESPONSE DEBUG ===');
            console.log('Has action:', !!data.action);
            console.log('Has response:', !!data.response);
            console.log('Action value:', data.action);
            console.log('Response value:', data.response);
            console.log('Intent:', data.intent);
            console.log('Full response:', JSON.stringify(data, null, 2));
            console.log('==============================');

            // For audio input, add the transcribed text as user message
            if (inputType === 'audio' && data.transcription) {
                this.addMessage(data.transcription, 'user');
            }

            // Handle different response types
            if (data.action) {
                // Handle action commands
                console.log('→ Executing action:', data.action);
                await this.handleActionCommand(data.action, data.query, data.intent);
            } else if (data.response) {
                // Handle direct responses
                console.log('→ Showing response');
                this.addMessage(data.response, 'assistant');

                // Play audio response if available
                if (data.audio_data && data.audio_format) {
                    await this.playAudioResponse(data.audio_data, data.audio_format);
                }
            } else {
                // Neither action nor response - this shouldn't happen
                console.error('→ ERROR: No action or response in data!');
                this.addMessage('I received an unexpected response format. Please try again.', 'assistant', true);
            }

            this.setStatus('ready', 'Command processed');

        } catch (error) {
            console.error('Error processing command:', error);
            throw error; // Re-throw to be handled by caller
        }
    }

    // Handle action commands from the process endpoint
    async handleActionCommand(action, query, intent) {
        try {
            switch (action) {
                case 'take_screenshot':
                    this.setStatus('processing', 'Taking screenshot...');
                    await this.captureAndSendScreenshot(query);
                    break;

                case 'open_application':
                    this.setStatus('processing', 'Opening application...');
                    await this.handleOpenApplication(query);
                    break;

                default:
                    console.warn(`Unknown action: ${action}`);
                    this.addMessage(`I understand you want me to ${action}, but I don't know how to do that yet.`, 'assistant', true);
                    break;
            }
        } catch (error) {
            console.error(`Error handling action ${action}:`, error);
            this.addMessage(`Sorry, I had trouble executing that command: ${error.message}`, 'assistant', true);
        }
    }

    // Handle application opening
    async handleOpenApplication(query) {
        try {
            // Extract application name from the query
            const applicationName = this.extractApplicationName(query);

            if (!applicationName) {
                this.addMessage(`I couldn't identify which application you want to open from: "${query}". Please try being more specific, like "Open Chrome" or "Launch Notion".`, 'assistant');
                this.setStatus('ready', 'Could not identify application');
                return;
            }

            this.setStatus('processing', `Opening ${applicationName}...`);

            // Call the Electron API to open the application
            const result = await window.electronAPI.openApplication(applicationName);

            if (result.success) {
                this.addMessage(`Successfully opened ${result.application}! 🚀`, 'assistant');
                this.setStatus('ready', `Opened ${result.application}`);
            } else {
                this.addMessage(`Sorry, I couldn't open "${applicationName}". ${result.message || 'The application might not be installed or accessible.'}`, 'assistant');
                this.setStatus('ready', 'Failed to open application');
            }

        } catch (error) {
            console.error('Error opening application:', error);
            this.addMessage(`Sorry, I encountered an error while trying to open the application: ${error.message}`, 'assistant');
            this.setStatus('ready', 'Application opening failed');
        }
    }

    // Extract application name from user query
    extractApplicationName(query) {
        const text = query.toLowerCase().trim();

        // Common application names and their variations
        const appMappings = {
            // Browsers
            'chrome': ['chrome', 'google chrome'],
            'firefox': ['firefox', 'mozilla firefox'],
            'safari': ['safari'],
            'edge': ['edge', 'microsoft edge'],

            // Development
            'vscode': ['vscode', 'vs code', 'visual studio code', 'code'],
            'terminal': ['terminal', 'command line', 'cmd', 'powershell'],

            // Productivity
            'notion': ['notion'],
            'slack': ['slack'],
            'discord': ['discord'],
            'zoom': ['zoom'],
            'teams': ['teams', 'microsoft teams'],
            'spotify': ['spotify'],

            // System apps
            'calculator': ['calculator', 'calc'],
            'notepad': ['notepad', 'text editor'],
            'finder': ['finder', 'files', 'file manager'],
            'mail': ['mail', 'email'],
            'calendar': ['calendar'],
            'notes': ['notes']
        };

        // Look for trigger words followed by app names
        const triggerWords = ['open', 'launch', 'start', 'run', 'execute'];
        const words = text.split(/\s+/);

        // Find trigger word and extract following words
        for (let i = 0; i < words.length; i++) {
            if (triggerWords.includes(words[i])) {
                // Get the rest of the words after the trigger
                const appPart = words.slice(i + 1).join(' ');

                // Check against known applications
                for (const [appKey, variations] of Object.entries(appMappings)) {
                    for (const variation of variations) {
                        if (appPart.includes(variation)) {
                            return appKey;
                        }
                    }
                }

                // If no exact match, return the first word after trigger
                if (words[i + 1]) {
                    return words[i + 1];
                }
            }
        }

        // Fallback: check if any app name is mentioned anywhere in the text
        for (const [appKey, variations] of Object.entries(appMappings)) {
            for (const variation of variations) {
                if (text.includes(variation)) {
                    return appKey;
                }
            }
        }

        return null;
    }

    async sendToAPI(message) {
        // Prepare conversation history for API
        const conversationHistory = this.messageHistory
            .filter(msg => msg.sender !== 'system')
            .map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.content,
                timestamp: msg.timestamp
            }));

        // Prepare request payload
        const requestData = {
            message: message,
            conversation_history: conversationHistory,
            system_prompt: "You are AI Copilot, a helpful desktop assistant. Provide concise, accurate, and helpful responses. Be friendly and professional."
        };

        // Make API request with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
            const response = await fetch(`${this.apiBaseUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            throw error;
        }
    }

    async checkAPIStatus() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/chat/status`);
            if (response.ok) {
                const data = await response.json();
                return data.status === 'available';
            }
        } catch (error) {
            console.warn('API status check failed:', error);
        }
        return false;
    }

    async initializeAPI() {
        const isAPIAvailable = await this.checkAPIStatus();
        if (isAPIAvailable) {
            this.setStatus('ready', 'Connected to AI');
        } else {
            this.setStatus('error', 'API not available');
            this.addMessage(
                'Warning: Backend API is not available. Please make sure the server is running on http://127.0.0.1:8000',
                'assistant',
                true
            );
        }
    }

    addMessage(content, sender, isError = false, messageId = null, originalMessage = null, actions = []) {
        // Remove welcome message if it exists
        const welcomeMessage = this.chatHistory.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        // Generate message ID if not provided
        if (!messageId) {
            messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
        }

        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${sender}`;
        messageDiv.dataset.messageId = messageId;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // Check if content is JSON or Markdown and format it beautifully
        const formattedContent = this.formatMessageContent(content);
        if (formattedContent.isJson) {
            contentDiv.innerHTML = formattedContent.html;
            contentDiv.classList.add('json-content');
        } else if (formattedContent.isMarkdown) {
            contentDiv.innerHTML = formattedContent.html;
            contentDiv.classList.add('markdown-content');
        } else {
            contentDiv.textContent = content;
        }

        if (isError) {
            contentDiv.style.background = '#fee2e2';
            contentDiv.style.color = '#dc2626';
            contentDiv.style.borderColor = '#fecaca';
        }

        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'message-timestamp';
        timestampDiv.textContent = new Date().toLocaleTimeString();

        // Add copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.innerHTML = '📋';
        copyBtn.title = 'Copy message';
        copyBtn.onclick = () => this.copyMessage(content);

        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';
        messageHeader.appendChild(timestampDiv);
        messageHeader.appendChild(copyBtn);

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(messageHeader);

        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.style.marginTop = '8px';
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '8px';

        if (actions && actions.length > 0) {
            actions.forEach(action => {
                const button = document.createElement('button');
                button.className = 'action-btn';
                button.textContent = action.label;
                button.onclick = action.onClick;
                button.style.cssText = `
                    padding: 4px 8px;
                    border: 1px solid #d1d5db;
                    border-radius: 4px;
                    background: #f9fafb;
                    color: #374151;
                    cursor: pointer;
                    font-size: 12px;
                `;
                actionsDiv.appendChild(button);
            });
        }

        if (isError && sender === 'assistant' && originalMessage) {
            const retryBtn = document.createElement('button');
            retryBtn.className = 'action-btn retry-btn';
            retryBtn.innerHTML = '🔄 Retry';
            retryBtn.title = 'Retry sending the message';
            retryBtn.style.cssText = `
                padding: 4px 8px;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                background: #f9fafb;
                color: #374151;
                cursor: pointer;
                font-size: 12px;
            `;
            retryBtn.onclick = () => this.retryFailedMessage(messageId);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.innerHTML = '🗑️ Delete';
            deleteBtn.title = 'Delete this message';
            deleteBtn.style.cssText = `
                padding: 4px 8px;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                background: #f9fafb;
                color: #374151;
                cursor: pointer;
                font-size: 12px;
            `;
            deleteBtn.onclick = () => this.deleteMessage(messageId);

            actionsDiv.appendChild(retryBtn);
            actionsDiv.appendChild(deleteBtn);

            // Store failed message for retry
            this.failedMessages.set(messageId, originalMessage);
        }

        if (actionsDiv.hasChildNodes()) {
            messageDiv.appendChild(actionsDiv);
        }

        // Add to chat history
        this.chatHistory.appendChild(messageDiv);

        // Scroll to bottom
        this.scrollToBottom();

        // Store in history
        this.messageHistory.push({
            content,
            sender,
            timestamp: new Date().toISOString(),
            messageId,
            isError
        });

        return messageId;
    }

    scrollToBottom() {
        setTimeout(() => {
            this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }, 100);
    }

    retryFailedMessage(messageId) {
        const originalMessage = this.failedMessages.get(messageId);
        if (originalMessage) {
            // Remove the failed message from UI
            this.deleteMessage(messageId);

            // Resend the original message
            this.messageInput.value = originalMessage;
            this.sendMessage();
        }
    }

    deleteMessage(messageId) {
        // Remove from UI
        const messageElement = this.chatHistory.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }

        // Remove from failed messages
        this.failedMessages.delete(messageId);

        // Remove from message history
        this.messageHistory = this.messageHistory.filter(msg => msg.messageId !== messageId);
    }

    setProcessingState(processing) {
        this.isProcessing = processing;

        if (processing) {
            this.setStatus('processing', 'Processing...');
            // Remove overlay usage - use unified status indicator instead
        } else {
            this.setStatus('ready', 'Ready');
        }

        this.updateUI();
    }

    setStatus(type, message) {
        this.statusIndicator.className = `status-indicator ${type}`;
        this.statusIndicator.textContent = message;
    }

    updateUI() {
        // Update send button
        const hasText = this.messageInput && this.messageInput.value.trim().length > 0;
        if (this.sendBtn) {
            this.sendBtn.disabled = !hasText || this.isProcessing;
        }

        // Update watch messages button
        const watchBtn = document.getElementById('watchMessagesBtn');
        if (watchBtn) {
            if (this.isWatchingMessages) {
                watchBtn.classList.add('watching');
                watchBtn.title = 'Stop watching for messages';
            } else {
                watchBtn.classList.remove('watching');
                watchBtn.title = 'Watch for new messages';
            }
        }
    }

    // Window controls
    hideWindow() {
        window.electronAPI.hideWindow();
    }

    toggleOverlayMode() {
        window.electronAPI.toggleOverlayMode();
    }

    openSettings() {
        // TODO: Implement settings
        console.log('Settings not yet implemented');
        this.addMessage('Settings panel will be implemented in a future update.', 'assistant');
    }

    // Voice input implementation
    async handleVoiceInput() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            // Request microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.audioChunks = [];
            this.isRecording = true;

            // Update UI
            this.updateVoiceButton();
            this.setStatus('recording', 'Recording...');

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                await this.processVoiceInput(audioBlob);

                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();

        } catch (error) {
            console.error('Error starting recording:', error);
            this.setStatus('error', 'Microphone access denied');
            this.addMessage('Unable to access microphone. Please check permissions and try again.', 'assistant', true);
        }
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.updateVoiceButton();
            this.setStatus('processing', 'Processing voice...');
        }
    }

    updateVoiceButton() {
        const voiceBtn = document.getElementById('voiceBtn');
        if (this.isRecording) {
            voiceBtn.classList.add('recording');
            voiceBtn.title = 'Stop recording';
            voiceBtn.style.backgroundColor = '#ef4444';
            voiceBtn.style.color = 'white';
        } else {
            voiceBtn.classList.remove('recording');
            voiceBtn.title = 'Voice input';
            voiceBtn.style.backgroundColor = '';
            voiceBtn.style.color = '';
        }
    }

    async processVoiceInput(audioBlob) {
        try {
            // Convert audio blob to base64
            const arrayBuffer = await audioBlob.arrayBuffer();
            const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

            // Use the new process endpoint for enhanced voice command processing
            await this.processCommand(null, 'audio', base64Audio);

            this.setStatus('ready', 'Voice processed');

        } catch (error) {
            console.error('Error processing voice input:', error);
            this.setStatus('error', 'Voice processing failed');

            let errorMessage = 'Sorry, I had trouble processing your voice input.';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Unable to connect to voice service. Please check that the backend server is running.';
            } else if (error.message.includes('No speech detected')) {
                errorMessage = 'No speech detected. Please try speaking more clearly.';
            } else if (error.message.includes('Speech-to-Text service not available')) {
                errorMessage = 'Voice recognition service is not available. Please check the configuration.';
            }

            this.addMessage(errorMessage, 'assistant', true);
        }
    }

    async playAudioResponse(base64Audio, format) {
        try {
            // Convert base64 to blob
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: `audio/${format}` });

            // Create audio URL and play
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
            };

            await audio.play();

        } catch (error) {
            console.error('Error playing audio response:', error);
        }
    }

    // Screenshot functionality
    async _getScreenshotBlob() {
        const permissionStatus = await window.electronAPI.checkScreenPermission();
        if (!permissionStatus.hasPermission) {
            throw new Error('Screen recording permission required. Please grant permission and try again.');
        }

        const sources = await window.electronAPI.getScreenSources();
        if (!sources || sources.length === 0) {
            throw new Error('No screen sources available');
        }

        const primarySource = sources.find(source => source.name === 'Entire Screen') || sources[0];

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: primarySource.id,
                    minWidth: 1280,
                    maxWidth: 1920,
                    minHeight: 720,
                    maxHeight: 1080
                }
            }
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        await new Promise(resolve => {
            video.onloadedmetadata = resolve;
        });

        const canvas = document.createElement('canvas');
        const aspectRatio = video.videoWidth / video.videoHeight;
        let canvasWidth = video.videoWidth;
        let canvasHeight = video.videoHeight;
        const maxWidth = 1920;
        const maxHeight = 1080;

        if (canvasWidth > maxWidth) {
            canvasWidth = maxWidth;
            canvasHeight = maxWidth / aspectRatio;
        }
        if (canvasHeight > maxHeight) {
            canvasHeight = maxHeight;
            canvasWidth = maxHeight * aspectRatio;
        }

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);

        stream.getTracks().forEach(track => track.stop());

        return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    }

    async _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async handleScreenshot() {
        try {
            this.setStatus('processing', 'Capturing screenshot...');
            const blob = await this._getScreenshotBlob();
            if (!blob) throw new Error("Failed to capture screenshot.");

            const imageUrl = URL.createObjectURL(blob);
            this.currentScreenshot = { blob, url: imageUrl };
            this.showScreenshotPreview(imageUrl);
            this.setStatus('ready', 'Screenshot captured');
        } catch (error) {
            console.error('Error capturing screenshot:', error);
            this.setStatus('error', 'Screenshot capture failed');
            this.addMessage(`Failed to capture screenshot: ${error.message}`, 'assistant', true);
        }
    }

    showScreenshotPreview(imageUrl) {
        const preview = document.getElementById('screenshotPreview');
        const image = document.getElementById('screenshotImage');
        const queryInput = document.getElementById('screenshotQuery');
        image.src = imageUrl;
        queryInput.value = '';
        preview.style.display = 'block';
        setTimeout(() => queryInput.focus(), 100);
    }

    closeScreenshotPreview() {
        const preview = document.getElementById('screenshotPreview');
        preview.style.display = 'none';
        if (this.currentScreenshot) {
            URL.revokeObjectURL(this.currentScreenshot.url);
            this.currentScreenshot = null;
        }
    }

    async analyzeScreenshot() {
        if (!this.currentScreenshot) {
            this.addMessage('No screenshot available to analyze.', 'assistant', true);
            return;
        }
        const query = document.getElementById('screenshotQuery').value.trim();
        if (!query) {
            this.addMessage('Please enter a question about the screenshot.', 'assistant', true);
            document.getElementById('screenshotQuery').focus();
            return;
        }

        try {
            this.setStatus('processing', 'Analyzing screenshot...');
            const base64Image = await this._blobToBase64(this.currentScreenshot.blob);

            const response = await fetch(`${this.apiBaseUrl}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_data: base64Image,
                    query: query,
                    image_format: 'jpeg',
                    use_structured_ocr: false,
                    language_hints: ['en']
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.addMessage(query, 'user');
            if (data.analysis) {
                this.addMessage(data.analysis, 'assistant');
            }
            this.closeScreenshotPreview();
            this.setStatus('ready', 'Screenshot analyzed');
        } catch (error) {
            console.error('Error analyzing screenshot:', error);
            this.setStatus('error', 'Screenshot analysis failed');
            this.addMessage(`Sorry, I had trouble analyzing the screenshot: ${error.message}`, 'assistant', true);
        }
    }

    async captureAndSendScreenshot(query) {
        try {
            this.setStatus('processing', 'Capturing and analyzing screenshot...');
            const blob = await this._getScreenshotBlob();
            if (!blob) throw new Error("Failed to capture screenshot.");
            const base64Image = await this._blobToBase64(blob);

            const response = await fetch(`${this.apiBaseUrl}/screenshot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_data: base64Image,
                    query: query,
                    image_format: 'jpeg',
                    use_structured_ocr: false,
                    language_hints: ['en']
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.addMessage(query, 'user');
            if (data.analysis) {
                this.addMessage(data.analysis, 'assistant');
            }
            this.setStatus('ready', 'Screenshot analyzed');
        } catch (error) {
            console.error('Error in automated screenshot capture:', error);
            this.setStatus('error', 'Automated screenshot failed');
            this.addMessage(`Sorry, I had trouble automatically capturing and analyzing the screenshot: ${error.message}`, 'assistant', true);
        }
    }

    // Message formatting and utility methods
    formatMessageContent(content) {
        // Try to detect and format JSON content first
        try {
            const trimmed = content.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {

                const parsed = JSON.parse(trimmed);
                const formatted = JSON.stringify(parsed, null, 2);

                return {
                    isJson: true,
                    isMarkdown: false,
                    html: `<pre class="json-formatted"><code>${this.escapeHtml(formatted)}</code></pre>`
                };
            }
        } catch (e) {
            // Not valid JSON, continue to check for markdown
        }

        // Check if content contains markdown patterns
        if (this.containsMarkdown(content)) {
            return {
                isJson: false,
                isMarkdown: true,
                html: this.renderMarkdown(content)
            };
        }

        return {
            isJson: false,
            isMarkdown: false,
            html: null
        };
    }

    containsMarkdown(text) {
        // Check for common markdown patterns
        const markdownPatterns = [
            /^#{1,6}\s+/m,           // Headers
            /\*\*.*?\*\*/,           // Bold
            /\*.*?\*/,               // Italic
            /`.*?`/,                 // Inline code
            /```[\s\S]*?```/,        // Code blocks
            /^\s*[-*+]\s+/m,         // Unordered lists
            /^\s*\d+\.\s+/m,         // Ordered lists
            /\[.*?\]\(.*?\)/,        // Links
            /^\s*>\s+/m,             // Blockquotes
            /^\s*\|.*\|.*\|/m,       // Tables
            /---+/,                  // Horizontal rules
            /~~.*?~~/                // Strikethrough
        ];

        return markdownPatterns.some(pattern => pattern.test(text));
    }

    renderMarkdown(text) {
        let html = this.escapeHtml(text);

        // Headers (must be processed first)
        html = html.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, content) => {
            const level = hashes.length;
            return `<h${level} class="md-header md-h${level}">${content.trim()}</h${level}>`;
        });

        // Code blocks (must be before inline code)
        html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang ? ` data-language="${lang}"` : '';
            return `<pre class="md-code-block"${language}><code>${code.trim()}</code></pre>`;
        });

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

        // Bold (must be before italic)
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="md-bold">$1</strong>');

        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em class="md-italic">$1</em>');

        // Strikethrough
        html = html.replace(/~~([^~]+)~~/g, '<del class="md-strikethrough">$1</del>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link" target="_blank" rel="noopener noreferrer">$1</a>');

        // Blockquotes
        html = html.replace(/^>\s+(.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

        // Horizontal rules
        html = html.replace(/^---+$/gm, '<hr class="md-hr">');

        // Unordered lists
        html = html.replace(/^(\s*)([-*+])\s+(.+)$/gm, (match, indent, bullet, content) => {
            const level = Math.floor(indent.length / 2);
            return `<li class="md-list-item md-ul-item" data-level="${level}">${content}</li>`;
        });

        // Ordered lists
        html = html.replace(/^(\s*)(\d+)\.\s+(.+)$/gm, (match, indent, num, content) => {
            const level = Math.floor(indent.length / 2);
            return `<li class="md-list-item md-ol-item" data-level="${level}" data-number="${num}">${content}</li>`;
        });

        // Wrap consecutive list items in ul/ol tags
        html = this.wrapListItems(html);

        // Convert line breaks to paragraphs
        html = this.convertToParagraphs(html);

        return html;
    }

    wrapListItems(html) {
        // Wrap consecutive unordered list items
        html = html.replace(/((?:<li class="md-list-item md-ul-item"[^>]*>.*?<\/li>\s*)+)/g,
            '<ul class="md-list md-ul">$1</ul>');

        // Wrap consecutive ordered list items
        html = html.replace(/((?:<li class="md-list-item md-ol-item"[^>]*>.*?<\/li>\s*)+)/g,
            '<ol class="md-list md-ol">$1</ol>');

        return html;
    }

    convertToParagraphs(html) {
        // Split by double line breaks and wrap in paragraphs
        const lines = html.split('\n');
        let result = [];
        let currentParagraph = [];

        for (let line of lines) {
            const trimmed = line.trim();

            // Skip if it's already a block element
            if (trimmed.match(/^<(h[1-6]|pre|blockquote|ul|ol|hr|li)/)) {
                if (currentParagraph.length > 0) {
                    result.push(`<p class="md-paragraph">${currentParagraph.join(' ')}</p>`);
                    currentParagraph = [];
                }
                result.push(trimmed);
            } else if (trimmed === '') {
                if (currentParagraph.length > 0) {
                    result.push(`<p class="md-paragraph">${currentParagraph.join(' ')}</p>`);
                    currentParagraph = [];
                }
            } else {
                currentParagraph.push(trimmed);
            }
        }

        if (currentParagraph.length > 0) {
            result.push(`<p class="md-paragraph">${currentParagraph.join(' ')}</p>`);
        }

        return result.join('\n');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async copyMessage(content) {
        try {
            await navigator.clipboard.writeText(content);

            // Show temporary feedback
            const notification = document.createElement('div');
            notification.className = 'copy-notification';
            notification.textContent = 'Copied to clipboard!';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #10b981;
                color: white;
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 14px;
                z-index: 1000;
                animation: slideIn 0.3s ease-out;
            `;

            document.body.appendChild(notification);

            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, 2000);

        } catch (error) {
            console.error('Failed to copy to clipboard:', error);

            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = content;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    clearChat() {
        this.chatHistory.innerHTML = '';
        this.messageHistory = [];
        // Re-add welcome message
        this.addWelcomeMessage();
    }

    addWelcomeMessage() {
        const welcomeHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">🤖</div>
                <h2>Welcome to AI Copilot</h2>
                <p>I'm here to help you with any questions or tasks. You can:</p>
                <ul>
                    <li>Type your questions in the chat</li>
                    <li>Use voice input with the microphone button</li>
                    <li>Share screenshots for analysis with the camera button</li>
                </ul>
                <p class="shortcut-hint">Press <kbd>Ctrl+Shift+C</kbd> to show/hide this window</p>
            </div>
        `;
        this.chatHistory.innerHTML = welcomeHTML;
    }

    // Messaging Features
    toggleMessageWatcher() {
        if (this.isWatchingMessages) {
            this.stopMessageWatcher();
        } else {
            this.startMessageWatcher();
        }
    }

    startMessageWatcher() {
        this.isWatchingMessages = true;
        this.seenMessages.clear(); // Clear seen messages when starting
        this.detectedMessages = []; // Clear detected messages

        const intervalSeconds = this.messageCheckInterval / 1000;
        const appsText = this.monitoredApps.join(', ');
        this.addMessage(
            `Started watching for new messages from: ${appsText}. Checking every ${intervalSeconds} seconds.`,
            'system'
        );
        this.updateUI();
        this.checkForNewMessages(); // Check immediately
        this.messageWatcherInterval = setInterval(() => this.checkForNewMessages(), this.messageCheckInterval);
    }

    stopMessageWatcher() {
        this.isWatchingMessages = false;
        this.addMessage('Stopped watching for new messages.', 'system');
        this.updateUI();
        if (this.messageWatcherInterval) {
            clearInterval(this.messageWatcherInterval);
            this.messageWatcherInterval = null;
        }
        this.closeMessagesPanel();
    }

    async checkForNewMessages() {
        if (!this.isWatchingMessages) return; // Safety check

        try {
            // Get active window title for better app detection
            let activeWindowInfo = null;
            try {
                console.log('Attempting to get active window title...');
                activeWindowInfo = await window.electronAPI.getActiveWindowTitle();
                console.log('Active window info received:', activeWindowInfo);

                if (activeWindowInfo && activeWindowInfo.success) {
                    console.log(`Active app: ${activeWindowInfo.appName}, Window: ${activeWindowInfo.windowTitle}`);
                } else {
                    console.warn('Failed to get active window info:', activeWindowInfo);
                }
            } catch (error) {
                console.error('Error getting active window title:', error);
            }

            const base64Image = await this.captureScreenForAnalysis();
            if (!base64Image) {
                console.warn('Could not capture screen for message checking');
                return;
            }

            const requestBody = {
                image_data: base64Image,
                monitored_apps: this.monitoredApps,
                active_window: activeWindowInfo?.success ? activeWindowInfo : null
            };

            console.log('Sending request with active_window:', requestBody.active_window ?
                `${requestBody.active_window.appName} | ${requestBody.active_window.windowTitle}` :
                'null');

            const response = await fetch(`${this.apiBaseUrl}/messaging/check-new`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                console.error(`Failed to check for new messages: ${response.status} ${response.statusText}`);
                return;
            }

            const data = await response.json();
            if (data.messages && data.messages.length > 0) {
                let newMessageCount = 0;
                data.messages.forEach(msg => {
                    // Create unique identifier for deduplication
                    const messageKey = `${msg.sender}:${msg.snippet}`;

                    if (!this.seenMessages.has(messageKey)) {
                        this.seenMessages.add(messageKey);
                        newMessageCount++;

                        // Add to detected messages array
                        const messageData = {
                            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            sender: msg.sender,
                            snippet: msg.snippet,
                            app: msg.app || 'unknown',
                            timestamp: new Date()
                        };
                        this.detectedMessages.unshift(messageData); // Add to beginning
                    }
                });

                if (newMessageCount > 0) {
                    console.log(`Detected ${newMessageCount} new message(s)`);
                    this.updateMessagesPanel();
                    this.showMessagesPanel();
                }
            }
        } catch (error) {
            console.error('Error checking for new messages:', error);
            // Don't show error to user for background checks, just log it
        }
    }

    async getDraftReply(prompt) {
        try {
            // Use /chat endpoint instead of /process to avoid intent detection issues
            const requestBody = {
                message: prompt,
                system_prompt: 'You are a helpful assistant that writes message replies. Provide only the reply text, nothing else. Do not include greetings like "Here is a reply:" or explanations.',
                conversation_history: this.messageHistory
                    .filter(msg => msg.sender !== 'system')
                    .slice(-10)
                    .map(msg => ({
                        role: msg.sender === 'user' ? 'user' : 'assistant',
                        content: msg.content
                    }))
            };

            const response = await fetch(`${this.apiBaseUrl}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Draft reply response data:', data);

            // /chat endpoint returns { message: "...", role: "assistant", ... }
            if (data.message && data.message.trim()) {
                return data.message;
            }

            // Log the full response to help debug
            console.error('No valid message field in data:', JSON.stringify(data, null, 2));

            // Return fallback instead of throwing
            return "Sorry, I couldn't generate a draft. Please try again.";

        } catch (error) {
            console.error('Error getting draft reply:', error);
            console.error('Error details:', error.message);

            // Always return fallback message instead of throwing
            return "Sorry, I couldn't generate a draft. Please try again.";
        }
    }

    async handleReply(message, messageId) {
        this.deleteMessage(messageId);
        this.addMessage(`Generating draft reply to ${message.sender}...`, 'system');

        try {
            // Generate draft reply using AI
            // Use a prompt that won't trigger action detection
            const draft = await this.getDraftReply(
                `I received this message from ${message.sender}: "${message.snippet}"\n\nPlease write a short, friendly reply for me.`
            );

            // Check if we got a fallback error message
            if (!draft || draft.includes("couldn't generate") || draft.includes("Sorry")) {
                this.addMessage(
                    `❌ Unable to generate draft reply. The AI service may be having issues. Please try again or write your reply manually.`,
                    'assistant',
                    true
                );
                return;
            }

            // Copy draft to clipboard
            const result = await window.electronAPI.copyToClipboard(draft);

            if (result.success) {
                this.addMessage(
                    `✅ Draft reply copied to clipboard:\n\n"${draft}"\n\n` +
                    `You can now paste it (Cmd+V / Ctrl+V) into your messaging app.`,
                    'assistant',
                    false,
                    null,
                    null,
                    [
                        {
                            label: 'Copy Again',
                            onClick: () => window.electronAPI.copyToClipboard(draft)
                        }
                    ]
                );
            } else {
                throw new Error('Failed to copy to clipboard');
            }

        } catch (error) {
            console.error('Error handling reply:', error);
            this.addMessage(
                `❌ Failed to generate reply: ${error.message}. Please try again.`,
                'assistant',
                true
            );
        }
    }

    async captureScreenForAnalysis() {
        try {
            const blob = await this._getScreenshotBlob();
            if (!blob) return null;
            return await this._blobToBase64(blob);
        } catch (error) {
            console.error("Error capturing screen for analysis:", error);
            this.addMessage(`Could not capture screen: ${error.message}`, "system", true);
            return null;
        }
    }

    // Settings Management
    loadMessagingSettings() {
        try {
            const settings = localStorage.getItem('messagingSettings');
            if (settings) {
                const parsed = JSON.parse(settings);
                this.messageCheckInterval = parsed.checkInterval || 10000;
                this.monitoredApps = parsed.monitoredApps || ['chrome', 'slack'];
            }
        } catch (error) {
            console.error('Error loading messaging settings:', error);
        }
    }

    saveMessagingSettings() {
        try {
            const settings = {
                checkInterval: this.messageCheckInterval,
                monitoredApps: this.monitoredApps
            };
            localStorage.setItem('messagingSettings', JSON.stringify(settings));
        } catch (error) {
            console.error('Error saving messaging settings:', error);
        }
    }

    openMessagingSettings() {
        const modal = document.getElementById('messagingSettingsModal');
        const intervalInput = document.getElementById('checkInterval');
        const checkboxes = document.querySelectorAll('.app-checkbox');

        // Set current values
        intervalInput.value = this.messageCheckInterval / 1000;
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.monitoredApps.includes(checkbox.value);
        });

        modal.style.display = 'flex';

        // Event handlers
        const closeBtn = document.getElementById('closeMessagingSettings');
        const cancelBtn = document.getElementById('cancelMessagingSettings');
        const saveBtn = document.getElementById('saveMessagingSettings');

        const closeModal = () => {
            modal.style.display = 'none';
        };

        closeBtn.onclick = closeModal;
        cancelBtn.onclick = closeModal;

        saveBtn.onclick = () => {
            // Get interval value
            const intervalSeconds = parseInt(intervalInput.value);
            if (intervalSeconds >= 5 && intervalSeconds <= 300) {
                this.messageCheckInterval = intervalSeconds * 1000;
            }

            // Get selected apps
            this.monitoredApps = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);

            // Save to localStorage
            this.saveMessagingSettings();

            // Restart watcher if active
            if (this.isWatchingMessages) {
                this.stopMessageWatcher();
                this.startMessageWatcher();
            }

            closeModal();
            this.addMessage('Messaging settings updated successfully.', 'system');
        };
    }

    // Messages Panel Management
    showMessagesPanel() {
        const panel = document.getElementById('messagesPanel');
        panel.style.display = 'flex';

        // Setup close button
        const closeBtn = document.getElementById('closeMessagesPanel');
        closeBtn.onclick = () => this.closeMessagesPanel();
    }

    closeMessagesPanel() {
        const panel = document.getElementById('messagesPanel');
        panel.style.display = 'none';
    }

    updateMessagesPanel() {
        const panelBody = document.getElementById('messagesPanelBody');
        const messageCount = document.getElementById('messageCount');

        messageCount.textContent = this.detectedMessages.length;

        if (this.detectedMessages.length === 0) {
            panelBody.innerHTML = `
                <div class="messages-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <p>No new messages detected</p>
                </div>
            `;
            return;
        }

        panelBody.innerHTML = this.detectedMessages.map(msg => {
            const snippetPreview = msg.snippet.length > 100
                ? msg.snippet.substring(0, 100) + '...'
                : msg.snippet;

            return `
                <div class="message-card" data-message-id="${msg.id}">
                    <div class="message-card-header">
                        <span class="message-sender">${this.escapeHtml(msg.sender)}</span>
                        <span class="message-app">${msg.app}</span>
                    </div>
                    <div class="message-snippet" data-full="${this.escapeHtml(msg.snippet)}">
                        ${this.escapeHtml(snippetPreview)}
                    </div>
                    ${msg.snippet.length > 100 ? '<button class="expand-btn">Show more</button>' : ''}
                    <div class="message-actions">
                        <button class="message-action-btn primary" onclick="renderer.handleMessageReply('${msg.id}')">
                            Copy Draft Reply
                        </button>
                        <button class="message-action-btn" onclick="renderer.dismissMessage('${msg.id}')">
                            Dismiss
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Add expand/collapse functionality
        panelBody.querySelectorAll('.expand-btn').forEach(btn => {
            btn.onclick = (e) => {
                const snippet = e.target.previousElementSibling;
                const isExpanded = snippet.classList.contains('expanded');

                if (isExpanded) {
                    const preview = snippet.dataset.full.substring(0, 100) + '...';
                    snippet.textContent = preview;
                    snippet.classList.remove('expanded');
                    e.target.textContent = 'Show more';
                } else {
                    snippet.textContent = snippet.dataset.full;
                    snippet.classList.add('expanded');
                    e.target.textContent = 'Show less';
                }
            };
        });
    }

    handleMessageReply(messageId) {
        const message = this.detectedMessages.find(m => m.id === messageId);
        if (!message) return;

        this.handleReply(message, messageId);
    }

    dismissMessage(messageId) {
        this.detectedMessages = this.detectedMessages.filter(m => m.id !== messageId);
        this.updateMessagesPanel();

        if (this.detectedMessages.length === 0) {
            this.closeMessagesPanel();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the renderer when the script loads and make it globally accessible
const renderer = new AICopilotRenderer();
window.renderer = renderer; // Make accessible for onclick handlers
