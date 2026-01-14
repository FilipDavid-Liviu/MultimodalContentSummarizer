/**
 * Gaze Tracking Module
 * Handles WebGazer.js integration and gaze data processing
 */

class GazeTracker {
    constructor(config = {}) {
        this.config = {
            useMouseDebug: config.useMouseDebug || false,
            yOffsetCorrection: config.yOffsetCorrection || 0,
            smoothingFactor: config.smoothingFactor || 0.1,
            ...config
        };

        this.prevX = 0;
        this.prevY = 0;
        this.isInitialized = false;
        this.isRecording = false;
        this.gazeCallback = null;
    }

    /**
     * Initialize WebGazer
     */
    async initialize() {
        if (this.config.useMouseDebug) {
            console.log('Using mouse debug mode');
            this.isInitialized = true;
            return;
        }

        try {
            await webgazer
                .setRegression('ridge')
                .setGazeListener((data, clock) => this.handleGaze(data, clock))
                .saveDataAcrossSessions(true)
                .begin();

            // Configure WebGazer display
            webgazer.showVideo(true);
            webgazer.showFaceOverlay(false);
            webgazer.showFaceFeedbackBox(false);
            webgazer.showPredictionPoints(true);

            this.isInitialized = true;
            console.log('WebGazer initialized');
        } catch (error) {
            console.error('Error initializing WebGazer:', error);
            throw error;
        }
    }

    /**
     * Handle gaze data from WebGazer
     */
    handleGaze(data, clock) {
        if (!data || !this.isRecording) return;

        // Smoothing
        if (this.prevX === 0) {
            this.prevX = data.x;
            this.prevY = data.y;
        }

        const smoothX = (data.x * this.config.smoothingFactor) + 
                       (this.prevX * (1 - this.config.smoothingFactor));
        const smoothY = (data.y * this.config.smoothingFactor) + 
                       (this.prevY * (1 - this.config.smoothingFactor));
        
        this.prevX = smoothX;
        this.prevY = smoothY;

        // Offset correction
        let finalY = smoothY;
        if (!this.config.useMouseDebug) {
            finalY = smoothY - this.config.yOffsetCorrection;
        }

        // Hit test for AOI
        let aoiID = "NONE";
        const element = document.elementFromPoint(smoothX, finalY);
        
        if (element && element.tagName === 'P') {
            aoiID = element.id || "NONE";
            this.highlightAOI(element);
        } else {
            this.clearHighlights();
        }

        // Callback with processed gaze data
        if (this.gazeCallback) {
            this.gazeCallback({
                x: Math.round(smoothX),
                y: Math.round(finalY),
                aoiID: aoiID,
                timestamp: Math.round(clock)
            });
        }
    }

    /**
     * Handle mouse movement (debug mode)
     */
    handleMouseMove(event) {
        if (!this.config.useMouseDebug || !this.isRecording) return;
        
        this.handleGaze(
            { x: event.clientX, y: event.clientY },
            performance.now()
        );
    }

    /**
     * Start recording
     */
    start() {
        this.isRecording = true;
        if (!this.config.useMouseDebug && webgazer) {
            webgazer.resume();
            webgazer.removeMouseEventListeners();
        }
    }

    /**
     * Stop recording
     */
    stop() {
        this.isRecording = false;
    }

    /**
     * Calibrate at a specific point
     */
    calibrate(event, element) {
        if (this.config.useMouseDebug) return;

        webgazer.recordScreenPosition(event.clientX, event.clientY, 'click');
        
        // Visual feedback
        if (element) {
            element.style.backgroundColor = '#00ff00';
            element.style.transform = "scale(0.8)";
        }

        // Record multiple times for better calibration
        webgazer.recordScreenPosition(event.clientX, event.clientY, 'click');
    }

    /**
     * Set callback for gaze updates
     */
    onGazeUpdate(callback) {
        this.gazeCallback = callback;
    }

    /**
     * Highlight AOI element
     */
    highlightAOI(element) {
        this.clearHighlights();
        if (element && element.classList) {
            element.classList.add('active-aoi');
        }
    }

    /**
     * Clear all AOI highlights
     */
    clearHighlights() {
        document.querySelectorAll('p').forEach(p => {
            p.classList.remove('active-aoi');
        });
    }

    /**
     * Get initialization status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isRecording: this.isRecording,
            useMouseDebug: this.config.useMouseDebug
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GazeTracker;
}
