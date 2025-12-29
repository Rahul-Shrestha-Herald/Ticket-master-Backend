import express from 'express';
import { getRoutes, deleteRoute } from '../../controllers/admin/busRouteController.js';
import adminAuth from '../../middleware/admin/adminAuth.js';

const router = express.Router();

router.get('/', adminAuth, getRoutes);
router.delete('/:id', adminAuth, deleteRoute);

export default router;
