import Operator from '../../models/operator/operatorModel.js';
import Bus from '../../models/operator/busModel.js';
import BusRoute from '../../models/operator/busRouteModel.js';
import BusSchedule from '../../models/operator/busScheduleModel.js';
import bcrypt from 'bcryptjs';

export const getOperatorData = async (req, res) => {
  try {
    const operator = await Operator.findById(req.operator.id).select('-password');
    if (!operator) {
      return res.status(404).json({ success: false, message: 'Operator not found' });
    }

    res.status(200).json({
      success: true,
      operatorData: {
        name: operator.name,
        email: operator.email,
        panNo: operator.panNo,
        contact: operator.contact,
        permanentAddress: operator.permanentAddress,
        isAccountVerified: operator.isAccountVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

export const updateOperatorProfile = async (req, res) => {
  try {
    const { permanentAddress, contact } = req.body;

    const operator = await Operator.findById(req.operator.id);
    if (!operator) {
      return res.status(404).json({ success: false, message: 'Operator not found' });
    }

    // Update fields if provided
    if (permanentAddress !== undefined) operator.permanentAddress = permanentAddress;
    if (contact !== undefined) operator.contact = contact;

    await operator.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      operatorData: {
        name: operator.name,
        email: operator.email,
        panNo: operator.panNo,
        contact: operator.contact,
        permanentAddress: operator.permanentAddress,
        isAccountVerified: operator.isAccountVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

export const changePassword = async (req, res) => {
  try {
    const operatorId = req.operator.id;

    if (!operatorId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Please log in.'
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Validate inputs
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Find operator
    const operator = await Operator.findById(operatorId);
    if (!operator) {
      return res.status(404).json({
        success: false,
        message: 'Operator not found'
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, operator.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    operator.password = hashedPassword;
    await operator.save();

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};

export const verifyPassword = async (req, res) => {
  try {
    const operatorId = req.operator.id;

    if (!operatorId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Please log in.'
      });
    }

    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    // Find operator
    const operator = await Operator.findById(operatorId);
    if (!operator) {
      return res.status(404).json({
        success: false,
        message: 'Operator not found'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, operator.password);

    return res.status(200).json({
      success: isPasswordValid,
      message: isPasswordValid ? 'Password is correct' : 'Password is incorrect'
    });

  } catch (error) {
    console.error('Error verifying password:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify password',
      error: error.message
    });
  }
};

export const deleteOperatorAccount = async (req, res) => {
  try {
    const operatorId = req.operator.id;

    if (!operatorId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Please log in.'
      });
    }

    // 1. Find all buses owned by this operator
    const buses = await Bus.find({ createdBy: operatorId });
    const busIds = buses.map(bus => bus._id);

    console.log(`Found ${buses.length} buses to delete for operator ${operatorId}`);
    console.log('Bus IDs:', busIds);

    // 2. Delete all schedules for these buses
    if (busIds.length > 0) {
      const schedulesDeleted = await BusSchedule.deleteMany({ bus: { $in: busIds } });
      console.log(`Deleted ${schedulesDeleted.deletedCount} bus schedules`);
    }

    // 3. Delete all routes for these buses
    if (busIds.length > 0) {
      const routesDeleted = await BusRoute.deleteMany({ bus: { $in: busIds } });
      console.log(`Deleted ${routesDeleted.deletedCount} bus routes`);
    }

    // 4. Delete all schedules and routes directly associated with the operator
    const schedulesDeletedByOperator = await BusSchedule.deleteMany({ operator: operatorId });
    console.log(`Deleted ${schedulesDeletedByOperator.deletedCount} additional bus schedules by operator ID`);

    const routesDeletedByOperator = await BusRoute.deleteMany({ operator: operatorId });
    console.log(`Deleted ${routesDeletedByOperator.deletedCount} additional bus routes by operator ID`);

    // 5. Delete all buses
    const busesDeleted = await Bus.deleteMany({ createdBy: operatorId });
    console.log(`Deleted ${busesDeleted.deletedCount} buses`);

    // 6. Delete the operator account
    const deletedOperator = await Operator.findByIdAndDelete(operatorId);

    if (!deletedOperator) {
      return res.status(404).json({
        success: false,
        message: 'Operator not found'
      });
    }

    console.log(`Deleted operator account: ${operatorId}`);

    // Clear session cookies
    res.clearCookie('operator_access_token', {
      httpOnly: true,
      sameSite: 'None',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });

    res.clearCookie('operator_refresh_token', {
      httpOnly: true,
      sameSite: 'None',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    });

    res.clearCookie('operator_token', {
      httpOnly: true,
      path: '/'
    });

    // Clear the operatorToken cookie shown in browser
    res.clearCookie('operatorToken', {
      path: '/'
    });

    return res.status(200).json({
      success: true,
      message: 'Your account has been deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting operator account:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    });
  }
};
