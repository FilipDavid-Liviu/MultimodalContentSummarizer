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

        if (!element) return;

        // Prevent double-clicking
        if (element.classList.contains('calibrating') || element.classList.contains('calibrated')) {
            return;
        }

        // Add calibrating class for visual feedback
        element.classList.add('calibrating');
        
        // Record calibration point multiple times for better accuracy
        const clickCount = 5; // Increased for better accuracy
        let recorded = 0;
        
        const recordCalibration = () => {
            webgazer.recordScreenPosition(event.clientX, event.clientY, 'click');
            recorded++;
            
            if (recorded < clickCount) {
                setTimeout(recordCalibration, 80);
            } else {
                // Mark as calibrated
                element.classList.remove('calibrating');
                element.classList.add('calibrated');
                
                // Store calibration data
                const pointId = element.getAttribute('data-point');
                if (pointId && window.calibrationProgress) {
                    window.calibrationProgress.calibrated.add(pointId);
                }
                
                // Update calibration progress
                if (window.updateCalibrationProgress) {
                    window.updateCalibrationProgress();
                }
                
                console.log(`Calibration point ${pointId || 'unknown'} completed`);
            }
        };
        
        recordCalibration();
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
        document.querySelectorAll('#content-container p').forEach(p => {
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
    calculateAccuracy() {
        // 1. Ask user to look at a specific point (e.g., center of the screen)
        const targetX = window.innerWidth / 2;
        const targetY = window.innerHeight / 2;
        
        // 2. Capture 50 samples while they stare at that point
        let samples = [];
        const collect = (data) => {
            const dist = Math.sqrt(Math.pow(data.x - targetX, 2) + Math.pow(data.y - targetY, 2));
            samples.push(dist);
        };

        // 3. Return Mean Error and Standard Deviation (Precision)
        const meanError = samples.reduce((a, b) => a + b, 0) / samples.length;
        return {
            accuracyPixels: meanError,
            isReliable: meanError < 100 // Threshold for your 120px paragraph gaps
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GazeTracker;
}
