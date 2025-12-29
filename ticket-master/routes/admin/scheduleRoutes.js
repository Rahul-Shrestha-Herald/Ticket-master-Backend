// routes/admin/scheduleRoutes.js
import express from 'express';
import { getSchedules, deleteSchedule } from '../../controllers/admin/scheduleController.js';
import adminAuth from '../../middleware/admin/adminAuth.js';

const router = express.Router();

router.get('/', adminAuth, getSchedules);
router.delete('/:id', adminAuth, deleteSchedule);

export default router;
