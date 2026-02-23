import BusLocation from '../models/busLocationModel.js';
import Bus from '../models/operator/busModel.js';

// Update bus location (Operator only)
export const updateBusLocation = async (req, res) => {
    try {
        const { busId, latitude, longitude, speed, heading, accuracy } = req.body;
        const operatorId = req.userId; // From operator auth middleware

        // Validate coordinates
        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        // Validate coordinate ranges
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinates'
            });
        }

        // Verify bus belongs to operator
        const bus = await Bus.findOne({ _id: busId, createdBy: operatorId });
        if (!bus) {
            return res.status(403).json({
                success: false,
                message: 'Bus not found or unauthorized'
            });
        }

        // Update or create location
        const location = await BusLocation.findOneAndUpdate(
            { busId },
            {
                busId,
                operatorId,
                location: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                speed: speed || 0,
                heading: heading || 0,
                accuracy: accuracy || 0,
                isActive: true,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        res.status(200).json({
            success: true,
            message: 'Location updated successfully',
            data: {
                busId: location.busId,
                latitude,
                longitude,
                speed: location.speed,
                heading: location.heading,
                lastUpdated: location.lastUpdated
            }
        });

    } catch (error) {
        console.error('Error updating bus location:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update location',
            error: error.message
        });
    }
};

// Get bus location (Public - for passengers)
export const getBusLocation = async (req, res) => {
    try {
        const { busId } = req.params;

        const location = await BusLocation.getActiveBusLocation(busId);

        if (!location) {
            return res.status(404).json({
                success: false,
                message: 'Bus location not available'
            });
        }

        // Get bus details
        const bus = await Bus.findById(busId).select('busName busNumber');

        res.status(200).json({
            success: true,
            data: {
                busId: location.busId,
                busName: bus?.busName,
                busNumber: bus?.busNumber,
                latitude: location.location.coordinates[1],
                longitude: location.location.coordinates[0],
                speed: location.speed,
                heading: location.heading,
                accuracy: location.accuracy,
                lastUpdated: location.lastUpdated
            }
        });

    } catch (error) {
        console.error('Error fetching bus location:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch location',
            error: error.message
        });
    }
};

// Stop sharing location (Operator only)
export const stopSharingLocation = async (req, res) => {
    try {
        const { busId } = req.params;
        const operatorId = req.userId;

        // Verify bus belongs to operator
        const bus = await Bus.findOne({ _id: busId, createdBy: operatorId });
        if (!bus) {
            return res.status(403).json({
                success: false,
                message: 'Bus not found or unauthorized'
            });
        }

        await BusLocation.findOneAndUpdate(
            { busId },
            { isActive: false },
            { new: true }
        );

        res.status(200).json({
            success: true,
            message: 'Location sharing stopped'
        });

    } catch (error) {
        console.error('Error stopping location sharing:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop location sharing',
            error: error.message
        });
    }
};

// Get all active buses with locations (for map view)
export const getAllActiveBuses = async (req, res) => {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        const activeBuses = await BusLocation.find({
            isActive: true,
            lastUpdated: { $gte: fiveMinutesAgo }
        }).populate('busId', 'busName busNumber');

        const busesWithLocations = activeBuses.map(location => ({
            busId: location.busId._id,
            busName: location.busId.busName,
            busNumber: location.busId.busNumber,
            latitude: location.location.coordinates[1],
            longitude: location.location.coordinates[0],
            speed: location.speed,
            heading: location.heading,
            lastUpdated: location.lastUpdated
        }));

        res.status(200).json({
            success: true,
            count: busesWithLocations.length,
            data: busesWithLocations
        });

    } catch (error) {
        console.error('Error fetching active buses:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active buses',
            error: error.message
        });
    }
};

export default {
    updateBusLocation,
    getBusLocation,
    stopSharingLocation,
    getAllActiveBuses
};
