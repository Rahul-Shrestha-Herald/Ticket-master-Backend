import Ticket from '../../models/ticketModel.js';

/**
 * Get all bookings with optional filtering
 * @route GET /api/admin/bookings
 * @access Private (Admin only)
 */
export const getAllBookings = async (req, res) => {
    try {
        const { search, status, startDate, endDate, busId } = req.query;

        // Build query object
        const query = {};

        // Apply status filter
        if (status && status !== 'all') {
            if (status === 'success') {
                query.$or = [
                    { status: 'confirmed' },
                    { paymentStatus: 'paid' }
                ];
            } else if (status === 'failed') {
                query.$or = [
                    { status: 'pending' },
                    { paymentStatus: 'pending' }
                ];
            } else if (status === 'canceled') {
                query.$or = [
                    { status: 'canceled' },
                    { paymentStatus: 'refunded' }
                ];
            }
        }

        // Apply date range filter
        if (startDate && endDate) {
            query.bookingDate = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else if (startDate) {
            query.bookingDate = { $gte: new Date(startDate) };
        } else if (endDate) {
            query.bookingDate = { $lte: new Date(endDate) };
        }

        // Apply bus filter
        if (busId && busId !== 'all') {
            query.busId = busId;
        }

        // Apply search query
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { bookingId: searchRegex },
                { 'passengerInfo.name': searchRegex },
                { 'passengerInfo.email': searchRegex },
                { 'passengerInfo.phone': searchRegex },
                { 'ticketInfo.busName': searchRegex },
                { 'ticketInfo.busNumber': searchRegex },
                { 'ticketInfo.fromLocation': searchRegex },
                { 'ticketInfo.toLocation': searchRegex }
            ];
        }

        // Get bookings with population
        const bookings = await Ticket.find(query)
            .populate('busId', 'busName busNumber')
            .populate('userId', 'name email')
            .sort({ bookingDate: -1 });

        return res.status(200).json({
            success: true,
            count: bookings.length,
            bookings
        });
    } catch (error) {
        console.error('Error fetching bookings:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch bookings',
            error: error.message
        });
    }
};

/**
 * Get booking by ID
 * @route GET /api/admin/bookings/:id
 * @access Private (Admin only)
 */
export const getBookingById = async (req, res) => {
    try {
        const { id } = req.params;

        const booking = await Ticket.findById(id)
            .populate('busId', 'busName busNumber')
            .populate('userId', 'name email');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        return res.status(200).json({
            success: true,
            booking
        });
    } catch (error) {
        console.error('Error fetching booking:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch booking',
            error: error.message
        });
    }
}; 