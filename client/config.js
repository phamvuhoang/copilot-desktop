/**
 * Client Configuration for AI Copilot Desktop
 * Handles environment-specific settings and API endpoints
 */

class ClientConfig {
    constructor() {
        // Default configuration
        this.defaults = {
            apiHost: '127.0.0.1',
            apiPort: 8000,
            apiVersion: 'v1',
            requestTimeout: 30000, // 30 seconds
            retryAttempts: 3,
            retryDelay: 1000 // 1 second
        };

        // Load configuration from environment or use defaults
        this.config = this.loadConfig();
    }

    loadConfig() {
        // Try to load from environment variables (if available in Electron)
        const config = { ...this.defaults };

        // In Electron, we can access environment variables through process.env
        if (typeof process !== 'undefined' && process.env) {
            config.apiHost = process.env.API_HOST || config.apiHost;
            config.apiPort = parseInt(process.env.API_PORT) || config.apiPort;
            config.apiVersion = process.env.API_VERSION || config.apiVersion;
            config.requestTimeout = parseInt(process.env.REQUEST_TIMEOUT) || config.requestTimeout;
        }

        // Try to load from localStorage (user preferences)
        if (typeof localStorage !== 'undefined') {
            const savedConfig = localStorage.getItem('aiCopilotConfig');
            if (savedConfig) {
                try {
                    const parsed = JSON.parse(savedConfig);
                    Object.assign(config, parsed);
                } catch (error) {
                    console.warn('Failed to parse saved configuration:', error);
                }
            }
        }

        return config;
    }

    getApiBaseUrl() {
        return `http://${this.config.apiHost}:${this.config.apiPort}/api/${this.config.apiVersion}`;
    }

    getConfig(key) {
        return this.config[key];
    }

    setConfig(key, value) {
        this.config[key] = value;
        this.saveConfig();
    }

    saveConfig() {
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('aiCopilotConfig', JSON.stringify(this.config));
            } catch (error) {
                console.warn('Failed to save configuration:', error);
            }
        }
    }

    // Validate API endpoint
    async validateApiEndpoint() {
        try {
            const response = await fetch(`${this.getApiBaseUrl()}/chat/status`, {
                method: 'GET',
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}

// Export singleton instance
const clientConfig = new ClientConfig();

// Make it available globally for the renderer
if (typeof window !== 'undefined') {
    window.clientConfig = clientConfig;
}

// Also export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = clientConfig;
}
