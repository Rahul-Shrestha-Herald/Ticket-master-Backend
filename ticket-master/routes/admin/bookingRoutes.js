import express from 'express';
import { getAllBookings, getBookingById } from '../../controllers/admin/bookingController.js';
import adminAuth from '../../middleware/admin/adminAuth.js';

const router = express.Router();

// Apply admin authentication middleware to all routes
router.use(adminAuth);

// Get all bookings with optional filtering
router.get('/', getAllBookings);

// Get booking by ID
router.get('/:id', getBookingById);

export default router; 