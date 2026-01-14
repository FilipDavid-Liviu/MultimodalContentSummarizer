/**
 * API Client Module
 * Handles communication with the FastAPI server
 */

class APIClient {
    constructor(serverUrl = 'http://localhost:8000') {
        this.serverUrl = serverUrl;
    }

    /**
     * Send window data to server for analysis
     */
    async analyzeWindow(windowData) {
        try {
            const response = await fetch(`${this.serverUrl}/analyze-window`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(windowData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error analyzing window:', error);
            throw error;
        }
    }

    /**
     * Get model information
     */
    async getModelInfo() {
        try {
            const response = await fetch(`${this.serverUrl}/debug/model-info`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error getting model info:', error);
            throw error;
        }
    }

    /**
     * Test prediction with features (debug endpoint)
     */
    async predictEmotion(features) {
        try {
            const response = await fetch(`${this.serverUrl}/debug/predict-emotion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(features)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error predicting emotion:', error);
            throw error;
        }
    }

    /**
     * Check server health
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this.serverUrl}/debug/model-info`);
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APIClient;
}
