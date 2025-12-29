import Ticket from '../models/ticketModel.js';

// Verify a booking for tracking
const verifyBookingForTracking = async (req, res) => {
    try {
        const { bookingId, travelDate } = req.query;

        if (!bookingId) {
            return res.status(400).json({
                success: false,
                message: 'Booking ID is required'
            });
        }

        if (!travelDate) {
            return res.status(400).json({
                success: false,
                message: 'Travel date is required'
            });
        }

        // Find the ticket using bookingId
        const ticket = await Ticket.findOne({ bookingId });

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        // Check if the booking is confirmed/successful
        if (ticket.status !== 'confirmed' && ticket.paymentStatus !== 'paid') {
            return res.status(400).json({
                success: false,
                message: 'Only confirmed bookings can access live tracking'
            });
        }

        // Format the date from the ticket to compare with the input date
        const ticketDateObj = new Date(ticket.ticketInfo.date || ticket.bookingDate);
        const formattedTicketDate = ticketDateObj.toISOString().split('T')[0];

        // Format the input date for comparison
        const inputDateObj = new Date(travelDate);
        const formattedInputDate = inputDateObj.toISOString().split('T')[0];

        // Check if the travel date matches
        if (formattedTicketDate !== formattedInputDate) {
            return res.status(400).json({
                success: false,
                message: 'Travel date does not match booking date'
            });
        }

        // Check if departure and arrival times are within 12 hours before or after current time
        const currentTime = new Date();
        const departureTime = ticket.ticketInfo.departureTime;
        const arrivalTime = ticket.ticketInfo.arrivalTime;

        // Only proceed with time validation if both departure and arrival times exist
        if (departureTime && arrivalTime) {
            // Create a date object for departure time
            const [departureHours, departureMinutes] = departureTime.split(':').map(Number);
            const departureDateTime = new Date(ticketDateObj);
            departureDateTime.setHours(departureHours, departureMinutes, 0, 0);

            // Create a date object for arrival time
            const [arrivalHours, arrivalMinutes] = arrivalTime.split(':').map(Number);
            const arrivalDateTime = new Date(ticketDateObj);
            arrivalDateTime.setHours(arrivalHours, arrivalMinutes, 0, 0);

            // Handle case where arrival is next day
            if (arrivalHours < departureHours) {
                arrivalDateTime.setDate(arrivalDateTime.getDate() + 1);
            }

            // Calculate time windows (12 hours before departure and 12 hours after arrival)
            const earliestTrackingTime = new Date(departureDateTime);
            earliestTrackingTime.setHours(earliestTrackingTime.getHours() - 12);

            const latestTrackingTime = new Date(arrivalDateTime);
            latestTrackingTime.setHours(latestTrackingTime.getHours() + 12);

            // Check if current time is outside the allowed tracking window
            if (currentTime < earliestTrackingTime || currentTime > latestTrackingTime) {
                return res.status(400).json({
                    success: false,
                    message: 'Live tracking is only available 12 hours before departure and 12 hours after arrival'
                });
            }
        }

        // Return success with necessary bus information
        return res.status(200).json({
            success: true,
            message: 'Booking verified successfully',
            busId: ticket.busId,
            booking: {
                bookingId: ticket.bookingId,
                busName: ticket.ticketInfo.busName,
                fromLocation: ticket.ticketInfo.fromLocation,
                toLocation: ticket.ticketInfo.toLocation,
                date: formattedTicketDate,
                departureTime: ticket.ticketInfo.departureTime,
                arrivalTime: ticket.ticketInfo.arrivalTime
            }
        });

    } catch (error) {
        console.error('Error verifying booking for tracking:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while verifying the booking'
        });
    }
};

export { verifyBookingForTracking }; 