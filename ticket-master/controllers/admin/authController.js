import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Admin from '../../models/admin/adminModel.js';

// Manual Admin Registration (For Developers/Admins Only)
export const manualAdminRegister = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
          return res.status(400).json({ success: false, message: 'Admin already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newAdmin = new Admin({
          name,
          email,
          password: hashedPassword,
          isAccountVerified: true,
      });

      await newAdmin.save();
      res.status(201).json({ success: true, message: 'Admin registered successfully.' });
  } catch (error) {
      res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

// Admin Login
export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password.' });
  }

  try {
      const admin = await Admin.findOne({ email });
      if (!admin) {
          return res.status(404).json({ success: false, message: 'Admin not found' });
      }

      const isPasswordMatch = await bcrypt.compare(password, admin.password);
      if (!isPasswordMatch) {
          return res.status(400).json({ success: false, message: 'Invalid password' });
      }

      const token = jwt.sign(
          { id: admin._id, email: admin.email },
          process.env.JWT_SECRET,
          { expiresIn: '1d' }
      );

      res.cookie('adminToken', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'Strict',
      });

      res.status(200).json({ success: true, message: 'Admin logged in successfully.' });
  } catch (error) {
      res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

// Admin Logout
export const adminLogout = (req, res) => {
  res.clearCookie('adminToken');
  res.status(200).json({ success: true, message: 'Admin logged out successfully.' });
};

// Check if Admin is Authenticated
export const isAdminAuthenticated = (req, res) => {
  if (req.admin) {
      return res.status(200).json({ success: true, message: 'Admin is authenticated' });
  }
  return res.status(401).json({ success: false, message: 'Admin not authenticated' });
};
