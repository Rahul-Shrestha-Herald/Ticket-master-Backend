/**
 * Real-Time Bus Tracking Service
 * Manages bus location tracking with Socket.IO
 */

class TrackingService {
    constructor() {
        this.activeBuses = new Map();
        this.DEFAULT_UPDATE_INTERVAL = 10000; // 10 seconds
        this.LOCATION_TIMEOUT = 300000; // 5 minutes - mark bus as inactive if no updates
    }

    /**
     * Start tracking a bus
     */
    startTracking(busId, busData, socketId) {
        if (!busId) {
            throw new Error('Bus ID is required');
        }

        const trackingData = {
            busId,
            busName: busData.busName,
            busNumber: busData.busNumber,
            route: busData.route,
            socketId,
            lastLocation: null,
            lastUpdated: new Date(),
            isActive: true,
            speed: 0,
            startedAt: new Date()
        };

        this.activeBuses.set(busId, trackingData);
        console.log(`[Tracking] Started tracking bus ${busId} (${busData.busName})`);
        
        return trackingData;
    }

    /**
     * Update bus location
     */
    updateLocation(busId, locationData) {
        if (!this.activeBuses.has(busId)) {
            throw new Error('Bus not found or tracking not started');
        }

        const busInfo = this.activeBuses.get(busId);
        busInfo.lastLocation = {
            latitude: locationData.latitude,
            longitude: locationData.longitude
        };
        busInfo.lastUpdated = new Date();
        busInfo.speed = locationData.speed || 0;
        busInfo.isActive = true;

        this.activeBuses.set(busId, busInfo);
        
        return busInfo;
    }

    /**
     * Stop tracking a bus
     */
    stopTracking(busId) {
        if (!this.activeBuses.has(busId)) {
            return { success: true, message: 'Bus was not being tracked' };
        }

        const busInfo = this.activeBuses.get(busId);
        busInfo.isActive = false;
        busInfo.stoppedAt = new Date();
        
        this.activeBuses.set(busId, busInfo);
        console.log(`[Tracking] Stopped tracking bus ${busId}`);
        
        return { success: true, busInfo };
    }

    /**
     * Get bus tracking status
     */
    getBusStatus(busId) {
        const busInfo = this.activeBuses.get(busId);
        
        if (!busInfo) {
            return {
                busId,
                isActive: false,
                lastLocation: null,
                lastUpdated: null,
                speed: 0
            };
        }

        // Check if location is stale
        const timeSinceUpdate = Date.now() - busInfo.lastUpdated.getTime();
        if (timeSinceUpdate > this.LOCATION_TIMEOUT) {
            busInfo.isActive = false;
        }

        return {
            busId: busInfo.busId,
            busName: busInfo.busName,
            busNumber: busInfo.busNumber,
            isActive: busInfo.isActive,
            lastLocation: busInfo.lastLocation,
            lastUpdated: busInfo.lastUpdated,
            speed: busInfo.speed
        };
    }

    /**
     * Get all active buses
     */
    getActiveBuses() {
        const active = [];
        for (const [busId, busInfo] of this.activeBuses.entries()) {
            if (busInfo.isActive) {
                active.push({
                    busId,
                    busName: busInfo.busName,
                    busNumber: busInfo.busNumber,
                    lastUpdated: busInfo.lastUpdated
                });
            }
        }
        return active;
    }

    /**
     * Handle operator disconnect
     */
    handleDisconnect(socketId) {
        for (const [busId, busInfo] of this.activeBuses.entries()) {
            if (busInfo.socketId === socketId && busInfo.isActive) {
                busInfo.isActive = false;
                busInfo.disconnectedAt = new Date();
                this.activeBuses.set(busId, busInfo);
                console.log(`[Tracking] Bus ${busId} marked inactive due to operator disconnect`);
                return busId;
            }
        }
        return null;
    }

    /**
     * Cleanup old inactive buses (call periodically)
     */
    cleanup() {
        const now = Date.now();
        const CLEANUP_THRESHOLD = 3600000; // 1 hour
        
        for (const [busId, busInfo] of this.activeBuses.entries()) {
            if (!busInfo.isActive) {
                const timeSinceStop = now - (busInfo.stoppedAt || busInfo.lastUpdated).getTime();
                if (timeSinceStop > CLEANUP_THRESHOLD) {
                    this.activeBuses.delete(busId);
                    console.log(`[Tracking] Cleaned up old tracking data for bus ${busId}`);
                }
            }
        }
    }
}

// Singleton instance
const trackingService = new TrackingService();

// Run cleanup every 30 minutes
setInterval(() => {
    trackingService.cleanup();
}, 1800000);

export default trackingService;
