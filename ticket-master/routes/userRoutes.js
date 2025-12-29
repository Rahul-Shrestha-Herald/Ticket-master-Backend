import express from 'express'
import userAuth from '../middleware/userAuth.js';
import { getUserData, getUserBookings, updateUserProfile, deleteUserAccount, changePassword, verifyPassword } from '../controllers/userController.js';

const userRouter = express.Router();

userRouter.get('/data', userAuth, getUserData);
userRouter.get('/bookings', userAuth, getUserBookings);
userRouter.put('/profile', userAuth, updateUserProfile);
userRouter.delete('/account', userAuth, deleteUserAccount);
userRouter.put('/change-password', userAuth, changePassword);
userRouter.post('/verify-password', userAuth, verifyPassword);

export default userRouter;