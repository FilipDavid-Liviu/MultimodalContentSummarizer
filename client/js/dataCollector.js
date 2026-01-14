/**
 * Data Collection Module
 * Collects and formats gaze, interaction, and heart rate data
 */

class DataCollector {
    constructor() {
        this.gazeLogs = [];
        this.interactionLogs = [];
        this.heartRateLogs = [];
        this.startTime = null;
        this.isRecording = false;
        this.windowSize = 10000; // 10 seconds in milliseconds
        this.windowCallback = null;
        this.sentWindows = new Set(); // Track which windows have been sent
    }

    /**
     * Start recording
     */
    start() {
        this.startTime = performance.now();
        this.isRecording = true;
        this.gazeLogs = [];
        this.interactionLogs = [];
        this.heartRateLogs = [];
        this.sentWindows = new Set(); // Reset sent windows
        console.log('Data collection started');
    }

    /**
     * Stop recording
     */
    stop() {
        this.isRecording = false;
        console.log('Data collection stopped');
    }

    /**
     * Reset all logs
     */
    reset() {
        this.gazeLogs = [];
        this.interactionLogs = [];
        this.heartRateLogs = [];
        this.startTime = null;
    }

    /**
     * Add gaze data point
     */
    addGazePoint(x, y, aoiID, timestamp = null) {
        if (!this.isRecording) return;

        const t = timestamp || (performance.now() - (this.startTime || 0));
        
        this.gazeLogs.push({
            t: Math.round(t),
            x: Math.round(x),
            y: Math.round(y),
            aoi: aoiID
        });

        this.checkWindowComplete();
    }

    /**
     * Add interaction event
     */
    addInteraction(type, timestamp = null) {
        if (!this.isRecording) return;

        const t = timestamp || (performance.now() - (this.startTime || 0));
        
        this.interactionLogs.push({
            t: Math.round(t),
            type: type // 'click' or 'scroll'
        });
    }

    /**
     * Add heart rate sample
     */
    addHeartRate(bpm, timestamp = null) {
        if (!this.isRecording) return;

        const t = timestamp || (performance.now() - (this.startTime || 0));
        
        this.heartRateLogs.push({
            t: Math.round(t),
            bpm: bpm
        });
    }

    /**
     * Check if a complete window is ready
     */
    checkWindowComplete() {
        if (!this.isRecording || this.gazeLogs.length === 0) return;

        const currentTime = performance.now() - (this.startTime || 0);
        
        // Calculate which window we're in
        const currentWindowIndex = Math.floor(currentTime / this.windowSize);
        
        // Check previous windows (we might have missed some)
        // Start from window 0 and check up to current window - 1
        for (let windowIndex = 0; windowIndex < currentWindowIndex; windowIndex++) {
            const windowStart = windowIndex * this.windowSize;
            const windowEnd = windowStart + this.windowSize;
            
            // Check if we've already sent this window (track sent windows)
            const windowKey = `window_${windowIndex}`;
            if (this.sentWindows && this.sentWindows.has(windowKey)) {
                continue; // Already sent this window
            }
            
            // Check if we have data in this window
            const hasGazeInWindow = this.gazeLogs.some(g => g.t >= windowStart && g.t < windowEnd);
            
            if (hasGazeInWindow && currentTime >= windowEnd) {
                // Mark as sent before actually sending (to avoid duplicates)
                if (!this.sentWindows) {
                    this.sentWindows = new Set();
                }
                this.sentWindows.add(windowKey);
                
                this.sendWindow(windowStart, windowEnd);
                break; // Only send one window per check to avoid flooding
            }
        }
    }

