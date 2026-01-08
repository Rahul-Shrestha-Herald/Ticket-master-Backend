import express from 'express';
import adminAuth from '../../middleware/admin/adminAuth.js';
import { getAdminData, getUsers, getOperators, updateUserBlocked, updateOperatorStatus, getKYCSubmissions, getKYCDetails, approveKYC, rejectKYC } from '../../controllers/admin/adminController.js';
import { getBuses, updateBusStatus, deleteBus } from '../../controllers/admin/busController.js';

const router = express.Router();

router.get('/data', adminAuth, getAdminData);
router.get('/users', adminAuth, getUsers);
router.get('/operators', adminAuth, getOperators);
router.put('/users/:id/blocked', adminAuth, updateUserBlocked);
router.put('/operators/:id/status', adminAuth, updateOperatorStatus);
router.get('/buses', adminAuth, getBuses);
router.put('/buses/:id/status', adminAuth, updateBusStatus);
router.delete('/buses/:id', adminAuth, deleteBus);

// KYC Routes
router.get('/kyc', adminAuth, getKYCSubmissions);
router.get('/kyc/:id', adminAuth, getKYCDetails);
router.post('/kyc/:id/approve', adminAuth, approveKYC);
router.post('/kyc/:id/reject', adminAuth, rejectKYC);

export default router;
