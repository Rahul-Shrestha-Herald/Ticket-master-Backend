import userModel from "../models/userModel.js";
import mongoose from "mongoose";
import bcrypt from 'bcryptjs';

export const getUserData = async (req, res) => {
    try {
        // Use req.userId which is set by the userAuth middleware
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized. Please log in.'
            });
        }

        const user = await userModel.findById(userId);

        if (!user) {
            return res.json({ success: false, message: 'User not Found' });
        }

        res.json({
            success: true,
            userData: {
                name: user.name,
                email: user.email,
                dateOfBirth: user.dateOfBirth,
                permanentAddress: user.permanentAddress,
                temporaryAddress: user.temporaryAddress,
                contactNumber: user.contactNumber,
                isAccountVerified: user.isAccountVerified
            }
        });

    } catch (error) {
        return res.json({ success: false, message: error.message });
    }
}

// Update user profile
export const updateUserProfile = async (req, res) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized. Please log in.'
            });
        }

        const { dateOfBirth, permanentAddress, temporaryAddress, contactNumber } = req.body;

        // Prepare update object with only provided fields
        const updateData = {};
        if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
        if (permanentAddress !== undefined) updateData.permanentAddress = permanentAddress;
        if (temporaryAddress !== undefined) updateData.temporaryAddress = temporaryAddress;
        if (contactNumber !== undefined) updateData.contactNumber = contactNumber;

        // Find and update user
        const updatedUser = await userModel.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            userData: {
                name: updatedUser.name,
                email: updatedUser.email,
                dateOfBirth: updatedUser.dateOfBirth,
                permanentAddress: updatedUser.permanentAddress,
                temporaryAddress: updatedUser.temporaryAddress,
                contactNumber: updatedUser.contactNumber,
                isAccountVerified: updatedUser.isAccountVerified
            }
        });

    } catch (error) {
        console.error('Error updating user profile:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
};

// Get user's bookings
export const getUserBookings = async (req, res) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized. Please log in.'
            });
        }

        // Import Ticket model
        const Ticket = mongoose.model('Ticket');

        // Find all tickets associated with this user
        const bookings = await Ticket.find({ userId })
            .sort({ createdAt: -1 }) // Most recent first
            .lean(); // Convert to plain JavaScript objects

        // Process bookings to ensure consistent data format
        const processedBookings = bookings.map(booking => {
            // Handle nested data structures and provide defaults
            const fromLocation =
                (booking.ticketInfo && booking.ticketInfo.fromLocation) ?
                    booking.ticketInfo.fromLocation : 'Unknown';

            const toLocation =
                (booking.ticketInfo && booking.ticketInfo.toLocation) ?
                    booking.ticketInfo.toLocation : 'Unknown';

            return {
                ...booking,
                // Add top-level duplicates of nested properties for easier access in frontend
                fromLocation,
                toLocation,
                journeyDate: (booking.ticketInfo && booking.ticketInfo.date) ? booking.ticketInfo.date : null,
                selectedSeats: (booking.ticketInfo && booking.ticketInfo.selectedSeats) ? booking.ticketInfo.selectedSeats : [],
                totalPrice: booking.price || 0,
                // Ensure status exists even if not set in database
                status: booking.status || 'pending'
            };
        });

        return res.status(200).json({
            success: true,
            bookings: processedBookings
        });
    } catch (error) {
        console.error('Error fetching user bookings:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch bookings',
            error: error.message
        });
    }
};

// Delete user account
export const deleteUserAccount = async (req, res) => {
    try {
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized. Please log in.'
            });
        }

        try {
            // 1. Find user's tickets to get their IDs
            const Ticket = mongoose.model('Ticket');
            const userTickets = await Ticket.find({ userId });
            const ticketIds = userTickets.map(ticket => ticket._id);

            // 2. Delete payment records using ticket IDs
            if (ticketIds.length > 0) {
                const Payment = mongoose.model('Payment');
                await Payment.deleteMany({ ticketId: { $in: ticketIds } });
            }

            // 3. Delete user's tickets
            await Ticket.deleteMany({ userId });

            // 4. Delete user account
            const deletedUser = await userModel.findByIdAndDelete(userId);

            if (!deletedUser) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Clear session cookies with same options that were likely used when setting them
            res.clearCookie('access_token', {
                httpOnly: true,
                sameSite: 'None',
                secure: process.env.NODE_ENV === 'production',
                path: '/'
            });
            res.clearCookie('refresh_token', {
                httpOnly: true,
                sameSite: 'None',
                secure: process.env.NODE_ENV === 'production',
                path: '/'
            });
            // Clear regular token cookie
            res.clearCookie('token', {
                httpOnly: true,
                path: '/'
            });

            return res.status(200).json({
                success: true,
                message: 'Your account has been deleted successfully'
            });

        } catch (error) {
            throw error;
        }

    } catch (error) {
        console.error('Error deleting user account:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete account',
            error: error.message
        });
    }
};

// Change password
export const changePassword = async (req, res) => {
    try {
        const userId = req.userId;

        if (!userId) {
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

        // Find user
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
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
        user.password = hashedPassword;
        await user.save();

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

// Verify password
export const verifyPassword = async (req, res) => {
    try {
        const userId = req.userId;

        if (!userId) {
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

        // Find user
        const user = await userModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);

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