    /**
     * Prepare and send window data
     */
    sendWindow(windowStart, windowEnd) {
        // Filter data within window
        const windowGaze = this.gazeLogs.filter(g => g.t >= windowStart && g.t < windowEnd);
        const windowInteractions = this.interactionLogs.filter(i => i.t >= windowStart && i.t < windowEnd);
        const windowHeartRate = this.heartRateLogs.filter(hr => hr.t >= windowStart && hr.t < windowEnd);

        // Only send if we have meaningful data
        if (windowGaze.length === 0) {
            console.log('Window has no gaze data, skipping');
            return;
        }

        const windowData = {
            window_id: `window_${Math.floor(windowStart / this.windowSize)}`,
            start_time: windowStart,
            end_time: windowEnd,
            gaze_log: windowGaze,
            interactions: windowInteractions,
            heart_rate: windowHeartRate
        };

        console.log(`Sending window ${windowData.window_id}:`, {
            gaze_points: windowGaze.length,
            interactions: windowInteractions.length,
            heart_rate_samples: windowHeartRate.length
        });

        // Callback with window data
        if (this.windowCallback) {
            this.windowCallback(windowData);
        } else {
            console.warn('No window callback set!');
        }

        // Remove sent data from buffers (keep last window for overlap)
        const cutoffTime = windowStart - this.windowSize;
        this.gazeLogs = this.gazeLogs.filter(g => g.t >= cutoffTime);
        this.interactionLogs = this.interactionLogs.filter(i => i.t >= cutoffTime);
        this.heartRateLogs = this.heartRateLogs.filter(hr => hr.t >= cutoffTime);
    }

    /**
     * Set callback for window completion
     */
    onWindowComplete(callback) {
        this.windowCallback = callback;
    }

    /**
     * Get current statistics
     */
    getStats() {
        return {
            gazePoints: this.gazeLogs.length,
            interactions: this.interactionLogs.length,
            heartRateSamples: this.heartRateLogs.length,
            recordingTime: this.isRecording ? (performance.now() - (this.startTime || 0)) : 0
        };
    }

    /**
     * Get all gaze logs (for testing/debugging)
     */
    getGazeLogs() {
        return this.gazeLogs;
    }

    /**
     * Get all interaction logs (for testing/debugging)
     */
    getInteractionLogs() {
        return this.interactionLogs;
    }

    /**
     * Get all heart rate logs (for testing/debugging)
     */
    getHeartRateLogs() {
        return this.heartRateLogs;
    }

    /**
     * Get start time (for testing/debugging)
     */
    getStartTime() {
        return this.startTime;
    }

    /**
     * Export all data as CSV (for debugging)
     */
    exportCSV() {
        let csv = "Timestamp,GazeX,GazeY,AOI_ID,Click,Scroll,BPM\n";
        
        // Create a map of all timestamps with their data
        const dataMap = new Map();
        
        // Add gaze points
        this.gazeLogs.forEach(g => {
            const key = g.t;
            if (!dataMap.has(key)) {
                dataMap.set(key, {
                    t: g.t,
                    x: g.x,
                    y: g.y,
                    aoi: g.aoi,
                    click: 0,
                    scroll: 0,
                    bpm: null
                });
            } else {
                const existing = dataMap.get(key);
                existing.x = g.x;
                existing.y = g.y;
                existing.aoi = g.aoi;
            }
        });

        // Add interactions (merge with existing timestamps or create new)
        this.interactionLogs.forEach(i => {
            const key = i.t;
            if (!dataMap.has(key)) {
                dataMap.set(key, {
                    t: i.t,
                    x: '',
                    y: '',
                    aoi: '',
                    click: i.type === 'click' ? 1 : 0,
                    scroll: i.type === 'scroll' ? 1 : 0,
                    bpm: null
                });
            } else {
                const existing = dataMap.get(key);
                if (i.type === 'click') existing.click = 1;
                if (i.type === 'scroll') existing.scroll = 1;
            }
        });

        // Add heart rate (merge with nearest timestamp within 500ms)
        this.heartRateLogs.forEach(hr => {
            let closestKey = null;
            let minDist = Infinity;
            
            dataMap.forEach((value, key) => {
                const dist = Math.abs(key - hr.t);
                if (dist < minDist && dist < 500) {
                    minDist = dist;
                    closestKey = key;
                }
            });
            
            if (closestKey !== null) {
                dataMap.get(closestKey).bpm = hr.bpm;
            } else {
                // Create new entry for heart rate if no close match
                dataMap.set(hr.t, {
                    t: hr.t,
                    x: '',
                    y: '',
                    aoi: '',
                    click: 0,
                    scroll: 0,
                    bpm: hr.bpm
                });
            }
        });

        // Convert to array and sort by timestamp
        const allData = Array.from(dataMap.values()).sort((a, b) => a.t - b.t);

        // Generate CSV
        allData.forEach(row => {
            csv += `${row.t},${row.x || ''},${row.y || ''},${row.aoi || ''},${row.click},${row.scroll},${row.bpm || ''}\n`;
        });

        return csv;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataCollector;
}
