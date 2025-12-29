import express from 'express';
import operatorAuth from '../../middleware/operator/operatorAuth.js';
import { getOperatorData, updateOperatorProfile, changePassword, verifyPassword, deleteOperatorAccount } from '../../controllers/operator/operatorController.js';

const router = express.Router();

router.get('/data', operatorAuth, getOperatorData);
router.put('/profile', operatorAuth, updateOperatorProfile);
router.put('/change-password', operatorAuth, changePassword);
router.post('/verify-password', operatorAuth, verifyPassword);
router.delete('/account', operatorAuth, deleteOperatorAccount);

export default router;
