import express from 'express';
import {
    updateBusLocation,
    getBusLocation,
    stopSharingLocation,
    getAllActiveBuses
} from '../controllers/locationController.js';
import operatorAuth from '../middleware/operator/operatorAuth.js';

const router = express.Router();

// Public routes (no auth required)
router.get('/bus/:busId', getBusLocation);
router.get('/active-buses', getAllActiveBuses);

// Operator routes (auth required)
router.post('/update', operatorAuth, updateBusLocation);
router.post('/stop/:busId', operatorAuth, stopSharingLocation);

export default router;
