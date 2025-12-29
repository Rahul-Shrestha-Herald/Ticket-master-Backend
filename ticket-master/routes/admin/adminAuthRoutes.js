// routes/admin/adminAuthRoutes.js
import express from 'express';
import { 
  manualAdminRegister, 
  adminLogin, 
  adminLogout, 
  isAdminAuthenticated 
} from '../../controllers/admin/authController.js';
import adminAuth from '../../middleware/admin/adminAuth.js';

const router = express.Router();

// REMOVE adminAuth middleware from manual-register if you want to allow registration without authentication
router.post('/manual-register', manualAdminRegister); // Changed: removed adminAuth middleware
router.post('/login', adminLogin);
router.post('/logout', adminLogout);
router.get('/is-auth', adminAuth, isAdminAuthenticated);

export default router;