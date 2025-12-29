import Admin from "../../models/admin/adminModel.js";
import User from "../../models/userModel.js";
import Operator from "../../models/operator/operatorModel.js";
import transporter from '../../config/nodemailer.js';

// Get Admin Data
export const getAdminData = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password');

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    res.status(200).json({
      success: true,
      adminData: {
        name: admin.name,
        isAccountVerified: admin.isAccountVerified,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

// Get Users
export const getUsers = async (req, res) => {
  try {
    const { search, status } = req.query;
    const query = buildUserQuery(search, status);
    const users = await User.find(query).select('-password');
    res.json(users);
  } catch (error) {
    handleError(res, error);
  }
};

// Get Operators
export const getOperators = async (req, res) => {
  try {
    const { search, status } = req.query;
    const query = buildOperatorQuery(search, status);
    const operators = await Operator.find(query).select('-password');
    res.json(operators);
  } catch (error) {
    handleError(res, error);
  }
};

// Update User Blocked Status
export const updateUserBlocked = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: req.body.isBlocked },
      { new: true }
    ).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    handleError(res, error);
  }
};

// Update Operator Status & Send Verification Email
export const updateOperatorStatus = async (req, res) => {
  try {
    const operator = await Operator.findById(req.params.id);
    
    if (!operator) {
      return res.status(404).json({
        success: false,
        message: 'Operator not found'
      });
    }

    // Store previous verification status
    const wasVerified = operator.isAccountVerified;
    const newVerificationStatus = req.body.isAccountVerified;

    // Update operator fields
    operator.isAccountVerified = newVerificationStatus ?? operator.isAccountVerified;
    operator.isBlocked = req.body.isBlocked ?? operator.isBlocked;

    // Save updated operator
    const updatedOperator = await operator.save();

    // Send verification email only if newly verified
    if (!wasVerified && updatedOperator.isAccountVerified) {
      const mailOptions = {
        from: process.env.SENDER_EMAIL,
        to: updatedOperator.email,
        subject: 'Account Verification Complete - ticket master',
        text: `Hello ${updatedOperator.name},\n\nWelcome to ticket master, Your operator account has been successfully verified by our administration team. \nYou can now log in to your operator dashboard and start managing your bus services. \n\nHappy managing! 🚌 \nBest regards \nticket master Team`
      };

      transporter.sendMail(mailOptions).catch(error => {
        // Optionally log or handle the error
      });
    }

    res.json({
      success: true,
      operator: updatedOperator.toObject({ virtuals: true })
    });

  } catch (error) {
    handleError(res, error);
  }
};

// Helper: Build User Query
const buildUserQuery = (search, status) => {
  const query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }
  if (status === 'verified') query.isAccountVerified = true;
  if (status === 'unverified') query.isAccountVerified = false;
  return query;
};

// Helper: Build Operator Query
const buildOperatorQuery = (search, status) => {
  const query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { panNo: { $regex: search, $options: 'i' } }
    ];
  }
  if (status === 'verified') query.isAccountVerified = true;
  if (status === 'unverified') query.isAccountVerified = false;
  return query;
};

// Helper: Error Handler
const handleError = (res, error) => {
  res.status(500).json({
    success: false,
    message: 'Server error. Please try again later.'
  });
};
