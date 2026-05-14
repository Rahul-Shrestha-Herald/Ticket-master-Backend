import express from 'express'
import multer from 'multer';
import userAuth from '../middleware/userAuth.js';
import { getUserData, getUserBookings, updateUserProfile, deleteUserAccount, changePassword, verifyPassword, uploadProfilePicture } from '../controllers/userController.js';
import { getTMPoints, validateRedemption } from '../controllers/tmPointsController.js';
import {
    getNotifications, markRead, markAllRead,
    deleteNotification, clearAll
} from '../controllers/notificationController.js';

const userRouter = express.Router();

// Multer config: memory storage, images only, max 2MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    }
});

userRouter.get('/data', userAuth, getUserData);
userRouter.get('/bookings', userAuth, getUserBookings);
userRouter.put('/profile', userAuth, updateUserProfile);
userRouter.post('/profile-picture', userAuth, upload.single('profilePicture'), uploadProfilePicture);
userRouter.delete('/account', userAuth, deleteUserAccount);
userRouter.put('/change-password', userAuth, changePassword);
userRouter.post('/verify-password', userAuth, verifyPassword);

// TM Points routes
userRouter.get('/tm-points', userAuth, getTMPoints);
userRouter.post('/tm-points/validate', userAuth, validateRedemption);

// Notification routes
userRouter.get('/notifications', userAuth, getNotifications);
userRouter.patch('/notifications/read-all', userAuth, markAllRead);
userRouter.delete('/notifications', userAuth, clearAll);
userRouter.patch('/notifications/:id/read', userAuth, markRead);
userRouter.delete('/notifications/:id', userAuth, deleteNotification);

export default userRouter;