/**
 * Main Application Controller
 * Coordinates all modules: Gaze Tracking, Bluetooth, Data Collection, API
 */

// Configuration
const CONFIG = {
    USE_MOUSE_DEBUG: false,
    Y_OFFSET_CORRECTION: 0,
    SMOOTHING_FACTOR: 0.1,
    SERVER_URL: 'http://localhost:8000',
    WINDOW_SIZE: 10000 // 10 seconds
};

// Initialize modules
const gazeTracker = new GazeTracker({
    useMouseDebug: CONFIG.USE_MOUSE_DEBUG,
    yOffsetCorrection: CONFIG.Y_OFFSET_CORRECTION,
    smoothingFactor: CONFIG.SMOOTHING_FACTOR
});
const contentManager = new ContentManager('content-container');
const polarDevice = new PolarVeritySense();
const dataCollector = new DataCollector();
const apiClient = new APIClient(CONFIG.SERVER_URL);

// State
let isRecording = false;
let currentPrediction = null;
let windowCheckInterval = null;
window.calibrationProgress = {
    calibrated: new Set(),
    total: 9
};

/**
 * Initialize application
 */
async function initialize() {
    console.log('Initializing CAPLAN application...');

    // Setup UI
    setupUI();

    // Initialize gaze tracker
    try {
        await gazeTracker.initialize();
        console.log('Gaze tracker initialized');
    } catch (error) {
        console.error('Failed to initialize gaze tracker:', error);
        showError('Failed to initialize gaze tracking');
    }

    // Setup callbacks
    setupCallbacks();

    // Check server connection
    checkServerConnection();

    console.log('Application initialized');
}

/**
 * Update calibration progress
 */
window.updateCalibrationProgress = function() {
    const calibrated = document.querySelectorAll('.cal-point.calibrated').length;
    const progressText = document.getElementById('cal-progress-text');
    const progressFill = document.getElementById('cal-progress-fill');
    const finishBtn = document.getElementById('cal-finish-btn');
    
    if (progressText) {
        progressText.textContent = `${calibrated}/${window.calibrationProgress.total} points calibrated`;
    }
    
    if (progressFill) {
        const percentage = (calibrated / window.calibrationProgress.total) * 100;
        progressFill.style.width = `${percentage}%`;
        
        // Change color based on progress
        if (percentage === 100) {
            progressFill.style.background = '#4caf50';
        } else if (percentage >= 50) {
            progressFill.style.background = '#ff9800';
        } else {
            progressFill.style.background = '#f44336';
        }
    }
    
    // Show finish button when at least 5 points are calibrated
    if (finishBtn) {
        if (calibrated >= 5) {
            finishBtn.style.display = 'block';
            if (calibrated === window.calibrationProgress.total) {
                finishBtn.textContent = '✓ Perfect! All Points Calibrated - Start Reading';
                finishBtn.style.background = '#4caf50';
                finishBtn.style.color = 'white';
            } else if (calibrated >= 7) {
                finishBtn.textContent = `Good! (${calibrated}/9) - Start Reading`;
                finishBtn.style.background = '#ff9800';
            } else {
                finishBtn.textContent = `Minimum Calibrated (${calibrated}/9) - Start Reading`;
                finishBtn.style.background = '#ff9800';
            }
        } else {
            finishBtn.style.display = 'none';
        }
    }
};

/**
 * Setup UI event handlers
 */
function setupUI() {
    // Wait for DOM to be ready
    setTimeout(() => {
        const fileInput = document.getElementById('text-file-input');
        
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                console.log("File detected:", file.name);

                try {
                    // Call the method on the existing instance
                    const contentMap = await contentManager.processFile(file);
                    
                    // Sync with backend
                    const result = await apiClient.registerContent(contentMap);
                    console.log('Server synced successfully:', result);
                    
                } catch (err) {
                    console.error('Processing failed:', err);
                }
            });
        }
        // Calibration points - 9-point grid
        document.querySelectorAll('.cal-point').forEach((point, index) => {
            point.addEventListener('click', (e) => {
                e.stopPropagation();
                gazeTracker.calibrate(e, point);
            });
        });

        // Start experiment button
        const startBtn = document.getElementById('cal-finish-btn');
        if (startBtn) {
            startBtn.addEventListener('click', startExperiment);
        }

        // Download CSV button
        const downloadBtn = document.querySelector('button[onclick="downloadCSV()"]');
        if (downloadBtn) {
            downloadBtn.onclick = downloadCSV;
        }

        // Connect Bluetooth button
        const connectBtn = document.getElementById('connect-bluetooth');
        if (connectBtn) {
            connectBtn.addEventListener('click', connectBluetooth);
        }

        // Show debug indicator if in mouse mode
        if (CONFIG.USE_MOUSE_DEBUG) {
            const debugIndicator = document.getElementById('debug-indicator');
            if (debugIndicator) {
                debugIndicator.style.display = 'block';
            }
        }
    }, 100);
}

