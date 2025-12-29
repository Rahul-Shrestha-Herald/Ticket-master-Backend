import express from 'express';
import { addRoute, getRoutes, getRouteById, updateRoute, deleteRoute, customizePrice } from '../../controllers/operator/busRouteController.js';
import operatorAuth from '../../middleware/operator/operatorAuth.js';

const router = express.Router();

router.get('/', operatorAuth, getRoutes);
router.get('/:id', operatorAuth, getRouteById);
router.post('/', operatorAuth, addRoute);
router.put('/:id', operatorAuth, updateRoute);
router.delete('/:id', operatorAuth, deleteRoute);
router.put('/customize/:id', operatorAuth, customizePrice);

export default router;
