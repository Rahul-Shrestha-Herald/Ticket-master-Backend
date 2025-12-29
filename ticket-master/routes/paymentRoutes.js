import express from 'express';
import { initiatePayment, verifyPayment, getInvoice, getTicketById, getTicketByOrderId, getTicketByTransaction, repairPermanentlyBookedSeats } from '../controllers/paymentController.js';
import userAuth from '../middleware/userAuth.js';

const router = express.Router();

// Route to initiate payment
router.post('/initiate', userAuth, initiatePayment);

// Route to verify payment
router.post('/verify', verifyPayment);

// Route to get invoice data by ticket ID
router.get('/invoice/:ticketId', getInvoice);

// Route to get ticket by ID
router.get('/ticket/:ticketId', getTicketById);

// Route to get ticket by order ID
router.get('/ticket-by-order/:orderId', getTicketByOrderId);

// Route to get ticket by transaction ID
router.post('/ticket-by-transaction', getTicketByTransaction);

// Admin route to repair permanently booked seats data
router.post('/repair-permanently-booked-seats', repairPermanentlyBookedSeats);

export default router;