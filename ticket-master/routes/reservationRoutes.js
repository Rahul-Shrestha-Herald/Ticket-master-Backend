import express from 'express';
import { releaseReservation, checkReservationExpiry, confirmReservation } from '../controllers/reservationController.js';

const router = express.Router();

// Route to release a reservation
router.post('/release', releaseReservation);

// Route to check if a reservation has expired
router.get('/check-expiry/:reservationId', checkReservationExpiry);

// Route to confirm a reservation permanently after payment
router.post('/confirm', confirmReservation);

export default router; 