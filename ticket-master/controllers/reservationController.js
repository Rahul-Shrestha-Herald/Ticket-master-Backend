import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Release a reservation and its associated seats
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const releaseReservation = async (req, res) => {
    const { reservationId } = req.body;

    if (!reservationId) {
        return res.status(400).json({
            success: false,
            message: 'Reservation ID is required'
        });
    }

    try {
        console.log(`Attempting to release reservation ${reservationId}`);

        // Get the models
        const Reservation = mongoose.model('Reservation');
        const Seat = mongoose.model('Seat');
        const Ticket = mongoose.model('Ticket');

        // Find the reservation
        const reservation = await Reservation.findById(reservationId);

        if (!reservation) {
            console.log(`Reservation ${reservationId} not found`);
            return res.status(404).json({
                success: false,
                message: 'Reservation not found'
            });
        }

        // Before doing anything else, check if there's a paid ticket for these seats
        const paidTicketsForSeats = await Ticket.find({
            'ticketInfo.selectedSeats': { $in: reservation.seatIds },
            paymentStatus: 'paid'
        });

        if (paidTicketsForSeats.length > 0) {
            console.log(`Found ${paidTicketsForSeats.length} paid tickets using these seats. Skipping release.`);
            return res.status(200).json({
                success: true,
                message: 'Seats already booked through paid tickets'
            });
        }

        // Check if the reservation is marked as permanent
        if (reservation.isPermanent) {
            console.log(`Reservation ${reservationId} is marked as permanent, skipping seat release`);
            return res.status(200).json({
                success: true,
                message: 'Reservation is permanent and cannot be released'
            });
        }

        // Get the seat IDs from the reservation
        const seatIds = reservation.seatIds || [];
        const busId = reservation.busId;

        console.log(`Found reservation ${reservationId} with ${seatIds.length} seats for busId ${busId}`);

        // Advanced Payment Verification:
        // 1. Check if there's a paid ticket with this reservationId
        // 2. Check if any seats are marked as permanently booked
        // 3. Check if any seats have a valid ticketId associated with them
        // 4. Check if there's any ticket that has these seat IDs

        // Step 1: Check for paid tickets directly associated with this reservation
        const paidTicket = await Ticket.findOne({
            $or: [
                { reservationId, paymentStatus: 'paid' },
                { reservationId, status: 'confirmed' },
                { _id: reservation.ticketId, paymentStatus: 'paid' },
                { _id: reservation.ticketId, status: 'confirmed' }
            ]
        });

        if (paidTicket) {
            console.log(`Reservation ${reservationId} has an associated paid ticket ${paidTicket._id}. Skipping seat release.`);

            // Update seats to ensure they're permanently booked
            if (seatIds && seatIds.length > 0) {
                console.log(`Ensuring ${seatIds.length} seats are permanently booked due to paid ticket`);
                await Seat.updateMany(
                    { _id: { $in: seatIds } },
                    {
                        $set: {
                            status: 'booked',
                            isPermanentlyBooked: true,
                            ticketId: paidTicket._id
                        }
                    }
                );
            }

            // Update the reservation to be permanent before deleting it
            await Reservation.findByIdAndUpdate(
                reservationId,
                {
                    $set: {
                        isPermanent: true,
                        ticketId: paidTicket._id
                    }
                }
            );

            // Remove the reservation record but keep the seats booked
            await Reservation.findByIdAndDelete(reservationId);

            return res.status(200).json({
                success: true,
                message: 'Reservation removed (seats remain booked due to completed payment)'
            });
        }

        // Step 2: Check if any tickets have these same seat IDs (regardless of reservation)
        // This handles cases where a new booking was made for the same seats
        if (seatIds && seatIds.length > 0) {
            const ticketsWithSameSeats = await Ticket.find({
                seatIds: { $in: seatIds },
                $or: [
                    { paymentStatus: 'paid' },
                    { status: 'confirmed' }
                ]
            });

            if (ticketsWithSameSeats.length > 0) {
                console.log(`Found ${ticketsWithSameSeats.length} tickets that include these seats. Keeping seats booked.`);

                // Create a set of seat IDs that should remain booked
                const keepBookedSeatIds = new Set();

                ticketsWithSameSeats.forEach(ticket => {
                    if (ticket.seatIds) {
                        ticket.seatIds.forEach(seatId => keepBookedSeatIds.add(seatId.toString()));
                    }
                });

                console.log(`${keepBookedSeatIds.size} seats should remain booked based on other tickets`);

                // Only release seats that aren't in the keepBookedSeatIds set
                const seatsToRelease = seatIds.filter(id => !keepBookedSeatIds.has(id.toString()));

                // Mark the seats that are in other tickets as permanently booked
                if (keepBookedSeatIds.size > 0) {
                    const seatIdsToKeep = Array.from(keepBookedSeatIds);
                    await Seat.updateMany(
                        { _id: { $in: seatIdsToKeep } },
                        {
                            $set: {
                                status: 'booked',
                                isPermanentlyBooked: true
                            }
                        }
                    );
                    console.log(`Marked ${seatIdsToKeep.length} seats as permanently booked due to other tickets`);
                }

                // Release only the seats that don't have other tickets
                if (seatsToRelease.length > 0) {
                    const updateResult = await Seat.updateMany(
                        { _id: { $in: seatsToRelease }, isPermanentlyBooked: { $ne: true } },
                        { $set: { status: 'available' } }
                    );
                    console.log(`Released ${updateResult.modifiedCount} seats to available status`);
                }

                // Delete the reservation
                await Reservation.findByIdAndDelete(reservationId);
                console.log(`Deleted reservation ${reservationId}`);

                return res.status(200).json({
                    success: true,
                    message: `Reservation released. ${seatsToRelease.length} seats released, ${keepBookedSeatIds.size} seats retained due to other tickets.`
                });
            }
        }

        // Step 3: Check if any seats are already marked as permanently booked
        const seats = await Seat.find({ _id: { $in: seatIds } });
        const permanentlyBookedSeats = seats.filter(seat => seat.isPermanentlyBooked);

        if (permanentlyBookedSeats.length > 0) {
            console.log(`Found ${permanentlyBookedSeats.length} permanently booked seats out of ${seatIds.length}`);

            // Check if any permanently booked seats have valid ticket IDs
            const ticketIds = permanentlyBookedSeats
                .map(seat => seat.ticketId)
                .filter(id => id);

            if (ticketIds.length > 0) {
                console.log(`Found tickets associated with permanently booked seats: ${ticketIds}`);

                // Check the payment status of these tickets
                const paidTickets = await Ticket.find({
                    _id: { $in: ticketIds },
                    $or: [
                        { paymentStatus: 'paid' },
                        { status: 'confirmed' }
                    ]
                });

                if (paidTickets.length > 0) {
                    console.log(`Found ${paidTickets.length} paid tickets associated with seats`);

                    // Only release seats that don't have a paid ticket
                    const paidSeatIds = new Set();

                    paidTickets.forEach(ticket => {
                        if (ticket.seatIds) {
                            ticket.seatIds.forEach(seatId => paidSeatIds.add(seatId.toString()));
                        }
                    });

                    const seatsToRelease = seatIds.filter(id => !paidSeatIds.has(id.toString()));
                    console.log(`After checking tickets, ${seatsToRelease.length} out of ${seatIds.length} seats will be released`);

                    if (seatsToRelease.length > 0) {
                        const updateResult = await Seat.updateMany(
                            { _id: { $in: seatsToRelease }, isPermanentlyBooked: { $ne: true } },
                            { $set: { status: 'available' } }
                        );
                        console.log(`Released ${updateResult.modifiedCount} non-permanent seats`);
                    }

                    // Delete the reservation
                    await Reservation.findByIdAndDelete(reservationId);
                    console.log(`Deleted reservation ${reservationId}`);

                    return res.status(200).json({
                        success: true,
                        message: `Reservation released. ${seatsToRelease.length} seats released, ${paidSeatIds.size} seats retained due to payment.`
                    });
                }
            }
        }

        // If no paid ticket found, filter out permanently booked seats
        const permanentSeatIds = permanentlyBookedSeats.map(seat => seat._id.toString());
        console.log(`Found ${permanentSeatIds.length} permanently booked seats that will NOT be released`);

        // Only release seats that are not permanently booked
        const seatsToRelease = seatIds.filter(id => !permanentSeatIds.includes(id.toString()));
        console.log(`Releasing ${seatsToRelease.length} non-permanent seats`);

        if (seatsToRelease.length > 0) {
            const updateResult = await Seat.updateMany(
                { _id: { $in: seatsToRelease }, isPermanentlyBooked: { $ne: true } },
                { $set: { status: 'available' } }
            );
            console.log(`Released ${updateResult.modifiedCount} seats to available status`);
        }

        // Delete the reservation
        await Reservation.findByIdAndDelete(reservationId);
        console.log(`Deleted reservation ${reservationId}`);

        return res.status(200).json({
            success: true,
            message: 'Reservation released successfully'
        });
    } catch (error) {
        console.error('Error releasing reservation:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to release reservation',
            error: error.message
        });
    }
};

