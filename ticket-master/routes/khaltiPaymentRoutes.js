/**
 * Khalti Payment Gateway Routes
 * New implementation with modern best practices
 */

import express from 'express';
import {
    initiateKhaltiPayment,
    verifyKhaltiPayment,
    getPaymentStatus,
    refundPayment
} from '../controllers/khaltiPaymentController.js';

const router = express.Router();

/**
 * @route   POST /api/khalti/initiate
 * @desc    Initialize Khalti payment session
 * @access  Public (both guest and authenticated users)
 */
router.post('/initiate', initiateKhaltiPayment);

/**
 * @route   POST /api/khalti/verify
 * @desc    Verify Khalti payment after callback
 * @access  Public
 */
router.post('/verify', verifyKhaltiPayment);

/**
 * @route   GET /api/khalti/status/:pidx
 * @desc    Get payment status by transaction ID
 * @access  Public
 */
router.get('/status/:pidx', getPaymentStatus);

/**
 * @route   POST /api/khalti/refund
 * @desc    Initiate payment refund
 * @access  Protected (Admin only - add middleware as needed)
 */
router.post('/refund', refundPayment);

export default router;
