const { ipcRenderer } = require('electron');

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
        this.apiBaseUrl = 'http://127.0.0.1:8000/api/v1';

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
        // Get DOM elements
        this.messageInput = document.getElementById('messageInput');
        this.chatHistory = document.getElementById('chatHistory');
        this.sendBtn = document.getElementById('sendBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.charCount = document.querySelector('.char-count');
        this.loadingOverlay = document.getElementById('loadingOverlay');

        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize UI state
        this.updateUI();

        // Check API status
        this.initializeAPI();

        console.log('AI Copilot Renderer initialized');
    }

    setupEventListeners() {
        // Message input events
        this.messageInput.addEventListener('input', () => this.handleInputChange());
        this.messageInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // Button events
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        document.getElementById('minimizeBtn').addEventListener('click', () => this.hideWindow());
        document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
        
        // Voice and screenshot buttons (disabled for now)
        document.getElementById('voiceBtn').addEventListener('click', () => this.handleVoiceInput());
        document.getElementById('screenshotBtn').addEventListener('click', () => this.handleScreenshot());
        
        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => this.autoResizeTextarea());
        
        // Focus input when window is shown
        window.addEventListener('focus', () => {
            setTimeout(() => this.messageInput.focus(), 100);
        });
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
        // Send message on Enter (without Shift)
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!this.sendBtn.disabled) {
                this.sendMessage();
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
        const message = this.messageInput.value.trim();
        if (!message || this.isProcessing) return;

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

            this.addMessage(errorMessage, 'assistant', true);
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

    addMessage(content, sender, isError = false) {
        // Remove welcome message if it exists
        const welcomeMessage = this.chatHistory.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }

        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${sender}`;
        
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
        
        // Add to chat history
        this.chatHistory.appendChild(messageDiv);
        
        // Scroll to bottom
        this.scrollToBottom();
        
        // Store in history
        this.messageHistory.push({
            content,
            sender,
            timestamp: new Date().toISOString()
        });
    }

    scrollToBottom() {
        setTimeout(() => {
            this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }, 100);
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
        ipcRenderer.invoke('hide-window');
    }

    openSettings() {
        // TODO: Implement settings
        console.log('Settings not yet implemented');
        this.addMessage('Settings panel will be implemented in a future update.', 'assistant');
    }

    // Voice input (placeholder)
    handleVoiceInput() {
        console.log('Voice input not yet implemented');
        this.addMessage('Voice input will be available once the voice interaction milestone is completed.', 'assistant');
    }

    // Screenshot (placeholder)
    handleScreenshot() {
        console.log('Screenshot not yet implemented');
        this.addMessage('Screenshot analysis will be available once the screenshot capture milestone is completed.', 'assistant');
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
                    <li>Use voice input (coming soon)</li>
                    <li>Share screenshots for analysis (coming soon)</li>
                </ul>
                <p class="shortcut-hint">Press <kbd>Ctrl+Shift+C</kbd> to show/hide this window</p>
            </div>
        `;
        this.chatHistory.innerHTML = welcomeHTML;
    }
}

// Initialize the renderer when the script loads
new AICopilotRenderer();
