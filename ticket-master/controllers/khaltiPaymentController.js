/**
 * New Khalti Payment Gateway Integration
 * Using Khalti ePayment API v2
 * Documentation: https://docs.khalti.com/khalti-epayment/
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

// Import models
import Ticket from '../models/ticketModel.js';
import Payment from '../models/paymentModel.js';

// Khalti Configuration
const KHALTI_CONFIG = {
    secretKey: process.env.KHALTI_SECRET_KEY,
    apiUrl: process.env.NODE_ENV === 'production' 
        ? 'https://khalti.com/api/v2' 
        : 'https://a.khalti.com/api/v2',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173'
};

// Validate configuration on startup
if (!KHALTI_CONFIG.secretKey) {
    console.error('⚠️  WARNING: KHALTI_SECRET_KEY is not configured!');
} else {
    console.log('✓ Khalti Payment Gateway initialized');
    console.log(`  Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  API: ${KHALTI_CONFIG.apiUrl}`);
}

/**
 * Initialize Khalti Payment
 * Creates a payment session and returns payment URL
 */
export const initiateKhaltiPayment = async (req, res) => {
    try {
        const {
            amount,
            reservationId,
            passengerInfo,
            ticketInfo,
            pickupPointId,
            dropPointId,
            userId
        } = req.body;

        // Validation
        if (!amount || amount < 10) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount. Minimum amount is Rs. 0.10'
            });
        }

        if (!reservationId) {
            return res.status(400).json({
                success: false,
                message: 'Reservation ID is required'
            });
        }

        if (!passengerInfo?.name || !passengerInfo?.email || !passengerInfo?.phone) {
            return res.status(400).json({
                success: false,
                message: 'Complete passenger information is required'
            });
        }

        if (!ticketInfo?.busId || !ticketInfo?.selectedSeats?.length) {
            return res.status(400).json({
                success: false,
                message: 'Complete ticket information is required'
            });
        }

        // Check for existing ticket with this reservation
        let ticket = await Ticket.findOne({ reservationId });
        let bookingId;
        let purchaseOrderId;

        if (ticket) {
            // Existing ticket found
            bookingId = ticket.bookingId;
            
            // Check for existing pending payment
            const existingPayment = await Payment.findOne({ 
                ticketId: ticket._id,
                status: 'initiated'
            });

            if (existingPayment?.pidx) {
                // Verify if payment is still valid
                try {
                    const verifyResponse = await axios.post(
                        `${KHALTI_CONFIG.apiUrl}/epayment/lookup/`,
                        { pidx: existingPayment.pidx },
                        {
                            headers: {
                                'Authorization': `Key ${KHALTI_CONFIG.secretKey}`,
                                'Content-Type': 'application/json'
                            }
                        }
                    );

                    if (verifyResponse.data.status === 'Pending') {
                        // Return existing payment session
                        return res.status(200).json({
                            success: true,
                            paymentUrl: existingPayment.paymentDetails.payment_url,
                            pidx: existingPayment.pidx,
                            bookingId: bookingId,
                            message: 'Existing payment session found'
                        });
                    }

                    purchaseOrderId = existingPayment.purchase_order_id;
                } catch (error) {
                    console.log('Previous payment expired, creating new session');
                    purchaseOrderId = `BT-${Date.now()}-${uuidv4().substring(0, 8)}`;
                }
            } else {
                purchaseOrderId = `BT-${Date.now()}-${uuidv4().substring(0, 8)}`;
            }
        } else {
            // Create new ticket
            bookingId = `BK-${Date.now().toString().substring(3, 13)}`;
            purchaseOrderId = `BT-${Date.now()}-${uuidv4().substring(0, 8)}`;

            ticket = new Ticket({
                busId: ticketInfo.busId,
                userId: userId || null,
                bookingId,
                reservationId,
                passengerInfo: {
                    name: passengerInfo.name,
                    email: passengerInfo.email,
                    phone: passengerInfo.phone,
                    alternatePhone: passengerInfo.alternatePhone || null
                },
                ticketInfo: {
                    busId: ticketInfo.busId,
                    busName: ticketInfo.busName,
                    busNumber: ticketInfo.busNumber,
                    fromLocation: ticketInfo.fromLocation,
                    toLocation: ticketInfo.toLocation,
                    departureTime: ticketInfo.departureTime,
                    arrivalTime: ticketInfo.arrivalTime,
                    date: ticketInfo.date,
                    selectedSeats: ticketInfo.selectedSeats,
                    pickupPoint: ticketInfo.pickupPoint,
                    dropPoint: ticketInfo.dropPoint
                },
                price: amount,
                pickupPointId,
                dropPointId,
                status: 'pending',
                paymentStatus: 'pending'
            });

            await ticket.save();
            console.log(`✓ New ticket created: ${ticket._id}`);
        }

        // Convert amount to paisa (Khalti uses paisa)
        const amountInPaisa = Math.round(amount * 100);

        // Prepare Khalti payment payload
        const khaltiPayload = {
            return_url: `${KHALTI_CONFIG.clientUrl}/bus-tickets/payment-callback`,
            website_url: KHALTI_CONFIG.clientUrl,
            amount: amountInPaisa,
            purchase_order_id: purchaseOrderId,
            purchase_order_name: `Bus Ticket: ${ticketInfo.fromLocation} to ${ticketInfo.toLocation}`,
            customer_info: {
                name: passengerInfo.name,
                email: passengerInfo.email,
                phone: passengerInfo.phone
            },
            amount_breakdown: [
                {
                    label: "Ticket Fare",
                    amount: amountInPaisa
                }
            ],
            product_details: ticketInfo.selectedSeats.map((seat, index) => ({
                identity: `SEAT-${seat}`,
                name: `Seat ${seat}`,
                total_price: Math.round(amountInPaisa / ticketInfo.selectedSeats.length),
                quantity: 1,
                unit_price: Math.round(amountInPaisa / ticketInfo.selectedSeats.length)
            }))
        };

        console.log('→ Initiating Khalti payment...');

        // Call Khalti API
        const khaltiResponse = await axios.post(
            `${KHALTI_CONFIG.apiUrl}/epayment/initiate/`,
            khaltiPayload,
            {
                headers: {
                    'Authorization': `Key ${KHALTI_CONFIG.secretKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000 // 15 second timeout
            }
        );

        console.log('✓ Khalti payment session created');
        console.log(`  PIDX: ${khaltiResponse.data.pidx}`);

        // Save payment record
        const payment = new Payment({
            ticketId: ticket._id,
            amount: amount,
            status: 'initiated',
            pidx: khaltiResponse.data.pidx,
            purchase_order_id: purchaseOrderId,
            paymentMethod: 'khalti',
            paymentDetails: khaltiResponse.data
        });

        await payment.save();

        // Update ticket
        ticket.paymentStatus = 'pending';
        await ticket.save();

        // Return success response
        return res.status(200).json({
            success: true,
            paymentUrl: khaltiResponse.data.payment_url,
            pidx: khaltiResponse.data.pidx,
            bookingId: bookingId,
            message: 'Payment session created successfully'
        });

    } catch (error) {
        console.error('✗ Khalti payment initiation failed:', error.message);

        // Handle Khalti API errors
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            console.error(`  Status: ${status}`);
            console.error(`  Error:`, data);

            if (status === 401) {
                return res.status(500).json({
                    success: false,
                    message: 'Payment gateway authentication failed',
                    error: 'Invalid API credentials'
                });
            }

            if (status === 400) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid payment request',
                    error: data.detail || data.message || 'Bad request'
                });
            }

            return res.status(status).json({
                success: false,
                message: 'Payment gateway error',
                error: data.detail || data.message || 'Unknown error'
            });
        }

        // Network or other errors
        return res.status(500).json({
            success: false,
            message: 'Payment service unavailable',
            error: error.message
        });
    }
};

/**
 * Verify Khalti Payment
 * Called after user completes payment on Khalti
 */
export const verifyKhaltiPayment = async (req, res) => {
    try {
        const { pidx, status, purchase_order_id, reservationId } = req.body;

        if (!pidx) {
            return res.status(400).json({
                success: false,
                message: 'Transaction ID (pidx) is required'
            });
        }

        console.log(`→ Verifying payment: ${pidx}`);

        // Find payment record
        const payment = await Payment.findOne({ pidx });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment record not found'
            });
        }

        // Check if already processed
        if (payment.status === 'completed') {
            console.log('  Payment already processed');
            
            const ticket = await Ticket.findById(payment.ticketId);
            
            return res.status(200).json({
                success: true,
                message: 'Payment already verified',
                ticketId: ticket._id,
                bookingId: ticket.bookingId,
                alreadyProcessed: true
            });
        }

        // Verify with Khalti
        const verifyResponse = await axios.post(
            `${KHALTI_CONFIG.apiUrl}/epayment/lookup/`,
            { pidx },
            {
                headers: {
                    'Authorization': `Key ${KHALTI_CONFIG.secretKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const khaltiStatus = verifyResponse.data.status;
        console.log(`  Khalti Status: ${khaltiStatus}`);

        // Find ticket
        const ticket = await Ticket.findById(payment.ticketId);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Handle payment status
        if (khaltiStatus === 'Completed') {
            // Payment successful
            payment.status = 'completed';
            payment.paymentStatus = 'completed';
            payment.transactionId = verifyResponse.data.transaction_id;
            payment.paidAt = new Date();
            payment.paymentDetails = { ...payment.paymentDetails, ...verifyResponse.data };

            ticket.status = 'confirmed';
            ticket.paymentStatus = 'paid';

            await payment.save();
            await ticket.save();

            console.log('✓ Payment verified successfully');

            // TODO: Update seat status, send confirmation email, etc.

            return res.status(200).json({
                success: true,
                message: 'Payment verified successfully',
                ticketId: ticket._id,
                bookingId: ticket.bookingId,
                transactionId: verifyResponse.data.transaction_id
            });

        } else if (khaltiStatus === 'Pending') {
            // Payment still pending
            return res.status(200).json({
                success: false,
                message: 'Payment is still pending',
                status: 'pending'
            });

        } else {
            // Payment failed/expired/canceled
            payment.status = 'failed';
            payment.paymentStatus = 'failed';
            payment.paymentDetails = { ...payment.paymentDetails, ...verifyResponse.data };

            ticket.status = 'canceled';
            ticket.paymentStatus = 'failed';

            await payment.save();
            await ticket.save();

            console.log('✗ Payment failed or canceled');

            return res.status(200).json({
                success: false,
                message: `Payment ${khaltiStatus.toLowerCase()}`,
                bookingId: ticket.bookingId
            });
        }

    } catch (error) {
        console.error('✗ Payment verification failed:', error.message);

        if (error.response) {
            console.error(`  Status: ${error.response.status}`);
            console.error(`  Error:`, error.response.data);
        }

        return res.status(500).json({
            success: false,
            message: 'Payment verification failed',
            error: error.message
        });
    }
};

/**
 * Get Payment Status
 * Check current status of a payment
 */
export const getPaymentStatus = async (req, res) => {
    try {
        const { pidx } = req.params;

        const payment = await Payment.findOne({ pidx }).populate('ticketId');

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        return res.status(200).json({
            success: true,
            payment: {
                pidx: payment.pidx,
                status: payment.status,
                amount: payment.amount,
                bookingId: payment.ticketId?.bookingId,
                createdAt: payment.createdAt
            }
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch payment status',
            error: error.message
        });
    }
};

/**
 * Refund Payment (if needed)
 * Initiate refund for a completed payment
 */
export const refundPayment = async (req, res) => {
    try {
        const { pidx, amount, reason } = req.body;

        if (!pidx) {
            return res.status(400).json({
                success: false,
                message: 'Transaction ID is required'
            });
        }

        // Note: Khalti refund API endpoint may vary
        // Check Khalti documentation for refund implementation
        
        return res.status(501).json({
            success: false,
            message: 'Refund feature not implemented yet'
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Refund failed',
            error: error.message
        });
    }
};

export default {
    initiateKhaltiPayment,
    verifyKhaltiPayment,
    getPaymentStatus,
    refundPayment
};
