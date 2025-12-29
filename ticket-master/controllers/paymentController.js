import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import transporter from '../config/nodemailer.js';
import { BOOKING_CONFIRMATION_TEMPLATE } from '../config/emailTemplates.js';
dotenv.config();

// Import models - we'll need to create these
import Ticket from '../models/ticketModel.js';
import Payment from '../models/paymentModel.js';
import Bus from '../models/operator/busModel.js';

// Environment variables
const KHALTI_API_URL = process.env.NODE_ENV === 'production'
    ? 'https://khalti.com/api/v2'
    : 'https://dev.khalti.com/api/v2';

const KHALTI_SECRET_KEY = process.env.KHALTI_SECRET_KEY;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Global flag to track email sending in progress
const emailSendingInProgress = new Map();

// Initiate Khalti payment
export const initiatePayment = async (req, res) => {
    try {
        console.log('Payment initiation request received:', req.body);

        const {
            amount,
            reservationId,
            passengerInfo,
            ticketInfo,
            pickupPointId,
            dropPointId
        } = req.body;

        // Validate required fields
        if (!amount || !reservationId || !passengerInfo || !ticketInfo) {
            console.log('Missing required fields:', {
                hasAmount: !!amount,
                hasReservationId: !!reservationId,
                hasPassengerInfo: !!passengerInfo,
                hasTicketInfo: !!ticketInfo
            });

            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Log validation success
        console.log('Validation passed, checking for existing ticket');

        // Check if a ticket with this reservationId already exists
        let ticket = await Ticket.findOne({ reservationId });
        let bookingId;
        let purchase_order_id;

        if (ticket) {
            console.log(`Found existing ticket with ID: ${ticket._id} and booking ID: ${ticket.bookingId}`);
            bookingId = ticket.bookingId;

            // Check if there's an existing payment for this ticket
            const existingPayment = await Payment.findOne({ ticketId: ticket._id });

            if (existingPayment && existingPayment.status === 'initiated' && existingPayment.pidx) {
                console.log(`Found existing payment with pidx: ${existingPayment.pidx}`);

                // Check if payment is still valid with Khalti
                try {
                    const khaltiResponse = await axios.post(
                        `${KHALTI_API_URL}/epayment/lookup/`,
                        { pidx: existingPayment.pidx },
                        {
                            headers: {
                                'Authorization': `Key ${KHALTI_SECRET_KEY}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );

                    // If payment is still pending, return the existing payment URL
                    if (khaltiResponse.data.status === 'Pending') {
                        return res.status(200).json({
                            success: true,
                            paymentUrl: existingPayment.paymentDetails.payment_url,
                            pidx: existingPayment.pidx,
                            bookingId: bookingId,
                            message: 'Using existing payment session'
                        });
                    }

                    // If payment was canceled or expired, we'll create a new one below
                    purchase_order_id = existingPayment.purchase_order_id;
                    console.log('Previous payment was canceled or expired, creating new one with same purchase_order_id');
                } catch (khaltiError) {
                    console.log('Error checking existing payment with Khalti:', khaltiError.message);
                    // Generate a new purchase order ID if we can't verify the old one
                    purchase_order_id = `ST-${Date.now()}-${uuidv4().substring(0, 8)}`;
                }
            } else {
                // Generate a new purchase order ID for the existing ticket
                purchase_order_id = `ST-${Date.now()}-${uuidv4().substring(0, 8)}`;
            }
        } else {
            // No existing ticket, create a new one
            console.log('No existing ticket found, creating new ticket');

            // Generate a unique purchase order ID
            purchase_order_id = `ST-${Date.now()}-${uuidv4().substring(0, 8)}`;

            // Generate a unique booking ID (format: BK-XXXXXXXXXXXX)
            bookingId = `BK-${Date.now().toString().substring(3, 13)}`;

            // Create a new ticket record
            ticket = new Ticket({
                busId: ticketInfo.busId,
                userId: req.body.userId || null,
                bookingId,
                reservationId,
                passengerInfo,
                ticketInfo,
                price: amount,
                pickupPointId,
                dropPointId
            });

            // Save the ticket
            await ticket.save();
            console.log('Ticket saved with ID:', ticket._id, 'and booking ID:', bookingId);
        }

        // Convert amount to paisa (Khalti requires amount in paisa)
        const amountInPaisa = Math.round(amount * 100);

        // Prepare Khalti payment request
        const khaltiPayload = {
            return_url: `${CLIENT_URL}/bus-tickets/payment-callback`,
            website_url: CLIENT_URL,
            amount: amountInPaisa,
            purchase_order_id,
            purchase_order_name: `Ticket for ${ticketInfo.fromLocation} to ${ticketInfo.toLocation}`,
            customer_info: {
                name: passengerInfo.name,
                email: passengerInfo.email,
                phone: passengerInfo.phone
            },
            amount_breakdown: [
                {
                    label: "Ticket Price",
                    amount: amountInPaisa
                }
            ],
            product_details: ticketInfo.selectedSeats.map((seat) => ({
                identity: `SEAT-${seat}`,
                name: `Seat ${seat}`,
                total_price: amountInPaisa / ticketInfo.selectedSeats.length,
                quantity: 1,
                unit_price: amountInPaisa / ticketInfo.selectedSeats.length
            }))
        };

        console.log('Making request to Khalti API');

        // Make API call to Khalti
        const response = await axios.post(
            `${KHALTI_API_URL}/epayment/initiate/`,
            khaltiPayload,
            {
                headers: {
                    'Authorization': `Key ${KHALTI_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Khalti API response received:', {
            pidx: response.data.pidx,
            status: response.data.status,
            payment_url: response.data.payment_url
        });

        // Check if a payment with this pidx already exists (defensive check)
        let payment = await Payment.findOne({ pidx: response.data.pidx });

        if (!payment) {
            // Create payment record
            payment = new Payment({
                ticketId: ticket._id,
                amount,
                status: 'initiated',
                pidx: response.data.pidx,
                purchase_order_id,
                paymentDetails: response.data
            });

            // Save the payment record
            await payment.save();
            console.log('Payment record saved with ID:', payment._id);
        } else {
            console.log('Payment record with this pidx already exists:', payment._id);
        }

        // Update the ticket with payment information
        ticket.paymentStatus = 'pending';
        await ticket.save();
        console.log('Ticket updated with pending payment status');

        // Return success response with payment URL
        return res.status(200).json({
            success: true,
            paymentUrl: response.data.payment_url,
            pidx: response.data.pidx,
            bookingId: bookingId
        });

    } catch (error) {
        console.error('Payment initiation error:', error);

        if (error.response) {
            console.error('Khalti API error response:', {
                status: error.response.status,
                data: error.response.data
            });
        }

        // If there's a response from Khalti, send that error
        if (error.response && error.response.data) {
            return res.status(error.response.status || 500).json({
                success: false,
                message: 'Payment initiation failed',
                error: error.response.data
            });
        }

        // Otherwise, send a generic error
        return res.status(500).json({
            success: false,
            message: 'Payment initiation failed. Please try again later.',
            error: error.message
        });
    }
};

// Verify Khalti payment
export const verifyPayment = async (req, res) => {
    try {
        const { pidx, status, purchase_order_id, reservationId } = req.body;

        console.log('Payment verification request received:', { pidx, status, purchase_order_id, reservationId });

        // Validate required fields
        if (!pidx) {
            return res.status(400).json({
                success: false,
                message: 'Transaction ID is required'
            });
        }

        // Find the payment record
        const payment = await Payment.findOne({ pidx });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment record not found'
            });
        }

        // Check if this payment has already been processed
        if (payment.status === 'completed' || payment.status === 'refunded') {
            console.log(`Payment ${pidx} has already been processed with status: ${payment.status}`);

            // Find the associated ticket
            const ticket = await Ticket.findById(payment.ticketId);

            if (!ticket) {
                return res.status(404).json({
                    success: false,
                    message: 'Ticket not found'
                });
            }

            // Generate invoice data based on ticket details
            const invoiceData = {
                ticketId: ticket._id,
                bookingId: ticket.bookingId,
                passengerName: ticket.passengerInfo.name,
                passengerEmail: ticket.passengerInfo.email,
                passengerPhone: ticket.passengerInfo.phone,
                alternatePhone: ticket.passengerInfo.alternatePhone,
                fromLocation: ticket.ticketInfo.fromLocation,
                toLocation: ticket.ticketInfo.toLocation,
                departureTime: ticket.ticketInfo.departureTime,
                arrivalTime: ticket.ticketInfo.arrivalTime,
                journeyDate: ticket.ticketInfo.date,
                busName: ticket.ticketInfo.busName,
                busNumber: ticket.ticketInfo.busNumber,
                selectedSeats: ticket.ticketInfo.selectedSeats,
                pickupPoint: ticket.ticketInfo.pickupPoint,
                dropPoint: ticket.ticketInfo.dropPoint,
                totalPrice: ticket.price,
                status: ticket.status,
                paymentStatus: ticket.paymentStatus,
                paymentMethod: 'Khalti',
                paymentDate: payment.paidAt,
                amountPaid: payment.amount,
                issueDate: ticket.createdAt
            };

            return res.status(200).json({
                success: true,
                message: 'Payment has already been processed',
                ticketId: ticket._id,
                bookingId: ticket.bookingId,
                invoiceData
            });
        }

        // Lookup the payment status from Khalti
        const response = await axios.post(
            `${KHALTI_API_URL}/epayment/lookup/`,
            { pidx },
            {
                headers: {
                    'Authorization': `Key ${KHALTI_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Find the associated ticket
        const ticket = await Ticket.findById(payment.ticketId);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Only update reservation on first verification
        const isFirstVerification = payment.status === 'initiated';

        // Store old ticket status to check if it changed
        const oldTicketStatus = ticket.status;
        const oldPaymentStatus = ticket.paymentStatus;

        // Update payment status based on Khalti response
        if (response.data.status === 'Completed') {
            // Payment successful
            payment.status = 'completed';
            payment.transactionId = response.data.transaction_id;
            payment.paidAt = new Date();
            payment.paymentDetails = { ...payment.paymentDetails, ...response.data };

            // Update ticket status
            ticket.status = 'confirmed';
            ticket.paymentStatus = 'paid';

            // Store busId and selectedSeats before any other operations
            const busId = ticket.ticketInfo.busId;
            const selectedSeats = ticket.ticketInfo.selectedSeats;

            // Save the ticket update immediately
            await ticket.save();
            console.log(`Updated ticket ${ticket._id} status to confirmed/paid`);

            // Only update seat status if this is the first time processing this payment
            if (isFirstVerification) {
                // First, update the schedule document - making this a priority before other operations
                try {
                    console.log(`Attempting to update Schedule for busId: ${busId} with seats: ${selectedSeats.join(', ')}`);

                    // Get the journey date from the ticket
                    const journeyDate = ticket.ticketInfo.date;
                    if (!journeyDate) {
                        console.error('Journey date is missing from ticket info');
                    }

                    console.log(`Journey date for this booking: ${journeyDate}`);

                    // Find the schedule directly by busId rather than relying on the reservation object
                    const Schedule = mongoose.model('Schedule');
                    const schedules = await Schedule.find({ busId });

                    if (schedules && schedules.length > 0) {
                        // Get the active schedule (usually the most recent one or filter by date if needed)
                        const schedule = schedules[0];
                        console.log(`Found schedule ${schedule._id} for busId ${busId}`);

                        // Update the schedule with the new date-based seats data structure
                        await updateScheduleWithSeats(schedule, selectedSeats, journeyDate);

                        // As a fallback, also try to get the schedule from the reservation object
                        if (reservationId && global.seatReservations && global.seatReservations[reservationId]) {
                            const reservation = global.seatReservations[reservationId];

                            if (reservation && reservation.schedule) {
                                const reservationSchedule = await Schedule.findById(reservation.schedule);

                                if (reservationSchedule && reservationSchedule._id.toString() !== schedule._id.toString()) {
                                    console.log(`Found different schedule ${reservationSchedule._id} from reservation`);

                                    // Update the reservation's schedule with the new data structure as well
                                    await updateScheduleWithSeats(reservationSchedule, selectedSeats, journeyDate);
                                }
                            }
                        }
                    } else {
                        console.log(`No schedule found for busId ${busId} - trying to find by date`);

                        // If we couldn't find by busId directly, try to find by date from the ticket
                        if (journeyDate) {
                            const searchDate = new Date(journeyDate);
                            const dateSchedules = await Schedule.find({
                                date: {
                                    $gte: new Date(searchDate.setHours(0, 0, 0, 0)),
                                    $lt: new Date(searchDate.setHours(23, 59, 59, 999))
                                },
                                busId
                            });

                            if (dateSchedules && dateSchedules.length > 0) {
                                const dateSchedule = dateSchedules[0];
                                console.log(`Found schedule by date ${dateSchedule._id}`);

                                // Update using the new helper function with date
                                await updateScheduleWithSeats(dateSchedule, selectedSeats, journeyDate);
                            } else {
                                console.error(`Could not find any schedule for busId ${busId} and date ${journeyDate}`);

                                // Create a new schedule document if none exists for this date
                                try {
                                    console.log(`Creating new schedule for busId ${busId} and date ${journeyDate}`);
                                    const newSchedule = new Schedule({
                                        busId,
                                        date: new Date(journeyDate),
                                        permanentlyBookedSeats: [{
                                            date: new Date(journeyDate).toISOString().split('T')[0],
                                            seats: [...selectedSeats]
                                        }]
                                    });

                                    await newSchedule.save();
                                    console.log(`Created new schedule with ID ${newSchedule._id}`);
                                } catch (createError) {
                                    console.error(`Failed to create new schedule: ${createError.message}`);
                                }
                            }
                        } else {
                            console.error(`No journey date available to search schedules for busId ${busId}`);
                        }
                    }
                } catch (scheduleError) {
                    console.error('Error updating schedule with permanently booked seats:', scheduleError);
                    // Continue with payment verification even if schedule update fails
                }

                // Now proceed with the rest of the operations
                try {
                    // ACTIVELY CANCEL THE TIMER to prevent the seats from being released
                    if (global.reservationTimers && global.reservationTimers[reservationId]) {
                        clearTimeout(global.reservationTimers[reservationId]);
                        delete global.reservationTimers[reservationId];
                        console.log(`Successfully canceled timer for reservation ${reservationId}`);
                    }

                    // Create/update Seat documents to ensure they're permanently booked
                    const Seat = mongoose.model('Seat');
                    const seatIds = selectedSeats;

                    // Check each seat and create or update as needed
                    for (const seatId of seatIds) {
                        await Seat.updateOne(
                            { busId, seatId },
                            {
                                $set: {
                                    busId,
                                    seatId,
                                    status: 'booked',
                                    isPermanentlyBooked: true,
                                    ticketId: ticket._id,
                                    bookingId: ticket.bookingId,
                                    lastUpdated: new Date()
                                }
                            },
                            { upsert: true } // Create if it doesn't exist
                        );
                    }

                    console.log(`Permanently booked ${seatIds.length} seats for ticket ${ticket._id}`);

                    // Update seats to booked status (legacy code, kept for compatibility)
                    await updateSeatStatus(busId, seatIds, 'booked');

                    // Remove the reservation since payment is complete
                    // This prevents the seats from being released when the reservation expires
                    if (reservationId) {
                        console.log('Removing reservation after successful payment:', reservationId);
                        await removeReservation(reservationId);

                        // Also clear reservation ID from the ticket to prevent any future reservation-based actions
                        ticket.reservationId = null;
                        await ticket.save();
                    }
                } catch (error) {
                    console.error('Error updating seat status:', error);
                    // We continue with the payment verification even if seat status update fails
                    // but log the error for debugging
                }
            } else {
                console.log(`Skip updating seat status for already processed payment ${pidx}`);
            }
        } else if (response.data.status === 'Refunded') {
            // Payment refunded
            payment.status = 'refunded';
            payment.refundedAt = new Date();
            payment.paymentDetails = { ...payment.paymentDetails, ...response.data };

            // Update ticket status
            ticket.status = 'canceled';
            ticket.paymentStatus = 'refunded';

            // Update seat status to 'available' again only if first verification
            if (isFirstVerification) {
                try {
                    await updateSeatStatus(ticket.ticketInfo.busId, ticket.ticketInfo.selectedSeats, 'available');

                    // Remove the reservation
                    if (reservationId) {
                        await removeReservation(reservationId);
                    }
                } catch (error) {
                    console.error('Error updating seat status:', error);
                }
            }
        } else if (
            response.data.status === 'Expired' ||
            response.data.status === 'User canceled'
        ) {
            // Payment failed
            payment.status = 'canceled';
            payment.paymentDetails = { ...payment.paymentDetails, ...response.data };

            // Update ticket status
            ticket.status = 'canceled';
            ticket.paymentStatus = 'canceled';

            // Update seat status to 'available' again only if first verification
            if (isFirstVerification) {
                try {
                    await updateSeatStatus(ticket.ticketInfo.busId, ticket.ticketInfo.selectedSeats, 'available');

                    // Remove the reservation
                    if (reservationId) {
                        await removeReservation(reservationId);
                    }
                } catch (error) {
                    console.error('Error updating seat status:', error);
                }
            }

            // Return response with booking ID for failed payment
            await payment.save();
            await ticket.save();

            return res.status(200).json({
                success: false,
                message: 'Payment was canceled or expired',
                bookingId: ticket.bookingId
            });
        } else {
            // Status pending or other unrecognized status
            payment.status = 'pending';
            payment.paymentDetails = { ...payment.paymentDetails, ...response.data };

            // Return response with booking ID for unrecognized status
            await payment.save();
            await ticket.save();

            return res.status(200).json({
                success: false,
                message: 'Payment status is pending or unrecognized',
                bookingId: ticket.bookingId
            });
        }

        // Save the updated payment and ticket
        await payment.save();
        await ticket.save();

        // Log status changes
        if (oldTicketStatus !== ticket.status || oldPaymentStatus !== ticket.paymentStatus) {
            console.log(`Ticket status changed from ${oldTicketStatus}/${oldPaymentStatus} to ${ticket.status}/${ticket.paymentStatus}`);
        }

        // Clear reservation expiry from localStorage on successful payment
        if (response.data.status === 'Completed') {
            console.log('Payment completed successfully. Ticket saved with permanent booking.');
        }

        // Store operator contact information in the ticket
        console.log(`Storing operator contact info for ticket ${ticket._id}, busId ${ticket.ticketInfo.busId || ticket.busId}`);
        const contactInfo = await storeOperatorContactInfo(ticket._id, ticket.ticketInfo.busId || ticket.busId);

        // Generate invoice data based on ticket details
        const invoiceData = {
            ticketId: ticket._id,
            bookingId: ticket.bookingId,
            paymentId: payment._id,
            invoiceNumber: payment.paymentId,
            busName: ticket.ticketInfo.busName,
            busNumber: ticket.ticketInfo.busNumber,
            busId: ticket.ticketInfo.busId || ticket.busId,
            passengerName: ticket.passengerDetails?.name || ticket.passengerInfo?.name,
            passengerPhone: ticket.passengerDetails?.phone || ticket.passengerInfo?.phone,
            alternatePhone: ticket.passengerDetails?.alternatePhone || ticket.passengerInfo?.alternatePhone,
            fromLocation: ticket.ticketInfo.fromLocation,
            toLocation: ticket.ticketInfo.toLocation,
            pickupPoint: ticket.ticketInfo.pickupPoint,
            dropPoint: ticket.ticketInfo.dropPoint,
            journeyDate: ticket.ticketInfo.journeyDate || ticket.ticketInfo.date,
            departureTime: ticket.ticketInfo.departureTime,
            arrivalTime: ticket.ticketInfo.arrivalTime,
            selectedSeats: ticket.ticketInfo.selectedSeats,
            totalPrice: ticket.price,
            pricePerSeat: ticket.price / ticket.ticketInfo.selectedSeats.length,
            paymentMethod: payment.paymentMethod,
            paymentStatus: payment.paymentStatus,
            paymentDate: payment.createdAt,
            qrCodeData: `${process.env.CLIENT_URL}/verify-ticket/${ticket._id}`,
            primaryContactNumber: contactInfo.primaryContactNumber,
            secondaryContactNumber: contactInfo.secondaryContactNumber,
            contactPhone: contactInfo.primaryContactNumber
                ? (contactInfo.secondaryContactNumber ? `${contactInfo.primaryContactNumber}, ${contactInfo.secondaryContactNumber}` : contactInfo.primaryContactNumber)
                : null
        };

        // Find the operator - more comprehensive approach
        const Operator = mongoose.model('Operator');
        const Bus = mongoose.model('Bus');

        // Correctly identify the bus ID - check in both possible locations
        let busId = ticket.busId; // First try the top-level busId field
        if (!busId && ticket.ticketInfo) {
            busId = ticket.ticketInfo.busId; // Then try in ticketInfo
        }

        console.log(`Looking for bus with ID: ${busId || 'undefined'} (from ticket ID: ${ticket._id})`);

        // Debug ticket structure to understand where busId is stored
        console.log(`Ticket structure debugging:
- Has top-level busId: ${ticket.busId ? 'yes' : 'no'} ${ticket.busId ? `(${ticket.busId})` : ''}
- Has ticketInfo: ${ticket.ticketInfo ? 'yes' : 'no'}
- ticketInfo has busId: ${ticket.ticketInfo?.busId ? 'yes' : 'no'} ${ticket.ticketInfo?.busId ? `(${ticket.ticketInfo.busId})` : ''}
- ticketInfo busName: ${ticket.ticketInfo?.busName || 'not available'}
- ticketInfo busNumber: ${ticket.ticketInfo?.busNumber || 'not available'}`);

        // First get the bus to find the correct operatorId
        let operator = null;
        if (busId) {
            try {
                // Direct approach - get bus and its createdBy field (which should be the operator)
                const bus = await Bus.findById(busId);
                console.log(`Found bus: ${bus ? bus._id : 'not found'} with createdBy: ${bus?.createdBy || 'not available'}`);

                if (bus) {
                    // Try the createdBy field first (which should be the operator)
                    if (bus.createdBy) {
                        operator = await Operator.findById(bus.createdBy);
                        console.log(`Found operator via createdBy: ${operator ? operator._id : 'not found'}`);
                    }

                    // If not found via createdBy, try operatorId field
                    if (!operator && bus.operatorId) {
                        operator = await Operator.findById(bus.operatorId);
                        console.log(`Found operator via operatorId: ${operator ? operator._id : 'not found'}`);
                    }

                    // If still not found, try the operator field
                    if (!operator && bus.operator) {
                        operator = await Operator.findById(bus.operator);
                        console.log(`Found operator via operator field: ${operator ? operator._id : 'not found'}`);
                    }

                    if (operator) {
                        console.log(`Operator email: ${operator.email || 'Not available'}`);
                    }
                }
            } catch (busLookupError) {
                console.error('Error finding bus:', busLookupError);
            }
        }

        // If still no operator, try to find an operator who has tickets for this bus or similar buses
        if (!operator) {
            try {
                // Get bus name/number from the current ticket
                const busName = ticket.ticketInfo?.busName;
                const busNumber = ticket.ticketInfo?.busNumber;

                if (busName || busNumber) {
                    console.log(`Looking for other tickets with the same bus name/number: ${busName || ''} ${busNumber || ''}`);

                    // Find other tickets for the same bus
                    const Ticket = mongoose.model('Ticket');
                    const query = { _id: { $ne: ticket._id } }; // Exclude current ticket

                    if (busName) query['ticketInfo.busName'] = busName;
                    if (busNumber) query['ticketInfo.busNumber'] = busNumber;

                    const similarTickets = await Ticket.find(query)
                        .sort({ createdAt: -1 }) // Most recent first
                        .limit(5);

                    console.log(`Found ${similarTickets.length} other tickets for the same bus`);

                    // Look through these tickets to find any with a valid busId
                    for (const similarTicket of similarTickets) {
                        const otherBusId = similarTicket.busId || similarTicket.ticketInfo?.busId;

                        if (otherBusId) {
                            console.log(`Found another ticket with busId: ${otherBusId}`);

                            // Try to find the bus and its operator
                            const bus = await Bus.findById(otherBusId).populate('createdBy');

                            if (bus && bus.createdBy) {
                                operator = bus.createdBy;
                                console.log(`Found operator through similar ticket lookup: ${operator._id}`);
                                break;
                            }
                        }
                    }
                }
            } catch (ticketLookupError) {
                console.error('Error finding operator via other tickets:', ticketLookupError);
            }
        }

        // If still no operator, try looking up by bus name and number directly
        if (!operator && ticket.ticketInfo) {
            try {
                const busName = ticket.ticketInfo.busName;
                const busNumber = ticket.ticketInfo.busNumber;

                if (busName || busNumber) {
                    console.log(`Trying to find bus by name: "${busName}" or number: "${busNumber}"`);

                    // Create a query to match by name or number
                    const query = {};
                    if (busName) query.busName = busName;
                    if (busNumber) query.busNumber = busNumber;

                    const matchingBuses = await Bus.find(query).populate('createdBy');
                    console.log(`Found ${matchingBuses.length} buses matching name/number criteria`);

                    if (matchingBuses.length > 0 && matchingBuses[0].createdBy) {
                        operator = matchingBuses[0].createdBy;
                        console.log(`Found operator through bus name/number lookup: ${operator._id}`);
                    }
                }
            } catch (busNameLookupError) {
                console.error('Error finding operator via bus name/number:', busNameLookupError);
            }
        }

        // If still no operator, check in the Schedule model
        if (!operator) {
            try {
                const Schedule = mongoose.model('Schedule');
                const schedules = await Schedule.find({ busId }).populate('operatorId');

                if (schedules && schedules.length > 0 && schedules[0].operatorId) {
                    operator = schedules[0].operatorId;
                    console.log(`Found operator from schedule's operatorId: ${operator._id}`);
                }
            } catch (scheduleLookupError) {
                console.error('Error finding operator via schedule:', scheduleLookupError);
            }
        }

        // Last resort - try direct query on Operator model for any connection
        if (!operator) {
            try {
                // Try to find any operator that owns this bus
                const operators = await Operator.find({ buses: busId });
                if (operators && operators.length > 0) {
                    operator = operators[0];
                    console.log(`Found operator by querying Operator.buses: ${operator._id}`);
                }
            } catch (operatorLookupError) {
                console.error('Error finding operator via direct query:', operatorLookupError);
            }
        }

        // Handle case where we still couldn't find an operator
        if (!operator) {
            console.log(`Could not find operator for bus ${busId} after all lookup attempts`);

            // Try to find any operator in the system as a last resort
            try {
                const anyOperator = await Operator.findOne();
                if (anyOperator) {
                    console.log(`Using default operator as fallback: ${anyOperator._id}`);
                    operator = anyOperator;
                }
            } catch (lastResortError) {
                console.error('Error finding default operator:', lastResortError);
            }
        }

        // Find the user if userId exists
        let user = null;
        if (ticket.userId) {
            const User = mongoose.model('User');
            user = await User.findById(ticket.userId);
        }

        // Send booking confirmation emails
        await sendBookingConfirmationEmails(ticket, payment, operator, user);

        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Payment verification successful',
            ticketId: ticket._id,
            bookingId: ticket.bookingId,
            invoiceData
        });
    } catch (error) {
        console.error('Payment verification error:', error);

        // Try to find the booking ID even in case of error
        let bookingId = '';
        try {
            if (req.body.pidx) {
                const payment = await Payment.findOne({ pidx: req.body.pidx });
                if (payment) {
                    const ticket = await Ticket.findById(payment.ticketId);
                    if (ticket) {
                        bookingId = ticket.bookingId;
                    }
                }
            }
        } catch (lookupError) {
            console.error('Error looking up booking ID:', lookupError);
        }

        // If there's a response from Khalti, send that error
        if (error.response && error.response.data) {
            return res.status(error.response.status || 500).json({
                success: false,
                message: 'Payment verification failed',
                error: error.response.data,
                bookingId
            });
        }

        // Otherwise, send a generic error
        return res.status(500).json({
            success: false,
            message: 'Payment verification failed. Please try again later.',
            error: error.message,
            bookingId
        });
    }
};

// Helper function to update seat status
const updateSeatStatus = async (busId, seatIds, status) => {
    // This implementation will depend on your database structure
    // Here's a basic example assuming you have a Seat model
    try {
        console.log(`Updating seat status for busId: ${busId}, seats: ${seatIds}, status: ${status}`);

        // Update the seats status
        const Seat = mongoose.model('Seat');

        if (status === 'booked') {
            // If status is 'booked', mark these seats as permanently booked so they won't be released
            await Seat.updateMany(
                { busId, seatId: { $in: seatIds } },
                {
                    $set: {
                        status,
                        isPermanentlyBooked: true,
                        lastUpdated: new Date()
                    }
                }
            );
            console.log(`Successfully marked ${seatIds.length} seats as permanently booked`);
        } else {
            // Only update status to 'available' for seats that are not permanently booked
            await Seat.updateMany(
                { busId, seatId: { $in: seatIds }, isPermanentlyBooked: { $ne: true } },
                {
                    $set: {
                        status,
                        lastUpdated: new Date()
                    }
                }
            );
            console.log(`Updated seats to ${status} status`);
        }
        return true;
    } catch (error) {
        console.error('Error updating seat status:', error);
        return false;
    }
};

// Helper function to remove reservation
const removeReservation = async (reservationId) => {
    try {
        console.log(`Removing reservation: ${reservationId}`);

        // ACTIVELY CANCEL THE TIMER
        if (global.reservationTimers && global.reservationTimers[reservationId]) {
            clearTimeout(global.reservationTimers[reservationId]);
            delete global.reservationTimers[reservationId];
            console.log(`Successfully canceled timer for reservation ${reservationId}`);
        }

        // First, check if this reservation is in the global reservations
        if (global.seatReservations && global.seatReservations[reservationId]) {
            // Mark this reservation as processed by payment (so automatic cleanup won't release it)
            global.seatReservations[reservationId].paidAndProcessed = true;
            console.log(`Marked reservation ${reservationId} as paid and processed`);

            // Get the information before we delete it
            const busId = global.seatReservations[reservationId].busId;
            const seatIds = global.seatReservations[reservationId].seatIds;

            // Delete it from memory
            delete global.seatReservations[reservationId];

            // Ensure these seats are marked as permanently booked in the Seat model
            try {
                const Seat = mongoose.model('Seat');
                for (const seatId of seatIds) {
                    await Seat.updateOne(
                        { busId, seatId },
                        {
                            $set: {
                                status: 'booked',
                                isPermanentlyBooked: true,
                                lastUpdated: new Date()
                            }
                        },
                        { upsert: true }
                    );
                }
                console.log(`Ensured ${seatIds.length} seats are permanently booked in memory cleanup`);
            } catch (error) {
                console.error('Error updating seats from memory reservation:', error);
            }
        }

        // Check if the reservation exists in the database
        const Reservation = mongoose.model('Reservation');
        const reservation = await Reservation.findById(reservationId);

        if (reservation) {
            // Mark reservation as permanent before removing it
            await Reservation.findByIdAndUpdate(
                reservationId,
                { $set: { isPermanent: true } }
            );
            console.log(`Updated reservation ${reservationId} as permanent before deletion`);

            // Find the seats associated with this reservation
            if (reservation.seatIds && reservation.seatIds.length > 0) {
                // Mark these seats as permanently booked
                const Seat = mongoose.model('Seat');
                await Seat.updateMany(
                    { _id: { $in: reservation.seatIds } },
                    {
                        $set: {
                            status: 'booked',
                            isPermanentlyBooked: true,
                            reservationId: null  // Remove reservation ID reference
                        }
                    }
                );
                console.log(`Marked ${reservation.seatIds.length} seats as permanently booked`);

                // Also update any seats by seatId if present
                if (reservation.busId) {
                    await Seat.updateMany(
                        {
                            busId: reservation.busId,
                            seatId: { $in: reservation.seats || [] }
                        },
                        {
                            $set: {
                                status: 'booked',
                                isPermanentlyBooked: true,
                                reservationId: null  // Remove reservation ID reference
                            }
                        }
                    );
                    console.log(`Additional check: Updated seats by seatId for bus ${reservation.busId}`);
                }
            }

            // Now delete the reservation
            await Reservation.findByIdAndDelete(reservationId);
            console.log(`Deleted reservation ${reservationId} from database`);
        } else {
            console.log(`Reservation ${reservationId} not found in database`);
        }

        return true;
    } catch (error) {
        console.error('Error removing reservation:', error);
        return false;
    }
};

// Store bus contact information in ticket when creating or updating it
const storeOperatorContactInfo = async (ticketId, busId) => {
    try {
        // Fetch bus details to get contact information
        const Bus = mongoose.model('Bus');
        const bus = await Bus.findById(busId);

        if (!bus) {
            console.log(`No bus found with ID: ${busId} for getting contact information`);
            return { success: false, primaryContactNumber: null, secondaryContactNumber: null };
        }

        // Get the contact information
        const primaryContactNumber = bus.primaryContactNumber || null;
        const secondaryContactNumber = bus.secondaryContactNumber || null;

        if (!primaryContactNumber && !secondaryContactNumber) {
            console.log(`No contact information found for bus ID: ${busId}`);
            return { success: false, primaryContactNumber: null, secondaryContactNumber: null };
        }

        // Update the ticket with operator contact information
        const updatedTicket = await Ticket.findByIdAndUpdate(
            ticketId,
            {
                operatorContact: {
                    primaryContactNumber,
                    secondaryContactNumber
                }
            },
            { new: true }
        );

        console.log(`Updated ticket ${ticketId} with operator contact information: ${primaryContactNumber}, ${secondaryContactNumber}`);

        return {
            success: true,
            primaryContactNumber,
            secondaryContactNumber,
            ticket: updatedTicket
        };
    } catch (error) {
        console.error('Error storing operator contact information:', error);
        return {
            success: false,
            primaryContactNumber: null,
            secondaryContactNumber: null,
            error: error.message
        };
    }
};

// Add endpoint to fetch invoice by ticketId
export const getInvoice = async (req, res) => {
    try {
        const { ticketId } = req.params;
        console.log(`Invoice requested for ticket ID: ${ticketId}`);

        if (!ticketId) {
            return res.status(400).json({
                success: false,
                message: 'Ticket ID is required'
            });
        }

        // Find ticket by ID
        const ticket = await Ticket.findById(ticketId);

        if (!ticket) {
            console.log(`Ticket not found with ID: ${ticketId}`);
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        console.log(`Ticket found: ${ticket._id}, Status: ${ticket.status}, PaymentStatus: ${ticket.paymentStatus}`);

        // Find payment with ticket ID
        const payment = await Payment.findOne({ ticketId });

        if (!payment) {
            console.log(`No payment record found for ticket: ${ticketId}`);
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        console.log(`Payment found: ${payment._id}, Status: ${payment.status}, PaymentStatus: ${payment.paymentStatus || 'N/A'}`);

        // Check if payment is completed or paid (accept both statuses)
        if (payment.status !== 'completed' && payment.paymentStatus !== 'completed' &&
            payment.status !== 'paid' && payment.paymentStatus !== 'paid') {
            console.log(`Payment status check failed. Status: ${payment.status}, PaymentStatus: ${payment.paymentStatus}`);
            return res.status(404).json({
                success: false,
                message: 'Payment incomplete or not confirmed'
            });
        }

        console.log(`Payment validated for ticket: ${ticketId}`);

        // Get contact information from ticket's operatorContact field
        let primaryContactNumber = null;
        let secondaryContactNumber = null;
        let contactPhone = null;

        // If ticket has stored operator contact, use it
        if (ticket.operatorContact && ticket.operatorContact.primaryContactNumber) {
            primaryContactNumber = ticket.operatorContact.primaryContactNumber;
            secondaryContactNumber = ticket.operatorContact.secondaryContactNumber || null;

            // Create formatted contact phone string
            contactPhone = primaryContactNumber
                ? (secondaryContactNumber ? `${primaryContactNumber}, ${secondaryContactNumber}` : primaryContactNumber)
                : null;

            console.log('Using operator contact from ticket:', { primaryContactNumber, secondaryContactNumber });
        } else {
            // Fallback: Try to get contact info from the bus
            try {
                const Bus = mongoose.model('Bus');
                const bus = await Bus.findById(ticket.ticketInfo.busId || ticket.busId);

                if (bus) {
                    primaryContactNumber = bus.primaryContactNumber || null;
                    secondaryContactNumber = bus.secondaryContactNumber || null;

                    // Create formatted contact phone string
                    contactPhone = primaryContactNumber
                        ? (secondaryContactNumber ? `${primaryContactNumber}, ${secondaryContactNumber}` : primaryContactNumber)
                        : null;

                    console.log('Using contact from bus:', { primaryContactNumber, secondaryContactNumber });

                    // Store the contact info in the ticket for future use
                    storeOperatorContactInfo(ticketId, bus._id);
                }
            } catch (error) {
                console.error('Error fetching contact information from bus:', error);
            }
        }

        // Calculate price per seat accurately
        const totalSeats = ticket.ticketInfo.selectedSeats.length;
        const pricePerSeat = totalSeats > 0 ? Math.round(ticket.price / totalSeats) : 0;

        // Create invoice data with all necessary information
        const invoiceData = {
            ticketId: ticket._id,
            bookingId: ticket.bookingId,
            paymentId: payment._id,
            invoiceNumber: payment.paymentId,
            busName: ticket.ticketInfo.busName,
            busNumber: ticket.ticketInfo.busNumber,
            busId: ticket.ticketInfo.busId || ticket.busId,
            passengerName: ticket.passengerDetails?.name || ticket.passengerInfo?.name,
            passengerPhone: ticket.passengerDetails?.phone || ticket.passengerInfo?.phone,
            alternatePhone: ticket.passengerDetails?.alternatePhone || ticket.passengerInfo?.alternatePhone,
            fromLocation: ticket.ticketInfo.fromLocation,
            toLocation: ticket.ticketInfo.toLocation,
            pickupPoint: ticket.ticketInfo.pickupPoint,
            dropPoint: ticket.ticketInfo.dropPoint,
            journeyDate: ticket.ticketInfo.journeyDate || ticket.ticketInfo.date,
            departureTime: ticket.ticketInfo.departureTime,
            arrivalTime: ticket.ticketInfo.arrivalTime,
            selectedSeats: ticket.ticketInfo.selectedSeats,
            totalPrice: ticket.price,
            pricePerSeat: pricePerSeat,
            paymentMethod: payment.paymentMethod,
            paymentStatus: payment.paymentStatus,
            paymentDate: payment.createdAt,
            qrCodeData: `${process.env.CLIENT_URL}/verify-ticket/${ticket._id}`,
            primaryContactNumber,
            secondaryContactNumber,
            contactPhone
        };

        return res.status(200).json({
            success: true,
            message: 'Invoice generated successfully',
            data: invoiceData
        });
    } catch (error) {
        console.error('Error generating invoice:', error);
        return res.status(500).json({
            success: false,
            message: 'Error generating invoice',
            error: error.message
        });
    }
};

/**
 * Get ticket by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getTicketById = async (req, res) => {
    const { ticketId } = req.params;

    if (!ticketId) {
        return res.status(400).json({
            success: false,
            message: 'Ticket ID is required'
        });
    }

    try {
        const Ticket = mongoose.model('Ticket');

        const ticket = await Ticket.findById(ticketId);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        return res.status(200).json({
            success: true,
            ticket: {
                _id: ticket._id,
                bookingId: ticket.bookingId,
                status: ticket.status,
                paymentStatus: ticket.paymentStatus
            }
        });
    } catch (error) {
        console.error('Error fetching ticket:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch ticket',
            error: error.message
        });
    }
};

/**
 * Get ticket by order ID (purchase_order_id)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getTicketByOrderId = async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
        return res.status(400).json({
            success: false,
            message: 'Order ID is required'
        });
    }

    try {
        const Ticket = mongoose.model('Ticket');

        // Find ticket by purchase_order_id or transactionId field
        const ticket = await Ticket.findOne({
            $or: [
                { purchase_order_id: orderId },
                { transactionId: orderId },
                { 'paymentDetails.order_id': orderId },
                { 'paymentDetails.transaction_id': orderId }
            ]
        });

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found for this order'
            });
        }

        return res.status(200).json({
            success: true,
            ticket: {
                _id: ticket._id,
                bookingId: ticket.bookingId,
                status: ticket.status,
                paymentStatus: ticket.paymentStatus
            }
        });
    } catch (error) {
        console.error('Error fetching ticket by order:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch ticket by order',
            error: error.message
        });
    }
};

/**
 * Get ticket by transaction ID (pidx)
 * This function helps retrieve the correct booking ID by transaction details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getTicketByTransaction = async (req, res) => {
    const { pidx, purchase_order_id } = req.body;

    if (!pidx && !purchase_order_id) {
        return res.status(400).json({
            success: false,
            message: 'Either transaction ID (pidx) or purchase order ID is required'
        });
    }

    try {
        // First try to find the payment record by pidx
        const Payment = mongoose.model('Payment');
        const payment = await Payment.findOne({ pidx });

        if (payment) {
            // Found payment, now get the ticket
            const Ticket = mongoose.model('Ticket');
            const ticket = await Ticket.findById(payment.ticketId);

            if (ticket) {
                return res.status(200).json({
                    success: true,
                    bookingId: ticket.bookingId,
                    ticket: {
                        _id: ticket._id,
                        bookingId: ticket.bookingId,
                        status: ticket.status,
                        paymentStatus: ticket.paymentStatus
                    }
                });
            }
        }

        // If not found by pidx, try with purchase_order_id
        if (purchase_order_id) {
            const paymentByOrderId = await Payment.findOne({ purchase_order_id });

            if (paymentByOrderId) {
                const Ticket = mongoose.model('Ticket');
                const ticket = await Ticket.findById(paymentByOrderId.ticketId);

                if (ticket) {
                    return res.status(200).json({
                        success: true,
                        bookingId: ticket.bookingId,
                        ticket: {
                            _id: ticket._id,
                            bookingId: ticket.bookingId,
                            status: ticket.status,
                            paymentStatus: ticket.paymentStatus
                        }
                    });
                }
            }

            // Try finding directly in ticket collection
            const Ticket = mongoose.model('Ticket');
            const ticket = await Ticket.findOne({
                $or: [
                    { purchase_order_id },
                    { 'paymentDetails.purchase_order_id': purchase_order_id }
                ]
            });

            if (ticket) {
                return res.status(200).json({
                    success: true,
                    bookingId: ticket.bookingId,
                    ticket: {
                        _id: ticket._id,
                        bookingId: ticket.bookingId,
                        status: ticket.status,
                        paymentStatus: ticket.paymentStatus
                    }
                });
            }
        }

        // If still not found, return not found response
        return res.status(404).json({
            success: false,
            message: 'No ticket found associated with this transaction'
        });
    } catch (error) {
        console.error('Error finding ticket by transaction:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to find ticket by transaction',
            error: error.message
        });
    }
};

/**
 * Utility function to repair and ensure seats from confirmed tickets are added to schedule's permanentlyBookedSeats
 * This can be called manually to fix existing data or added to a scheduled task
 */
export const repairPermanentlyBookedSeats = async (req, res) => {
    try {
        console.log('Starting repair of permanently booked seats with new date-based structure');

        // Get all confirmed tickets with paid status
        const Ticket = mongoose.model('Ticket');
        const confirmedTickets = await Ticket.find({
            status: 'confirmed',
            paymentStatus: 'paid'
        });

        console.log(`Found ${confirmedTickets.length} confirmed tickets to process`);

        let successCount = 0;
        let errorCount = 0;
        let migratedCount = 0;
        const errors = [];

        // Check if we need to migrate the Schema for permanentlyBookedSeats
        const Schedule = mongoose.model('Schedule');
        const allSchedules = await Schedule.find({
            permanentlyBookedSeats: { $exists: true, $ne: [] }
        });

        console.log(`Found ${allSchedules.length} schedules with existing permanently booked seats`);

        // Migration stats
        const migrationResults = {
            needsMigration: 0,
            alreadyMigrated: 0,
            migrationErrors: 0
        };

        // First check if any schedules need migration (have old format)
        for (const schedule of allSchedules) {
            try {
                if (schedule.permanentlyBookedSeats &&
                    Array.isArray(schedule.permanentlyBookedSeats) &&
                    schedule.permanentlyBookedSeats.length > 0) {

                    // Check if we need to migrate from old format to new format
                    if (typeof schedule.permanentlyBookedSeats[0] === 'string') {
                        migrationResults.needsMigration++;
                        console.log(`Schedule ${schedule._id} needs migration from old format`);

                        // Find the first ticket that corresponds to this schedule to get the date
                        let migrationDate = new Date().toISOString().split('T')[0]; // Default to today

                        // Try to find a matching ticket for this bus to get a proper date
                        const ticketsForBus = await Ticket.find({
                            'ticketInfo.busId': schedule.busId,
                            status: 'confirmed',
                            paymentStatus: 'paid'
                        });

                        if (ticketsForBus.length > 0 && ticketsForBus[0].ticketInfo.date) {
                            migrationDate = new Date(ticketsForBus[0].ticketInfo.date).toISOString().split('T')[0];
                            console.log(`Using date ${migrationDate} from ticket for migration`);
                        }

                        // Convert old format to new format
                        const oldSeats = [...schedule.permanentlyBookedSeats];

                        schedule.permanentlyBookedSeats = [{
                            date: migrationDate,
                            seats: oldSeats
                        }];

                        // Save the migrated schedule
                        await Schedule.findByIdAndUpdate(
                            schedule._id,
                            { $set: { permanentlyBookedSeats: schedule.permanentlyBookedSeats } }
                        );

                        console.log(`Successfully migrated schedule ${schedule._id} with ${oldSeats.length} seats to date ${migrationDate}`);
                        migratedCount++;
                    } else {
                        // Already in new format
                        migrationResults.alreadyMigrated++;
                    }
                }
            } catch (migrationError) {
                console.error(`Error migrating schedule ${schedule._id}:`, migrationError);
                migrationResults.migrationErrors++;
                errors.push(`Migration error for schedule ${schedule._id}: ${migrationError.message}`);
            }
        }

        console.log('Migration results:', migrationResults);

        // Now process each ticket to ensure it's properly stored in the schedule
        for (const ticket of confirmedTickets) {
            try {
                const busId = ticket.ticketInfo?.busId;
                const selectedSeats = ticket.ticketInfo?.selectedSeats || [];
                const journeyDate = ticket.ticketInfo?.date;

                if (!busId || selectedSeats.length === 0 || !journeyDate) {
                    console.log(`Skipping ticket ${ticket._id} - missing busId, seats, or date`);
                    continue;
                }

                console.log(`Processing ticket ${ticket._id} with seats: ${selectedSeats.join(', ')} for date ${journeyDate}`);

                // Find all relevant schedules for this bus
                const schedules = await Schedule.find({ busId });

                if (!schedules || schedules.length === 0) {
                    console.log(`No schedules found for busId ${busId}, trying to find by date`);

                    // Try to find by date
                    const searchDate = new Date(journeyDate);
                    const dateSchedules = await Schedule.find({
                        date: {
                            $gte: new Date(searchDate.setHours(0, 0, 0, 0)),
                            $lt: new Date(searchDate.setHours(23, 59, 59, 999))
                        },
                        busId
                    });

                    if (dateSchedules && dateSchedules.length > 0) {
                        await updateScheduleWithSeats(dateSchedules[0], selectedSeats, journeyDate);
                        successCount++;
                    } else {
                        // Create a new schedule if none exists
                        try {
                            console.log(`Creating new schedule for busId ${busId} and date ${journeyDate}`);
                            const newSchedule = new Schedule({
                                busId,
                                date: new Date(journeyDate),
                                permanentlyBookedSeats: [{
                                    date: new Date(journeyDate).toISOString().split('T')[0],
                                    seats: [...selectedSeats]
                                }]
                            });

                            await newSchedule.save();
                            console.log(`Created new schedule with ID ${newSchedule._id}`);
                            successCount++;
                        } catch (createError) {
                            console.error(`Failed to create new schedule: ${createError.message}`);
                            errorCount++;
                            errors.push(`Could not create schedule for ticket ${ticket._id} with busId ${busId} and date ${journeyDate}: ${createError.message}`);
                        }
                    }
                } else {
                    // Update all matching schedules (typically there should be just one)
                    for (const schedule of schedules) {
                        await updateScheduleWithSeats(schedule, selectedSeats, journeyDate);
                    }
                    successCount++;
                }
            } catch (ticketError) {
                console.error(`Error processing ticket ${ticket._id}:`, ticketError);
                errorCount++;
                errors.push(`Error processing ticket ${ticket._id}: ${ticketError.message}`);
            }
        }

        const result = {
            success: true,
            message: 'Repair and migration operation completed',
            totalProcessed: confirmedTickets.length,
            successCount,
            errorCount,
            migratedCount,
            migrationStats: migrationResults,
            errors: errors.length > 5 ? errors.slice(0, 5).concat(['... (truncated)']) : errors
        };

        console.log('Repair completed:', result);

        if (res) {
            return res.status(200).json(result);
        }

        return result;
    } catch (error) {
        console.error('Error in repair function:', error);

        const result = {
            success: false,
            message: 'Repair operation failed',
            error: error.message
        };

        if (res) {
            return res.status(500).json(result);
        }

        return result;
    }
};

/**
 * Helper function to update a schedule with permanently booked seats
 * @param {Object} schedule - The schedule document to update
 * @param {Array} seatIds - Array of seat IDs to add to permanentlyBookedSeats
 * @param {String} date - The date of the journey in YYYY-MM-DD format
 */
const updateScheduleWithSeats = async (schedule, seatIds, date) => {
    try {
        // Ensure we have a valid date
        if (!date) {
            console.error('Date is required for seat booking');
            throw new Error('Date is required for seat booking');
        }

        // Format date to YYYY-MM-DD for consistency
        const formattedDate = new Date(date).toISOString().split('T')[0];

        // Initialize permanentlyBookedSeats array if it doesn't exist
        if (!schedule.permanentlyBookedSeats) {
            schedule.permanentlyBookedSeats = [];
        }

        // Check if we need to migrate from old format (array of strings) to new format (array of objects)
        if (Array.isArray(schedule.permanentlyBookedSeats) &&
            schedule.permanentlyBookedSeats.length > 0 &&
            typeof schedule.permanentlyBookedSeats[0] === 'string') {

            console.log(`Migrating schedule ${schedule._id} from old format to new format`);

            // Get the existing seats from old format
            const oldSeats = [...schedule.permanentlyBookedSeats];

            // Create new format with a default date (today) for existing seats
            schedule.permanentlyBookedSeats = [{
                date: formattedDate, // Use the same date for migration for simplicity
                seats: oldSeats
            }];

            console.log(`Migrated ${oldSeats.length} seats to new format with date ${formattedDate}`);
        }

        // Find if there's an entry for this date already
        let dateEntry = schedule.permanentlyBookedSeats.find(entry => entry.date === formattedDate);

        let seatsAdded = false;

        if (dateEntry) {
            // Date entry exists, add seats that aren't already included
            seatIds.forEach(seatId => {
                if (!dateEntry.seats.includes(seatId)) {
                    dateEntry.seats.push(seatId);
                    seatsAdded = true;
                    console.log(`Added seat ${seatId} to date ${formattedDate}`);
                }
            });
        } else {
            // Create a new entry for this date
            schedule.permanentlyBookedSeats.push({
                date: formattedDate,
                seats: [...seatIds]
            });
            seatsAdded = true;
            console.log(`Created new entry for date ${formattedDate} with seats: ${seatIds.join(', ')}`);
        }

        // Only update the database if changes were made
        if (seatsAdded) {
            const Schedule = mongoose.model('Schedule');
            const updateResult = await Schedule.findByIdAndUpdate(
                schedule._id,
                { $set: { permanentlyBookedSeats: schedule.permanentlyBookedSeats } },
                { new: true }
            );

            console.log(`Updated schedule ${schedule._id} with new permanently booked seats structure`);
            return updateResult;
        } else {
            console.log(`No new seats to add for date ${formattedDate} in schedule ${schedule._id}`);
            return schedule;
        }
    } catch (error) {
        console.error(`Error updating schedule ${schedule._id}:`, error);
        throw error;
    }
};

/**
 * Helper function to send booking confirmation emails
 * @param {Object} ticket - The ticket document
 * @param {Object} payment - The payment document
 * @param {Object} operator - The operator document
 * @param {Object} user - The user document (optional)
 */
const sendBookingConfirmationEmails = async (ticket, payment, operator, user = null) => {
    try {
        // Create a unique mutex key for this ticket
        const mutexKey = `email-${ticket._id.toString()}`;

        // Check if email sending is already in progress for this ticket
        if (emailSendingInProgress.has(mutexKey)) {
            console.log(`Email sending already in progress for ticket ${ticket._id}, skipping duplicate call`);
            return;
        }

        // Set the in-progress flag before we start
        emailSendingInProgress.set(mutexKey, true);

        // Create a unique identifier for this booking confirmation
        const confirmationId = `${ticket._id}-${payment._id}-${Date.now()}`;
        console.log(`Starting email sending process with ID: ${confirmationId}`);

        try {
            // Check in database if this ticket has already had confirmation emails sent
            const Ticket = mongoose.model('Ticket');
            const currentTicket = await Ticket.findById(ticket._id);

            if (currentTicket && currentTicket.emailsSent) {
                console.log(`Emails already sent for ticket ${ticket._id} (db check), skipping duplicate sending`);
                emailSendingInProgress.delete(mutexKey); // Release the mutex
                return;
            }

            console.log('Preparing to send booking confirmation emails');

            // Get operator contact information
            let operatorPrimaryContact = ticket.operatorContact?.primaryContactNumber || null;
            let operatorSecondaryContact = ticket.operatorContact?.secondaryContactNumber || null;

            // If contact information is not in the ticket, fetch it from the bus
            if (!operatorPrimaryContact) {
                try {
                    const busId = ticket.ticketInfo.busId || ticket.busId;
                    console.log(`Fetching bus contact info for busId: ${busId}`);

                    // Use the improved storeOperatorContactInfo function
                    const contactInfo = await storeOperatorContactInfo(ticket._id, busId);
                    if (contactInfo.success) {
                        operatorPrimaryContact = contactInfo.primaryContactNumber;
                        operatorSecondaryContact = contactInfo.secondaryContactNumber;
                        console.log('Successfully retrieved and stored contact info from bus:', {
                            operatorPrimaryContact,
                            operatorSecondaryContact
                        });
                    } else {
                        console.log('Failed to get contact information:', contactInfo);
                    }
                } catch (error) {
                    console.error('Error fetching bus contact information:', error);
                }
            }

            // Create booking details for the email template
            const bookingDetails = {
                passengerName: ticket.passengerInfo.name,
                bookingId: ticket.bookingId,
                busName: ticket.ticketInfo.busName,
                busNumber: ticket.ticketInfo.busNumber,
                fromLocation: ticket.ticketInfo.fromLocation,
                toLocation: ticket.ticketInfo.toLocation,
                journeyDate: ticket.ticketInfo.date,
                departureTime: ticket.ticketInfo.departureTime,
                arrivalTime: ticket.ticketInfo.arrivalTime,
                selectedSeats: ticket.ticketInfo.selectedSeats,
                pickupPoint: ticket.ticketInfo.pickupPoint,
                dropPoint: ticket.ticketInfo.dropPoint,
                totalPrice: ticket.price,
                operatorPrimaryContact: operatorPrimaryContact,
                operatorSecondaryContact: operatorSecondaryContact
            };

            console.log('Booking details for email:', {
                busName: bookingDetails.busName,
                operatorPrimaryContact: bookingDetails.operatorPrimaryContact,
                operatorSecondaryContact: bookingDetails.operatorSecondaryContact
            });

            // Generate HTML content for the email
            const htmlContent = BOOKING_CONFIRMATION_TEMPLATE(bookingDetails);

            // Track which emails were successfully sent
            const sentEmails = [];

            // Send to operator
            if (operator && operator.email) {
                console.log(`Attempting to send email to operator: ${operator.email}`);

                // Create operator-specific HTML content with additional information
                const operatorHtmlContent = `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                    <div style="background-color: #1a73e8; color: white; padding: 15px; text-align: center; border-radius: 5px 5px 0 0;">
                        <h1>New Booking Notification</h1>
                    </div>
                    <div style="background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px;">
                        <p>Dear Operator,</p>
                        
                        <p>You have received a <strong>new booking</strong> for your bus service. The booking details are as follows:</p>
                        
                        <div style="background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p><strong>Booking ID:</strong> ${ticket.bookingId}</p>
                            <p><strong>Bus:</strong> ${ticket.ticketInfo.busName} (${ticket.ticketInfo.busNumber})</p>
                            <p><strong>From:</strong> ${ticket.ticketInfo.fromLocation}</p>
                            <p><strong>To:</strong> ${ticket.ticketInfo.toLocation}</p>
                            <p><strong>Date:</strong> ${ticket.ticketInfo.date}</p>
                            <p><strong>Departure Time:</strong> ${ticket.ticketInfo.departureTime}</p>
                            <p><strong>Seats Booked:</strong> ${ticket.ticketInfo.selectedSeats.join(', ')}</p>
                            <p><strong>Total Amount:</strong> Rs. ${ticket.price}</p>
                            <p><strong>Pickup Point:</strong> ${ticket.ticketInfo.pickupPoint}</p>
                            <p><strong>Drop Point:</strong> ${ticket.ticketInfo.dropPoint}</p>
                        </div>

                        <div style="background-color: #f0f7ff; padding: 10px 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #1a73e8;">
                            <h3 style="margin-top: 0;">Passenger Contact Information</h3>
                            <p><strong>Passenger Name:</strong> ${ticket.passengerInfo.name}</p>
                            <p><strong>Primary Contact:</strong> ${ticket.passengerInfo.phone}</p>
                            ${ticket.passengerInfo.alternatePhone ? `<p><strong>Secondary Contact:</strong> ${ticket.passengerInfo.alternatePhone}</p>` : ''}
                            ${ticket.passengerInfo.email ? `<p><strong>Email:</strong> ${ticket.passengerInfo.email}</p>` : ''}
                            <p><small>Please save this contact information in case you need to reach the passenger.</small></p>
                        </div>

                        <p>Please ensure these seat(s) are marked as reserved in your system.</p>
                        
                        <p>Thank you for your continued partnership with ticket master.</p>
                        
                        <p>Best regards,<br>ticket master Team</p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #666;">
                        <p>This is an automated message from ticket master booking system.</p>
                    </div>
                </div>
                `;

                const operatorMailOptions = {
                    from: process.env.SENDER_EMAIL,
                    to: operator.email,
                    subject: `New Booking Alert - ${ticket.bookingId} (${ticket.ticketInfo.fromLocation} to ${ticket.ticketInfo.toLocation})`,
                    html: operatorHtmlContent
                };

                try {
                    await transporter.sendMail(operatorMailOptions);
                    console.log(`Booking confirmation email sent to operator: ${operator.email}`);
                    sentEmails.push(`operator:${operator.email}`);
                } catch (error) {
                    console.error(`Error sending email to operator ${operator.email}:`, error);
                }
            }

            // Send to user/passenger (handle the same/different email cases properly)
            const userEmail = user?.email;
            const passengerEmail = ticket.passengerInfo?.email;

            // Handle passenger email
            if (passengerEmail) {
                console.log(`Sending email to passenger: ${passengerEmail}`);
                const passengerMailOptions = {
                    from: process.env.SENDER_EMAIL,
                    to: passengerEmail,
                    subject: `Your Booking Confirmation - ${ticket.bookingId}`,
                    html: htmlContent
                };

                try {
                    await transporter.sendMail(passengerMailOptions);
                    console.log(`Booking confirmation email sent to passenger: ${passengerEmail}`);
                    sentEmails.push(`passenger:${passengerEmail}`);
                } catch (error) {
                    console.error(`Error sending email to passenger ${passengerEmail}:`, error);
                }
            }

            // Handle user email only if different from passenger email
            if (userEmail && userEmail !== passengerEmail) {
                console.log(`Sending email to logged-in user: ${userEmail}`);
                const userMailOptions = {
                    from: process.env.SENDER_EMAIL,
                    to: userEmail,
                    subject: `Your Booking Confirmation - ${ticket.bookingId}`,
                    html: htmlContent
                };

                try {
                    await transporter.sendMail(userMailOptions);
                    console.log(`Booking confirmation email sent to user: ${userEmail}`);
                    sentEmails.push(`user:${userEmail}`);
                } catch (error) {
                    console.error(`Error sending email to user ${userEmail}:`, error);
                }
            }

            // Mark the ticket as having had emails sent to prevent duplicate sending
            try {
                // Use findOneAndUpdate with a condition to ensure we only update if emailsSent is not true
                // This is an atomic operation that will prevent race conditions
                const updateResult = await Ticket.findOneAndUpdate(
                    { _id: ticket._id, emailsSent: { $ne: true } },
                    {
                        $set: {
                            emailsSent: true,
                            emailsSentDetail: sentEmails,
                            emailsSentAt: new Date()
                        }
                    },
                    { new: true }
                );

                if (updateResult) {
                    console.log(`Marked ticket ${ticket._id} as having had confirmation emails sent`);
                } else {
                    console.log(`Ticket ${ticket._id} was already marked as having emails sent or not found`);
                }
            } catch (updateError) {
                console.error('Error updating ticket email sent status:', updateError);
            }

            console.log(`Completed email sending process with ID: ${confirmationId}`);

        } finally {
            // Always release the mutex when done, even if there were errors
            emailSendingInProgress.delete(mutexKey);
        }
    } catch (error) {
        console.error('Error sending booking confirmation emails:', error);
        // Don't throw the error - we don't want to fail the payment verification if email fails
    }
};
