import mongoose from 'mongoose';

/**
 * Get all bookings for buses owned by the operator
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getOperatorBookings = async (req, res) => {
    try {
        // The operator middleware sets req.operator which contains the decoded JWT
        // The operator ID should be in the JWT payload
        const operatorId = req.operator.id || req.operator._id;
        console.log("Operator data from token:", req.operator);
        console.log("Attempting with operator ID:", operatorId);

        if (!operatorId) {
            console.error("Operator ID is missing in the JWT token");
            return res.status(401).json({
                success: false,
                message: 'Authentication error: Operator ID not found'
            });
        }

        // Import necessary models
        const Ticket = mongoose.model('Ticket');
        const Bus = mongoose.model('Bus');

        // First, get all buses owned by this operator
        const operatorBuses = await Bus.find({ createdBy: operatorId });
        console.log("Operator buses found:", operatorBuses.length);
        console.log("Operator buses:", operatorBuses.map(bus => ({ id: bus._id, name: bus.busName })));

        // Extract bus IDs
        const busIds = operatorBuses.map(bus => bus._id);
        console.log("Bus IDs for query:", busIds);

        if (busIds.length === 0) {
            console.log("No buses found for operator");
            return res.status(200).json({
                success: true,
                bookings: [],
                message: 'No buses found for this operator'
            });
        }

        // Try both possible field names (busId or bus)
        console.log("Executing booking query for buses...");
        const bookings = await Ticket.find({
            $or: [
                { busId: { $in: busIds } },
                { bus: { $in: busIds } }  // Try this alternative field name
            ]
        })
            .sort({ createdAt: -1 })
            .lean();

        console.log("Raw bookings found:", bookings.length);
        if (bookings.length > 0) {
            console.log("Sample booking fields:", Object.keys(bookings[0]));
            console.log("Sample booking busId:", bookings[0].busId);
            console.log("Sample booking bus field:", bookings[0].bus);
        }

        // Process bookings to ensure consistent data format
        const processedBookings = bookings.map(booking => {
            // Handle nested data structures and provide defaults
            const fromLocation =
                (booking.ticketInfo && booking.ticketInfo.fromLocation) ?
                    booking.ticketInfo.fromLocation : 'Unknown';

            const toLocation =
                (booking.ticketInfo && booking.ticketInfo.toLocation) ?
                    booking.ticketInfo.toLocation : 'Unknown';

            return {
                ...booking,
                // Add top-level duplicates of nested properties for easier access in frontend
                fromLocation,
                toLocation,
                journeyDate: (booking.ticketInfo && booking.ticketInfo.date) ? booking.ticketInfo.date : null,
                selectedSeats: (booking.ticketInfo && booking.ticketInfo.selectedSeats) ? booking.ticketInfo.selectedSeats : [],
                totalPrice: booking.price || 0,
                // Ensure status exists even if not set in database
                status: booking.status || 'pending'
            };
        });

        console.log("Processed bookings to send:", processedBookings.length);
        return res.status(200).json({
            success: true,
            bookings: processedBookings
        });
    } catch (error) {
        console.error('Error fetching operator bookings:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch bookings',
            error: error.message
        });
    }
};

/**
 * Get details of a specific booking
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;
        const operatorId = req.operator.id || req.operator._id;

        if (!operatorId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication error: Operator ID not found'
            });
        }

        // Import necessary models
        const Ticket = mongoose.model('Ticket');
        const Bus = mongoose.model('Bus');

        // Get all buses owned by this operator
        const operatorBuses = await Bus.find({ createdBy: operatorId });
        const busIds = operatorBuses.map(bus => bus._id);

        // Find the booking and verify it belongs to one of the operator's buses
        const booking = await Ticket.findOne({
            _id: id,
            $or: [
                { busId: { $in: busIds } },
                { bus: { $in: busIds } }
            ]
        }).lean();

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found or not authorized to view this booking'
            });
        }

        return res.status(200).json({
            success: true,
            booking
        });
    } catch (error) {
        console.error('Error fetching booking details:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch booking details',
            error: error.message
        });
    }
}; 