/**
 * Setup module callbacks
 */
function setupCallbacks() {
    // Gaze tracker callback
    gazeTracker.onGazeUpdate((gazeData) => {
        dataCollector.addGazePoint(
            gazeData.x,
            gazeData.y,
            gazeData.aoiID,
            gazeData.timestamp
        );
        updateStatus();
    });

    // Bluetooth callback
    polarDevice.onBPMUpdate((hrData) => {
        dataCollector.addHeartRate(hrData.bpm, hrData.timestamp);
        updateHeartRateDisplay(hrData.bpm);
    });

    polarDevice.onConnectionStatusChange((connected, message) => {
        updateBluetoothStatus(connected, message);
    });

    // Data collector window callback
    dataCollector.onWindowComplete(async (windowData) => {
        console.log('Window complete, sending to server:', {
            window_id: windowData.window_id,
            gaze_points: windowData.gaze_log.length,
            interactions: windowData.interactions.length,
            heart_rate_samples: windowData.heart_rate.length
        });
        await sendWindowToServer(windowData);
    });

    // Interaction events
    window.addEventListener('click', () => {
        dataCollector.addInteraction('click');
    });

    window.addEventListener('scroll', () => {
        dataCollector.addInteraction('scroll');
    });

    // Mouse move (debug mode)
    if (CONFIG.USE_MOUSE_DEBUG) {
        window.addEventListener('mousemove', (e) => {
            gazeTracker.handleMouseMove(e);
        });
    }
}

/**
 * Start experiment
 */
async function startExperiment() {
    // 1. Prepare Validation UI
    const instructions = document.querySelector('.cal-instructions');
    instructions.innerHTML = `
        <h2 style="color: #2196F3;">Accuracy Validation</h2>
        <p>Keep your head still and <strong>stare at the blue dot</strong> in the center for 5 seconds.</p>
        <div id="val-timer" style="font-size: 24px; font-weight: bold; margin: 10px;">5</div>
    `;
    
    // Hide all calibration red dots
    document.querySelectorAll('.cal-point').forEach(p => p.style.display = 'none');
    document.getElementById('cal-finish-btn').style.display = 'none';

    // Create a central Validation Target (Blue Dot)
    const valTarget = document.createElement('div');
    valTarget.style.cssText = "width: 30px; height: 30px; background: #2196F3; border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10005; border: 4px solid white; box-shadow: 0 0 15px rgba(33, 150, 243, 0.8);";
    document.getElementById('calibration-overlay').appendChild(valTarget);

    // 2. Data Collection for Accuracy
    const samples = [];
    const targetX = window.innerWidth / 2;
    const targetY = window.innerHeight / 2;

    const valCallback = (data) => {
        const dist = Math.sqrt(Math.pow(data.x - targetX, 2) + Math.pow(data.y - targetY, 2));
        samples.push(dist);
    };

    // Temporarily listen for accuracy data
    gazeTracker.onGazeUpdate(valCallback);
    gazeTracker.start();

    // 3. Countdown Timer (5 seconds)
    let timeLeft = 5;
    const timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('val-timer').textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            finishValidation(samples, valTarget);
        }
    }, 1000);
}

/**
 * Process Validation Results and Start Reading
 */
function finishValidation(samples, targetElement) {
    // Stop recording temporary validation data
    gazeTracker.stop();
    targetElement.remove();

    // Calculate Numbers
    const meanError = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    const paragraphGap = 120; // Your CSS margin-bottom
    const isReliable = meanError < paragraphGap;

    console.log(`Validation Results: Mean Error = ${meanError}px`);

    // Show Results to User
    const instructions = document.querySelector('.cal-instructions');
    instructions.innerHTML = `
        <h2 style="${isReliable ? 'color: #4caf50' : 'color: #f44336'}">Validation Complete</h2>
        <p>Spatial Error: <strong>${meanError}px</strong></p>
        <p>${isReliable ? '✓ Reliable for paragraph detection.' : '⚠ Low accuracy. Try to keep head still.'}</p>
        <button id="final-start-btn" style="background: #4caf50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">Start Reading Now</button>
    `;

    document.getElementById('final-start-btn').onclick = () => {
        // Final transition to content
        document.getElementById('calibration-overlay').style.display = 'none';
        document.getElementById('content-container').style.display = 'block';
        
        // Final Setup of the actual Gaze Callback for the experiment
        gazeTracker.onGazeUpdate((gazeData) => {
            dataCollector.addGazePoint(gazeData.x, gazeData.y, gazeData.aoiID, gazeData.timestamp);
            updateStatus();
        });

        // Start real recording
        isRecording = true;
        gazeTracker.start();
        dataCollector.start();
        
        // Window check interval
        if (windowCheckInterval) clearInterval(windowCheckInterval);
        windowCheckInterval = setInterval(() => { if (isRecording) dataCollector.checkWindowComplete(); }, 1000);
    };
}