/**
 * Check if a reservation has expired
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const checkReservationExpiry = async (req, res) => {
    const { reservationId } = req.params;

    if (!reservationId) {
        return res.status(400).json({
            success: false,
            message: 'Reservation ID is required'
        });
    }

    try {
        console.log(`Checking expiry for reservation ${reservationId}`);

        // Get the Reservation model
        const Reservation = mongoose.model('Reservation');
        const Seat = mongoose.model('Seat');
        const Ticket = mongoose.model('Ticket');

        // Find the reservation
        const reservation = await Reservation.findById(reservationId);

        if (!reservation) {
            console.log(`Reservation ${reservationId} not found`);
            return res.status(404).json({
                success: false,
                message: 'Reservation not found'
            });
        }

        // Get seat information to verify permanent status
        const seatIds = reservation.seatIds || [];
        const seats = await Seat.find({ _id: { $in: seatIds } });
        const permanentlyBookedSeats = seats.filter(seat => seat.isPermanentlyBooked);
        console.log(`Reservation has ${seatIds.length} seats, ${permanentlyBookedSeats.length} are permanently booked`);

        // Check if the reservation is marked as permanent
        if (reservation.isPermanent || permanentlyBookedSeats.length > 0) {
            console.log(`Reservation ${reservationId} is permanent or has permanent seats.`);
            return res.status(200).json({
                success: true,
                expired: false,
                message: 'Reservation is permanently valid',
                isPaid: true,
                ticketId: reservation.ticketId,
                permanentSeats: permanentlyBookedSeats.length,
                totalSeats: seatIds.length,
                remainingSeconds: 600, // Placeholder value, not actually used
                timeRemaining: 600,
                expiryTime: new Date(Date.now() + 600 * 1000) // Placeholder expiry time, not actually used
            });
        }

        // Check if there's a paid ticket for this reservation
        const paidTicket = await Ticket.findOne({
            reservationId,
            paymentStatus: 'paid',
            status: 'confirmed'
        });

        // If there's a paid ticket, the reservation is considered valid regardless of time
        if (paidTicket) {
            console.log(`Reservation ${reservationId} has an associated paid ticket.`);

            // Since we found a paid ticket but the reservation is not marked as permanent,
            // let's update the reservation and seats to be permanent
            reservation.isPermanent = true;
            reservation.ticketId = paidTicket._id;
            await reservation.save();

            // Mark all seats as permanently booked
            if (seatIds.length > 0) {
                await Seat.updateMany(
                    { _id: { $in: seatIds } },
                    {
                        $set: {
                            status: 'booked',
                            isPermanentlyBooked: true,
                            ticketId: paidTicket._id
                        }
                    }
                );
                console.log(`Updated ${seatIds.length} seats to permanently booked`);
            }

            return res.status(200).json({
                success: true,
                expired: false,
                message: 'Reservation is permanently valid due to completed payment',
                isPaid: true,
                ticketId: paidTicket._id,
                remainingSeconds: 600, // Just a placeholder, not used since payment is complete
                timeRemaining: 600,
                expiryTime: new Date(Date.now() + 600 * 1000) // Placeholder expiry time, not actually used
            });
        }

        // Check if the reservation has expired
        const createdAt = new Date(reservation.createdAt);
        const expiryTime = new Date(createdAt.getTime() + 10 * 60 * 1000); // 10 minutes in milliseconds
        const now = new Date();

        if (now > expiryTime) {
            console.log(`Reservation ${reservationId} has expired. Created at ${createdAt}, expired at ${expiryTime}, now is ${now}`);
            return res.status(200).json({
                success: true,
                expired: true,
                message: 'Reservation has expired',
                isPaid: false,
                timeRemaining: 0
            });
        }

        // Calculate remaining time in seconds
        const remainingSeconds = Math.floor((expiryTime - now) / 1000);
        console.log(`Reservation ${reservationId} is still valid. ${remainingSeconds} seconds remaining`);

        return res.status(200).json({
            success: true,
            expired: false,
            message: 'Reservation is still valid',
            isPaid: false,
            remainingSeconds,
            timeRemaining: remainingSeconds,
            expiryTime
        });
    } catch (error) {
        console.error('Error checking reservation expiry:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to check reservation expiry',
            error: error.message
        });
    }
};

/**
 * Confirm a reservation permanently after successful payment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const confirmReservation = async (req, res) => {
    const { reservationId, ticketId, bookingId } = req.body;

    if (!reservationId) {
        return res.status(400).json({
            success: false,
            message: 'Reservation ID is required'
        });
    }

    try {
        console.log(`Confirming reservation ${reservationId} permanently with ticketId ${ticketId}`);

        // Get the models
        const Reservation = mongoose.model('Reservation');
        const Seat = mongoose.model('Seat');
        const Ticket = mongoose.model('Ticket');
        const Bus = mongoose.model('Bus');

        // Check if the reservation exists
        let reservation = await Reservation.findById(reservationId);

        // Get proper BK-format booking ID from ticket if available
        let properBookingId = bookingId;
        if (ticketId) {
            const ticket = await Ticket.findById(ticketId);
            if (ticket && ticket.bookingId && ticket.bookingId.startsWith('BK-')) {
                properBookingId = ticket.bookingId;
                console.log(`Using ticket's booking ID format: ${properBookingId}`);
            }
        }

        // If reservation isn't found but we have a ticketId, we can still proceed
        // This handles cases where reservation might have expired or been deleted
        if (!reservation && ticketId) {
            console.log(`Reservation ${reservationId} not found, but ticketId ${ticketId} provided. Creating a new permanent reservation record.`);

            // Find the ticket to get necessary information
            const ticket = await Ticket.findById(ticketId);

            if (!ticket) {
                console.log(`Both reservation and ticket not found. Cannot proceed.`);
                return res.status(404).json({
                    success: false,
                    message: 'Neither reservation nor ticket found'
                });
            }

            // Create a new permanent reservation record
            reservation = new Reservation({
                _id: new mongoose.Types.ObjectId(),
                seatIds: ticket.seatIds || [],
                busId: ticket.busId,
                userId: ticket.userId,
                ticketId: ticket._id,
                bookingId: properBookingId || ticket.bookingId, // Use proper booking ID if available
                isPermanent: true,
                createdAt: new Date()
            });

            await reservation.save();
            console.log(`Created new permanent reservation for ticket ${ticketId}`);
        } else if (!reservation) {
            console.log(`Reservation ${reservationId} not found`);
            return res.status(404).json({
                success: false,
                message: 'Reservation not found'
            });
        }

        // Get the seat IDs from the reservation
        const seatIds = reservation.seatIds || [];
        const busId = reservation.busId;

        console.log(`Reservation found with ${seatIds.length} seats for busId ${busId}`);

        // Find the associated ticket if ticketId is provided
        let ticket = null;
        if (ticketId) {
            ticket = await Ticket.findById(ticketId);
            if (!ticket) {
                console.log(`Ticket ${ticketId} not found`);
                return res.status(404).json({
                    success: false,
                    message: 'Ticket not found'
                });
            }
            console.log(`Ticket ${ticketId} found, updating status to confirmed`);

            // Ensure the ticket has the seat IDs if they're missing
            if (!ticket.seatIds || ticket.seatIds.length === 0) {
                ticket.seatIds = seatIds;
            }
        }

        // Update the ticket status to confirmed if it exists
        if (ticket) {
            ticket.status = 'confirmed';
            ticket.paymentStatus = 'paid';
            ticket.isPermanent = true; // Add this flag to the ticket as well

            // Ensure bookingId is set on the ticket and has the proper format
            if (properBookingId && (!ticket.bookingId || !ticket.bookingId.startsWith('BK-'))) {
                ticket.bookingId = properBookingId;
            } else if (ticket.bookingId && !ticket.bookingId.startsWith('BK-') && ticket._id) {
                // Generate a booking ID in the BK-XXXXXXXXXX format if needed
                const timestamp = Math.floor(Date.now() / 1000);
                ticket.bookingId = `BK-${timestamp}${Math.floor(Math.random() * 1000)}`;
                console.log(`Generated new booking ID: ${ticket.bookingId}`);
            }

            await ticket.save();
            console.log(`Ticket ${ticketId} updated to confirmed status with bookingId ${ticket.bookingId}`);

            // Update properBookingId to use the ticket's booking ID
            properBookingId = ticket.bookingId;
        }

        // Update the seats to be permanently booked
        if (seatIds && seatIds.length > 0) {
            console.log(`Permanently booking ${seatIds.length} seats for reservation ${reservationId}`);

            // Find the bus to double-check it exists
            const bus = await Bus.findById(busId);
            if (!bus) {
                console.log(`Bus ${busId} not found. This could cause issues with seat permanence.`);
            }

            // First check if seats exist
            const seatsExist = await Seat.find({ _id: { $in: seatIds } });
            console.log(`Found ${seatsExist.length} seats out of ${seatIds.length} requested`);

            // Update each seat individually to ensure all are updated
            let updatedCount = 0;
            for (const seatId of seatIds) {
                try {
                    const updateResult = await Seat.updateOne(
                        { _id: seatId },
                        {
                            $set: {
                                status: 'booked',
                                isPermanentlyBooked: true,
                                ticketId: ticketId || null,
                                bookingId: properBookingId || null, // Use proper booking ID
                                busId: busId
                            }
                        }
                    );

                    if (updateResult.modifiedCount > 0) {
                        updatedCount++;
                    }
                } catch (seatError) {
                    console.error(`Error updating seat ${seatId}:`, seatError);
                }
            }

            console.log(`Successfully updated ${updatedCount} out of ${seatIds.length} seats to permanent status`);

            // Double-check that seats are properly marked by querying them again
            const verifySeats = await Seat.find({
                _id: { $in: seatIds },
                isPermanentlyBooked: true
            });

            console.log(`Verification: Found ${verifySeats.length} permanently booked seats out of ${seatIds.length}`);
        }

        // Update the reservation to mark it as permanent
        reservation.isPermanent = true;
        reservation.expiry = null; // Remove expiry
        reservation.ticketId = ticketId || null;

        // Ensure bookingId is set on the reservation with the proper format
        if (properBookingId && (!reservation.bookingId || !reservation.bookingId.startsWith('BK-'))) {
            reservation.bookingId = properBookingId;
        }

        await reservation.save();
        console.log(`Reservation ${reservationId} marked as permanent with bookingId ${reservation.bookingId}`);

        return res.status(200).json({
            success: true,
            message: 'Reservation confirmed permanently',
            bookingId: properBookingId
        });
    } catch (error) {
        console.error('Error confirming reservation:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to confirm reservation',
            error: error.message
        });
    }
};

const updateSeatStatus = async (busId, seatIds, status) => {
    try {
        const Seat = mongoose.model('Seat');
        // Add isPermanentlyBooked flag when seats are booked
        if (status === 'booked') {
            await Seat.updateMany(
                { busId, seatId: { $in: seatIds } },
                {
                    $set: {
                        status,
                        isPermanentlyBooked: true  // Mark seats as permanently booked
                    }
                }
            );
        } else {
            await Seat.updateMany(
                { busId, seatId: { $in: seatIds } },
                { $set: { status } }
            );
        }
        return true;
    } catch (error) {
        console.error('Error updating seat status:', error);
        return false;
    }
}; 