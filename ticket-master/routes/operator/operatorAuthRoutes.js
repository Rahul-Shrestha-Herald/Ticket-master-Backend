import express from 'express';
import multer from 'multer';
import { operatorRegister, operatorLogin, operatorLogout, operatorResendResetOtp, operatorSendResetOtp, operatorResetPassword, isOperatorAuthenticated } from '../../controllers/operator/authController.js';
import operatorAuth from '../../middleware/operator/operatorAuth.js';

const router = express.Router();

router.post('/signup', operatorRegister);
router.post('/login', operatorLogin);
router.post('/logout', operatorLogout);
router.get('/is-auth', operatorAuth, isOperatorAuthenticated);
router.post('/send-reset-otp', operatorSendResetOtp);
router.post('/resend-reset-otp', operatorResendResetOtp);
router.post('/reset-password', operatorResetPassword);

export default router;
