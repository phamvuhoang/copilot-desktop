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

        // Voice and screenshot buttons
        document.getElementById('voiceBtn').addEventListener('click', () => this.handleVoiceInput());
        document.getElementById('screenshotBtn').addEventListener('click', () => this.handleScreenshot());

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
            // Send to backend API
            const response = await this.sendToAPI(message);
            this.addMessage(response.message, 'assistant');

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

    addMessage(content, sender, isError = false, messageId = null, originalMessage = null) {
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
        contentDiv.textContent = content;

        if (isError) {
            contentDiv.style.background = '#fee2e2';
            contentDiv.style.color = '#dc2626';
            contentDiv.style.borderColor = '#fecaca';
        }

        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'message-timestamp';
        timestampDiv.textContent = new Date().toLocaleTimeString();

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timestampDiv);

        // Add action buttons for failed messages
        if (isError && sender === 'assistant' && originalMessage) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'message-actions';
            actionsDiv.style.marginTop = '8px';
            actionsDiv.style.display = 'flex';
            actionsDiv.style.gap = '8px';

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
            messageDiv.appendChild(actionsDiv);

            // Store failed message for retry
            this.failedMessages.set(messageId, originalMessage);
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
            this.loadingOverlay.classList.remove('hidden');
        } else {
            this.setStatus('ready', 'Ready');
            this.loadingOverlay.classList.add('hidden');
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
    }

    // Window controls
    hideWindow() {
        window.electronAPI.hideWindow();
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

            // Send to voice API
            const response = await fetch(`${this.apiBaseUrl}/voice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    audio_data: base64Audio,
                    format: 'webm',
                    language: 'en-US',
                    sample_rate: 16000,
                    include_audio_response: true,
                    system_prompt: 'You are AI Copilot, a helpful voice assistant. Provide concise, clear responses suitable for audio playback.'
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Add transcription as user message
            if (data.transcription) {
                this.addMessage(data.transcription, 'user');
            }

            // Add LLM response as assistant message
            if (data.llm_response) {
                this.addMessage(data.llm_response, 'assistant');
            }

            // Play audio response if available
            if (data.audio_data) {
                await this.playAudioResponse(data.audio_data, data.audio_format);
            }

            this.setStatus('ready', 'Voice processed');

        } catch (error) {
            console.error('Error processing voice input:', error);
            this.setStatus('error', 'Voice processing failed');

            let errorMessage = 'Sorry, I had trouble processing your voice input.';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Unable to connect to voice service. Please check that the backend server is running.';
            } else if (error.message.includes('No speech detected')) {
                errorMessage = 'No speech detected. Please try speaking more clearly.';
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
    async handleScreenshot() {
        try {
            this.setStatus('processing', 'Checking permissions...');

            // Check screen recording permission first
            const permissionStatus = await window.electronAPI.checkScreenPermission();
            if (!permissionStatus.hasPermission) {
                throw new Error('Screen recording permission required. Please grant permission and try again.');
            }

            this.setStatus('processing', 'Capturing screenshot...');

            // Request screen capture permission and capture screenshot
            const sources = await window.electronAPI.getScreenSources();

            if (!sources || sources.length === 0) {
                throw new Error('No screen sources available');
            }

            // Use the first screen source (primary display)
            const primarySource = sources.find(source => source.name === 'Entire Screen') || sources[0];

            // Capture screenshot using getUserMedia
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

            // Create video element to capture frame
            const video = document.createElement('video');
            video.srcObject = stream;
            video.play();

            // Wait for video to load
            await new Promise((resolve) => {
                video.onloadedmetadata = resolve;
            });

            // Create canvas and capture frame
            const canvas = document.createElement('canvas');

            // Optimize canvas size for better performance
            const maxWidth = 1920;
            const maxHeight = 1080;
            const aspectRatio = video.videoWidth / video.videoHeight;

            let canvasWidth = video.videoWidth;
            let canvasHeight = video.videoHeight;

            // Scale down if image is too large
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

            // Use high-quality image rendering
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);

            // Stop the stream
            stream.getTracks().forEach(track => track.stop());

            // Convert to blob with compression for better performance
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/jpeg', 0.85); // Use JPEG with 85% quality for better compression
            });
            const imageUrl = URL.createObjectURL(blob);

            // Store screenshot data
            this.currentScreenshot = {
                blob: blob,
                url: imageUrl
            };

            // Show screenshot preview
            this.showScreenshotPreview(imageUrl);
            this.setStatus('ready', 'Screenshot captured');

        } catch (error) {
            console.error('Error capturing screenshot:', error);
            this.setStatus('error', 'Screenshot capture failed');

            let errorMessage = 'Failed to capture screenshot.';
            if (error.message.includes('Permission denied')) {
                errorMessage = 'Screen capture permission denied. Please grant permission in your system settings and try again.';
            } else if (error.message.includes('No screen sources')) {
                errorMessage = 'No screen sources available. Please check your system permissions.';
            }

            this.addMessage(errorMessage, 'assistant', true);
        }
    }

    showScreenshotPreview(imageUrl) {
        const preview = document.getElementById('screenshotPreview');
        const image = document.getElementById('screenshotImage');
        const queryInput = document.getElementById('screenshotQuery');

        image.src = imageUrl;
        queryInput.value = '';
        preview.style.display = 'block';

        // Focus on query input
        setTimeout(() => queryInput.focus(), 100);
    }

    closeScreenshotPreview() {
        const preview = document.getElementById('screenshotPreview');
        preview.style.display = 'none';

        // Clean up screenshot data
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

        const queryInput = document.getElementById('screenshotQuery');
        const query = queryInput.value.trim();

        if (!query) {
            this.addMessage('Please enter a question about the screenshot.', 'assistant', true);
            queryInput.focus();
            return;
        }

        try {
            this.setStatus('processing', 'Analyzing screenshot...');

            // Convert blob to base64 using FileReader to avoid stack overflow
            const base64Image = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    // Remove the data URL prefix (data:image/jpeg;base64,)
                    const base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(this.currentScreenshot.blob);
            });

            // Send to screenshot API
            const response = await fetch(`${this.apiBaseUrl}/screenshot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image_data: base64Image,
                    query: query,
                    image_format: 'jpeg', // Use JPEG format for better performance
                    use_structured_ocr: false, // Use basic OCR for faster processing
                    language_hints: ['en'] // Hint for English to speed up OCR
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Add query as user message
            this.addMessage(query, 'user');

            // Add analysis result as assistant message
            if (data.analysis) {
                this.addMessage(data.analysis, 'assistant');
            }

            // Close preview
            this.closeScreenshotPreview();
            this.setStatus('ready', 'Screenshot analyzed');

        } catch (error) {
            console.error('Error analyzing screenshot:', error);
            this.setStatus('error', 'Screenshot analysis failed');

            let errorMessage = 'Sorry, I had trouble analyzing the screenshot.';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Unable to connect to screenshot service. Please check that the backend server is running.';
            } else if (error.message.includes('OCR service not available')) {
                errorMessage = 'Screenshot analysis service is not available. Please check Google Cloud Vision configuration.';
            }

            this.addMessage(errorMessage, 'assistant', true);
        }
    }

    // Utility methods
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
}

// Initialize the renderer when the script loads
new AICopilotRenderer();
