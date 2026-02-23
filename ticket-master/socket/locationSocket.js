import BusLocation from '../models/busLocationModel.js';

export const setupLocationSocket = (io) => {
    const locationNamespace = io.of('/location');

    locationNamespace.on('connection', (socket) => {
        console.log(`Client connected to location tracking: ${socket.id}`);

        // Operator starts sharing location
        socket.on('operator:start-tracking', async (data) => {
            const { busId, busName, route } = data;
            
            if (!busId) {
                socket.emit('error', { message: 'Bus ID required' });
                return;
            }

            // Join room for this bus
            socket.join(`bus-${busId}`);
            console.log(`Operator started tracking for bus ${busId} (${busName})`);
            
            socket.emit('tracking:started', { busId, busName, route });
        });

        // Operator updates location
        socket.on('operator:update-location', async (data) => {
            const { busId, latitude, longitude, speed, heading, accuracy, timestamp, isFallback } = data;

            if (!busId || latitude === undefined || longitude === undefined) {
                socket.emit('error', { message: 'Invalid location data' });
                return;
            }

            try {
                // Update location in database
                const location = await BusLocation.findOneAndUpdate(
                    { busId },
                    {
                        location: {
                            type: 'Point',
                            coordinates: [longitude, latitude]
                        },
                        speed: speed || 0,
                        heading: heading || 0,
                        accuracy: accuracy || 0,
                        isActive: true,
                        lastUpdated: new Date(timestamp || Date.now())
                    },
                    { upsert: true, new: true }
                );

                // Broadcast to all clients tracking this bus
                locationNamespace.to(`bus-${busId}`).emit('location:updated', {
                    busId,
                    latitude,
                    longitude,
                    speed: location.speed,
                    heading: location.heading,
                    accuracy: location.accuracy,
                    lastUpdated: location.lastUpdated,
                    isFallback: isFallback || false
                });

                console.log(`Location updated for bus ${busId}: [${latitude}, ${longitude}]${isFallback ? ' (fallback)' : ''}`);

            } catch (error) {
                console.error('Error updating location via socket:', error);
                socket.emit('error', { message: 'Failed to update location' });
            }
        });

        // Passenger/User subscribes to bus updates
        socket.on('user:subscribe', async (data) => {
            const { busId } = data;
            
            if (!busId) {
                socket.emit('error', { message: 'Bus ID required' });
                return;
            }

            // Join room to receive updates for this bus
            socket.join(`bus-${busId}`);
            console.log(`User ${socket.id} subscribed to bus ${busId}`);
            
            // Send current location if available
            try {
                const location = await BusLocation.findOne({ busId, isActive: true });
                if (location) {
                    socket.emit('location:updated', {
                        busId,
                        latitude: location.location.coordinates[1],
                        longitude: location.location.coordinates[0],
                        speed: location.speed,
                        heading: location.heading,
                        accuracy: location.accuracy,
                        lastUpdated: location.lastUpdated
                    });
                }
            } catch (error) {
                console.error('Error fetching current location:', error);
            }
            
            socket.emit('tracking:started', { busId });
        });

        // User unsubscribes from bus updates
        socket.on('user:unsubscribe', (data) => {
            const { busId } = data;
            
            if (busId) {
                socket.leave(`bus-${busId}`);
                console.log(`User ${socket.id} unsubscribed from bus ${busId}`);
            }
        });

        // User requests location refresh
        socket.on('user:refresh-location', async (data) => {
            const { busId } = data;
            
            if (!busId) {
                return;
            }

            try {
                const location = await BusLocation.findOne({ busId, isActive: true });
                if (location) {
                    socket.emit('location:updated', {
                        busId,
                        latitude: location.location.coordinates[1],
                        longitude: location.location.coordinates[0],
                        speed: location.speed,
                        heading: location.heading,
                        accuracy: location.accuracy,
                        lastUpdated: location.lastUpdated
                    });
                }
            } catch (error) {
                console.error('Error refreshing location:', error);
            }
        });

        // User requests tracking status
        socket.on('user:request-status', async (data) => {
            const { busId } = data;
            
            if (!busId) {
                return;
            }

            try {
                const location = await BusLocation.findOne({ busId });
                socket.emit('tracking:status', {
                    busId,
                    isActive: location?.isActive || false,
                    lastUpdated: location?.lastUpdated
                });
            } catch (error) {
                console.error('Error checking tracking status:', error);
            }
        });

        // Operator stops sharing location
        socket.on('operator:stop-tracking', async (data) => {
            const { busId } = data;
            
            if (!busId) {
                socket.emit('error', { message: 'Bus ID required' });
                return;
            }

            try {
                await BusLocation.findOneAndUpdate(
                    { busId },
                    { isActive: false }
                );

                // Notify all trackers that sharing has stopped
                locationNamespace.to(`bus-${busId}`).emit('tracking:stopped', { busId });
                
                socket.leave(`bus-${busId}`);
                console.log(`Location sharing stopped for bus ${busId}`);
                
                socket.emit('tracking:stopped', { busId });

            } catch (error) {
                console.error('Error stopping location sharing:', error);
                socket.emit('error', { message: 'Failed to stop sharing' });
            }
        });

        socket.on('disconnect', () => {
            console.log(`Client disconnected from location tracking: ${socket.id}`);
        });
    });

    return locationNamespace;
};

export default setupLocationSocket;
