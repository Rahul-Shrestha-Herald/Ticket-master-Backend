import express from 'express';
import { createSupportRequest, getAllSupportRequests, getSupportRequest, updateSupportRequestStatus } from '../controllers/supportController.js';
import adminAuth from '../middleware/admin/adminAuth.js';

const router = express.Router();

// Public route - Anyone can submit a support request
router.post('/', createSupportRequest);

// Protected admin routes
router.use('/admin', adminAuth);
router.get('/admin', getAllSupportRequests);
router.get('/admin/:id', getSupportRequest);
router.patch('/admin/:id', updateSupportRequestStatus);

export default router;