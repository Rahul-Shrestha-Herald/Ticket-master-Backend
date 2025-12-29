import express from 'express';
import { verifyBookingForTracking } from '../controllers/bookingController.js';

const router = express.Router();

// Verify a booking for tracking (no auth required since users will use this without authentication)
router.get('/verify', verifyBookingForTracking);

export default router; 