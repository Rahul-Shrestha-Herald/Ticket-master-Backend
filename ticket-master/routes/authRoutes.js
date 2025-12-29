import express from 'express'
import { isAuthenticated, login, logout, register, resetPassword, sendResetOtp, verifyEmail, resendOtp, resendResetOtp } from '../controllers/authController.js';
import userAuth from '../middleware/userAuth.js';

const authRouter = express.Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/logout', logout);
authRouter.post('/verify-account', verifyEmail);
authRouter.get('/is-auth', userAuth, isAuthenticated);
authRouter.post('/send-reset-otp', sendResetOtp);
authRouter.post('/resend-reset-otp', resendResetOtp);
authRouter.post('/reset-password', resetPassword);
authRouter.post('/resend-otp', resendOtp);

export default authRouter