import express from 'express';
import { addSchedule, getSchedules, getScheduleById, updateSchedule, deleteSchedule } from '../../controllers/operator/busScheduleController.js';
import operatorAuth from '../../middleware/operator/operatorAuth.js';

const router = express.Router();

router.get('/', operatorAuth, getSchedules);
router.get('/:id', operatorAuth, getScheduleById);
router.post('/', operatorAuth, addSchedule);
router.put('/:id', operatorAuth, updateSchedule);
router.delete('/:id', operatorAuth, deleteSchedule);

export default router;
