import Admin from "../../models/admin/adminModel.js";
import User from "../../models/userModel.js";
import Operator from "../../models/operator/operatorModel.js";
import OperatorKYC from "../../models/operator/OperatorKYC.js";
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

// Get All KYC Submissions
export const getKYCSubmissions = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const kycs = await OperatorKYC.find(query)
      .populate('operator', 'name email panNo')
      .populate('reviewedBy', 'name')
      .sort({ submittedAt: -1, createdAt: -1 });
    
    res.json({
      success: true,
      kycs
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Get Single KYC Details
export const getKYCDetails = async (req, res) => {
  try {
    const kyc = await OperatorKYC.findById(req.params.id)
      .populate('operator', 'name email panNo contact permanentAddress')
      .populate('reviewedBy', 'name');
    
    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: 'KYC not found'
      });
    }
    
    res.json({
      success: true,
      kyc
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Approve KYC
export const approveKYC = async (req, res) => {
  try {
    const kyc = await OperatorKYC.findById(req.params.id).populate('operator');
    
    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: 'KYC not found'
      });
    }
    
    // Update KYC status
    kyc.status = 'approved';
    kyc.reviewedBy = req.admin.id;
    kyc.reviewedAt = new Date();
    await kyc.save();
    
    // Update operator verification status
    const operator = await Operator.findById(kyc.operator._id);
    if (operator) {
      operator.isAccountVerified = true;
      operator.isBlocked = false;
      await operator.save();
      
      // Send approval email
      const mailOptions = {
        from: process.env.SENDER_EMAIL,
        to: operator.email,
        subject: 'KYC Verification Approved - ticket master',
        text: `Hello ${operator.name},\n\nYour KYC verification has been approved by our administration team. \nYour operator account is now fully verified and you can access all features. \n\nBest regards,\nticket master Team`
      };
      
      transporter.sendMail(mailOptions).catch(error => {
        console.error('Error sending approval email:', error);
      });
    }
    
    res.json({
      success: true,
      message: 'KYC approved successfully',
      kyc
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Reject KYC
export const rejectKYC = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const kyc = await OperatorKYC.findById(req.params.id).populate('operator');
    
    if (!kyc) {
      return res.status(404).json({
        success: false,
        message: 'KYC not found'
      });
    }
    
    // Update KYC status
    kyc.status = 'rejected';
    kyc.reviewedBy = req.admin.id;
    kyc.reviewedAt = new Date();
    kyc.rejectionReason = rejectionReason || 'KYC verification failed. Please review your documents and resubmit.';
    await kyc.save();
    
    // Update operator status
    const operator = await Operator.findById(kyc.operator._id);
    if (operator) {
      operator.isAccountVerified = false;
      operator.isBlocked = false; // Don't block, just keep unverified
      await operator.save();
      
      // Send rejection email
      const mailOptions = {
        from: process.env.SENDER_EMAIL,
        to: operator.email,
        subject: 'KYC Verification Rejected - ticket master',
        text: `Hello ${operator.name},\n\nYour KYC verification has been rejected. \nReason: ${kyc.rejectionReason}\n\nPlease review your documents and resubmit your KYC for verification. \n\nBest regards,\nticket master Team`
      };
      
      transporter.sendMail(mailOptions).catch(error => {
        console.error('Error sending rejection email:', error);
      });
    }
    
    res.json({
      success: true,
      message: 'KYC rejected successfully',
      kyc
    });
  } catch (error) {
    handleError(res, error);
  }
};

// Helper: Error Handler
const handleError = (res, error) => {
  res.status(500).json({
    success: false,
    message: 'Server error. Please try again later.'
  });
};
