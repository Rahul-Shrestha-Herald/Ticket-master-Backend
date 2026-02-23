/**
 * Socket.IO Event Handlers for Real-Time Tracking
 */
import trackingService from '../services/trackingService.js';

export const setupTrackingSocket = (io) => {
    // Middleware for socket authentication (optional)
    io.use((socket, next) => {
        // Add authentication logic here if needed
        // For now, allow all connections
        next();
    });

    io.on('connection', (socket) => {
        console.log(`[Socket] Client connected: ${socket.id}`);

        /**
         * OPERATOR EVENTS
         */

        // Operator starts tracking
        socket.on('operator:start-tracking', (busData) => {
            try {
                const { busId, busName, busNumber, route } = busData;

                if (!busId) {
                    socket.emit('error', { message: 'Bus ID is required' });
                    return;
                }

                // Start tracking in service
                const trackingData = trackingService.startTracking(busId, {
                    busName,
                    busNumber,
                    route
                }, socket.id);

                // Store busId on socket for cleanup
                socket.busId = busId;

                // Join operator to their bus room
                socket.join(`bus:${busId}`);

                // Confirm to operator
                socket.emit('tracking:started', {
                    busId,
                    timestamp: new Date()
                });

                // Notify all users tracking this bus
                io.to(`trackin