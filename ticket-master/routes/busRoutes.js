import express from 'express';
import {
    getBusDetails,
    imageProxy,
    getBusSeatData,
    getRoutePoints,
    reserveSeatsTemporarily,
    checkReservationStatus,
    releaseReservedSeats,
    getCustomPrice,
    getAvailableCustomPrices,
    searchBuses
} from '../controllers/busController.js';
import userAuth from '../middleware/userAuth.js';

const router = express.Router();

// GET /api/bus/image-proxy?id=fileId - proxy for Google Drive images
router.get('/image-proxy', imageProxy);

// GET /api/bus/seat-data?busId=123&date=2023-04-01 - get seat data for a bus on a specific date
router.get('/seat-data', userAuth, getBusSeatData);

// GET /api/bus/route-points?busId=123&date=2023-04-01 - get pickup and drop points with times
router.get('/route-points', userAuth, getRoutePoints);

// GET /api/bus/custom-price?busId=123&pickupPointId=pickup1&dropPointId=drop1&date=2023-04-01 
// - get custom price for specific pickup and drop points
router.get('/custom-price', userAuth, getCustomPrice);

// GET /api/bus/available-custom-prices?busId=123&date=2023-04-01 
// - get all available custom prices for a bus route
router.get('/available-custom-prices', userAuth, getAvailableCustomPrices);

// POST /api/bus/reserve-seats - temporarily reserve seats
router.post('/reserve-seats', userAuth, reserveSeatsTemporarily);

// GET /api/bus/reservation/:reservationId - check reservation status
router.get('/reservation/:reservationId', userAuth, checkReservationStatus);

// DELETE /api/bus/reservation/:reservationId - release reserved seats
router.delete('/reservation/:reservationId', userAuth, releaseReservedSeats);

// GET /api/bus/search - search buses
router.get('/search', searchBuses);

// GET /api/bus/details/:busId - fetch bus details without authentication (for invoices)
router.get('/details/:busId', getBusDetails);

// GET /api/bus/:busId - fetch bus details
router.get('/:busId', userAuth, getBusDetails);

export default router;