/**
 * Connect to Polar Verity Sense
 */
async function connectBluetooth() {
    try {
        const btn = document.getElementById('connect-bluetooth');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Connecting...';
        }

        await polarDevice.connect();
        console.log('Connected to Polar Verity Sense');

        if (btn) {
            btn.textContent = 'Disconnect';
            btn.disabled = false;
            btn.onclick = disconnectBluetooth;
        }
    } catch (error) {
        console.error('Bluetooth connection failed:', error);
        showError(`Bluetooth connection failed: ${error.message}`);
        
        const btn = document.getElementById('connect-bluetooth');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Connect Polar Verity Sense';
        }
    }
}

/**
 * Disconnect from Polar Verity Sense
 */
async function disconnectBluetooth() {
    try {
        await polarDevice.disconnect();
        console.log('Disconnected from Polar Verity Sense');

        const btn = document.getElementById('connect-bluetooth');
        if (btn) {
            btn.textContent = 'Connect Polar Verity Sense';
            btn.onclick = connectBluetooth;
        }
    } catch (error) {
        console.error('Disconnect error:', error);
    }
}

/**
 * Send window data to server
 */
async function sendWindowToServer(windowData) {
    try {
        console.log('Sending window to server:', {
            window_id: windowData.window_id,
            gaze_count: windowData.gaze_log.length,
            interactions: windowData.interactions.length,
            heart_rate: windowData.heart_rate.length
        });
        
        const result = await apiClient.analyzeWindow(windowData);
        currentPrediction = result;
        
        console.log('Server response received:', result);
        
        if (result.status === 'success') {
            updatePredictionDisplay(result);
        } else {
            console.error('Server returned error:', result.error);
            showError(`Server error: ${result.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error sending window to server:', error);
        showError(`Failed to analyze window data: ${error.message}`);
        
        // Update display to show error
        const serverResponseEl = document.getElementById('server-response');
        if (serverResponseEl) {
            serverResponseEl.innerHTML = `
                <div style="border: 2px solid #f44336; padding: 10px; margin-top: 10px; border-radius: 5px; background: #ffebee;">
                    <strong>Error:</strong> ${error.message}
                </div>
            `;
        }
    }
}

/**
 * Update status display
 */
function updateStatus() {
    const stats = dataCollector.getStats();
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = `Points: ${stats.gazePoints} | HR: ${stats.heartRateSamples} | Time: ${Math.round(stats.recordingTime / 1000)}s`;
    }
}

/**
 * Update heart rate display
 */
function updateHeartRateDisplay(bpm) {
    const hrEl = document.getElementById('heart-rate');
    if (hrEl) {
        hrEl.textContent = `Heart Rate: ${bpm} BPM`;
    }
}

/**
 * Update Bluetooth status display
 */
function updateBluetoothStatus(connected, message) {
    const btEl = document.getElementById('bluetooth-status');
    if (btEl) {
        if (connected) {
            btEl.textContent = `Bluetooth: Connected (${message})`;
            btEl.style.color = 'green';
        } else {
            btEl.textContent = `Bluetooth: ${message}`;
            btEl.style.color = 'red';
        }
    }
}

/**
 * Update prediction display
 */
function updatePredictionDisplay(result) {
    // Update simple prediction display
    const predEl = document.getElementById('prediction');
    if (predEl) {
        if (result.state) {
            predEl.textContent = `State: ${result.state}`;
            predEl.style.color = result.intervention_needed ? 'red' : 'green';
        }
    }

    // Update detailed server response box
    const serverResponseEl = document.getElementById('server-response');
    if (serverResponseEl) {
        if (result.status === 'success') {
            const timestamp = new Date().toLocaleTimeString();
            serverResponseEl.innerHTML = `
                <div style="border: 2px solid ${result.intervention_needed ? '#f44336' : '#4caf50'}; padding: 10px; margin-top: 10px; border-radius: 5px; background: ${result.intervention_needed ? '#ffebee' : '#e8f5e9'}">
                    <strong>Latest Detection (${timestamp}):</strong><br>
                    <strong>State:</strong> ${result.state} (ID: ${result.state_id})<br>
                    <strong>Intervention Needed:</strong> ${result.intervention_needed ? 'YES' : 'NO'}<br>
                    <strong>Window ID:</strong> ${result.window_id || 'N/A'}<br>
                    <details style="margin-top: 5px;">
                        <summary>Features</summary>
                        <pre style="font-size: 10px; margin-top: 5px;">${JSON.stringify(result.features || {}, null, 2)}</pre>
                    </details>
                </div>
            `;
        } else {
            serverResponseEl.innerHTML = `
                <div style="border: 2px solid #ff9800; padding: 10px; margin-top: 10px; border-radius: 5px; background: #fff3e0;">
                    <strong>Error:</strong> ${result.error || 'Unknown error'}
                </div>
            `;
        }
    }

    // Show intervention alert if needed
    if (result.intervention_needed) {
        showInterventionAlert(result.state);
    }
}

/**
 * Show intervention alert
 */
function showInterventionAlert(state) {
    // You can implement a visual alert here
    console.log(`INTERVENTION NEEDED: ${state}`);
    // Example: highlight current paragraph, show notification, etc.
}

/**
 * Show error message
 */
function showError(message) {
    console.error(message);
    // You can implement error display UI here
    alert(message);
}

/**
 * Check server connection
 */
async function checkServerConnection() {
    const isHealthy = await apiClient.checkHealth();
    const serverEl = document.getElementById('server-status');
    if (serverEl) {
        if (isHealthy) {
            serverEl.textContent = 'Server: Connected';
            serverEl.style.color = 'green';
        } else {
            serverEl.textContent = 'Server: Disconnected';
            serverEl.style.color = 'red';
        }
    }
}

/**
 * Download CSV
 */
function downloadCSV() {
    try {
        const csv = dataCollector.exportCSV();
        
        if (!csv || csv.length < 50) {
            alert('No data to export. Make sure you are recording data.');
            return;
        }
        
        // Create blob instead of data URI to avoid size limits
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `caplan_data_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        
        console.log('CSV exported successfully');
    } catch (error) {
        console.error('Error exporting CSV:', error);
        alert('Error exporting CSV: ' + error.message);
    }
}

// Make functions globally accessible for inline handlers
window.startExperiment = startExperiment;
window.downloadCSV = downloadCSV;
window.connectBluetooth = connectBluetooth;
window.disconnectBluetooth = disconnectBluetooth;

/**
 * Test function to manually send a window (for debugging)
 */
window.testWindowSend = async function() {
    if (!isRecording) {
        alert('Please start recording first!');
        return;
    }
    
    const stats = dataCollector.getStats();
    if (stats.gazePoints === 0) {
        alert('No gaze data collected yet!');
        return;
    }
    
    // Force check for complete windows
    dataCollector.checkWindowComplete();
    
    // Also create a test window with last 10 seconds of data
    const currentTime = performance.now() - (dataCollector.startTime || 0);
    const windowStart = Math.max(0, currentTime - 10000);
    const windowEnd = currentTime;
    
    // Get data using the collector's getter methods
    const allGaze = dataCollector.getGazeLogs();
    const allInteractions = dataCollector.getInteractionLogs();
    const allHeartRate = dataCollector.getHeartRateLogs();
    const startTime = dataCollector.getStartTime();
    
    const testWindow = {
        window_id: 'test_window_manual',
        start_time: Math.round(windowStart),
        end_time: Math.round(windowEnd),
        gaze_log: allGaze.filter(g => g.t >= windowStart && g.t < windowEnd),
        interactions: allInteractions.filter(i => i.t >= windowStart && i.t < windowEnd),
        heart_rate: allHeartRate.filter(hr => hr.t >= windowStart && hr.t < windowEnd)
    };
    
    console.log('Test window data:', {
        window_id: testWindow.window_id,
        gaze_points: testWindow.gaze_log.length,
        interactions: testWindow.interactions.length,
        heart_rate_samples: testWindow.heart_rate.length,
        time_range: `${windowStart}ms - ${windowEnd}ms`
    });
    
    await sendWindowToServer(testWindow);
};

// Initialize on load
window.addEventListener('load', initialize);
