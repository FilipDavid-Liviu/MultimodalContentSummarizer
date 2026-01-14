/**
 * Web Bluetooth API Integration for Polar Verity Sense
 * Heart Rate Service: 0x180D
 * Heart Rate Measurement Characteristic: 0x2A37
 */

class PolarVeritySense {
    constructor() {
        this.device = null;
        this.server = null;
        this.heartRateService = null;
        this.heartRateCharacteristic = null;
        this.isConnected = false;
        this.bpmCallback = null;
        this.connectionStatusCallback = null;
        
        // Bluetooth UUIDs
        this.HEART_RATE_SERVICE_UUID = 0x180D;
        this.HEART_RATE_MEASUREMENT_CHAR_UUID = 0x2A37;
    }

    /**
     * Check if Web Bluetooth is supported
     */
    isSupported() {
        return navigator.bluetooth && navigator.bluetooth.requestDevice;
    }

    /**
     * Request device connection
     */
    async connect() {
        if (!this.isSupported()) {
            throw new Error('Web Bluetooth API is not supported in this browser.');
        }

        try {
            console.log('Requesting Polar Verity Sense device...');
            
            // Request device with Heart Rate service
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: [this.HEART_RATE_SERVICE_UUID] },
                    { namePrefix: 'Polar' }
                ],
                optionalServices: [this.HEART_RATE_SERVICE_UUID]
            });

            console.log('Device selected:', this.device.name);

            // Listen for disconnection
            this.device.addEventListener('gattserverdisconnected', () => {
                this.onDisconnected();
            });

            // Connect to GATT server
            this.server = await this.device.gatt.connect();
            console.log('Connected to GATT server');

            // Get Heart Rate service
            this.heartRateService = await this.server.getPrimaryService(this.HEART_RATE_SERVICE_UUID);
            console.log('Heart Rate service found');

            // Get Heart Rate Measurement characteristic
            this.heartRateCharacteristic = await this.heartRateService.getCharacteristic(
                this.HEART_RATE_MEASUREMENT_CHAR_UUID
            );
            console.log('Heart Rate Measurement characteristic found');

            // Start notifications
            await this.heartRateCharacteristic.startNotifications();
            console.log('Started heart rate notifications');

            // Listen for notifications
            this.heartRateCharacteristic.addEventListener('characteristicvaluechanged', 
                (event) => this.handleHeartRateNotification(event));

            this.isConnected = true;
            if (this.connectionStatusCallback) {
                this.connectionStatusCallback(true, this.device.name);
            }

            return true;
        } catch (error) {
            console.error('Connection error:', error);
            this.isConnected = false;
            if (this.connectionStatusCallback) {
                this.connectionStatusCallback(false, error.message);
            }
            throw error;
        }
    }

    /**
     * Handle heart rate measurement notifications
     * Heart Rate Measurement format (per Bluetooth spec):
     * - Byte 0: Flags (bit 0 = 16-bit format, bit 1 = sensor contact, etc.)
     * - Bytes 1-2 (if 16-bit): Heart Rate Value (uint16)
     * - Bytes 1 (if 8-bit): Heart Rate Value (uint8)
     */
    handleHeartRateNotification(event) {
        const value = event.target.value;
        const dataView = new DataView(value.buffer);
        
        // Read flags (first byte)
        const flags = dataView.getUint8(0);
        const is16Bit = (flags & 0x01) === 0x01;
        
        let bpm;
        if (is16Bit) {
            // 16-bit heart rate value
            bpm = dataView.getUint16(1, true); // little-endian
        } else {
            // 8-bit heart rate value
            bpm = dataView.getUint8(1);
        }

        // Callback with BPM value and timestamp
        if (this.bpmCallback) {
            this.bpmCallback({
                bpm: bpm,
                timestamp: performance.now(),
                sensorContact: (flags & 0x02) === 0x02
            });
        }
    }

    /**
     * Set callback for BPM updates
     */
    onBPMUpdate(callback) {
        this.bpmCallback = callback;
    }

    /**
     * Set callback for connection status changes
     */
    onConnectionStatusChange(callback) {
        this.connectionStatusCallback = callback;
    }

    /**
     * Disconnect from device
     */
    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            if (this.heartRateCharacteristic) {
                await this.heartRateCharacteristic.stopNotifications();
            }
            this.device.gatt.disconnect();
        }
        this.onDisconnected();
    }

    /**
     * Handle disconnection
     */
    onDisconnected() {
        console.log('Device disconnected');
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.heartRateService = null;
        this.heartRateCharacteristic = null;
        
        if (this.connectionStatusCallback) {
            this.connectionStatusCallback(false, 'Disconnected');
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            deviceName: this.device ? this.device.name : null
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PolarVeritySense;
}
