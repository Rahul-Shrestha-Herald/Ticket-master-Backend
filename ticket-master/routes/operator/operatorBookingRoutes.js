import express from 'express';
import { getOperatorBookings, getBookingById } from '../../controllers/operator/operatorBookingController.js';
import operatorAuth from '../../middleware/operator/operatorAuth.js';

const router = express.Router();

// Get all bookings for the operator's buses
router.get('/', operatorAuth, getOperatorBookings);

// Get a specific booking by ID
router.get('/:id', operatorAuth, getBookingById);

export default router; 