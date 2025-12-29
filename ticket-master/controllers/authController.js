import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import userModel from '../models/userModel.js';
import transporter from '../config/nodemailer.js'
import { EMAIL_VERIFY_TEMPLATE, PASSWORD_RESET_TEMPLATE } from '../config/emailTemplates.js';
import tempUserModel from '../models/tempUserModel.js';

export const register = async (req, res) => {
    const { name, email, password } = req.body;

    // Check for missing fields
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Missing required fields (name, email, password)' });
    }

    try {
        // Check if the user already exists
        const existingUser = await userModel.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User already exists with this email.' });
        }

        // Check if there's an ongoing verification for this email
        const existingTempUser = await tempUserModel.findOne({ email });
        if (existingTempUser) {
            return res.status(400).json({ success: false, message: 'Verification in progress. Please try again after 15 minutes.' });
        }

        // Hash the password and generate OTP
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = String(Math.floor(100000 + Math.random() * 900000)); // Generate OTP

        // Set OTP expiration time (15 minutes from now)
        const otpExpireAt = Date.now() + 15 * 60 * 1000; // 15 minutes in milliseconds

        // Create a temporary user entry for verification
        const tempUser = new tempUserModel({ name, email, password: hashedPassword, verifyOtp: otp, verifyOtpExpireAt: otpExpireAt });
        await tempUser.save();

        // Send OTP email
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: email,
            subject: 'Verify Your Email - ticket master',
            text: `Your OTP for verifying your ticket master account is ${otp}. It will expire in 15 minutes.`,
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ success: true, message: 'OTP sent to email. Please verify to complete signup.' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error. Please try again later.' });
    }
};

export const verifyEmail = async (req, res) => {
    const { email, otp } = req.body;

    // Check for missing fields
    if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Missing required fields (email, otp)' });
    }

    try {
        // Find the temporary user record
        const tempUser = await tempUserModel.findOne({ email });

        if (!tempUser) {
            return res.status(404).json({ success: false, message: 'No verification request found for this email.' });
        }

        // Check if the OTP is valid
        if (tempUser.verifyOtp !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP.' });
        }

        // Move the temporary user to the main user collection
        const newUser = new userModel({
            name: tempUser.name,
            email: tempUser.email,
            password: tempUser.password,
            isAccountVerified: true
        });

        await newUser.save();
        await tempUserModel.deleteOne({ email }); // Remove temp data

        // Send welcome email
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: email,
            subject: 'Welcome to ticket master!',
            text: `Hello ${tempUser.name},\n\nWelcome to ticket master! 🎉\n\nYour account has been successfully verified. You can now log in and start booking tickets easily.\n\nEnjoy your journey with us!\n\nBest Regards,\nticket master Team`
        };

        await transporter.sendMail(mailOptions);

        // Create JWT token for the new user
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        // Set token in cookie
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(200).json({ success: true, message: 'Email verified successfully. You are now logged in.' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error. Please try again later.' });
    }
};

export const resendOtp = async (req, res) => {
    const { email } = req.body;

    // Check for missing fields
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    try {
        // Find the temporary user record
        const tempUser = await tempUserModel.findOne({ email });

        if (!tempUser) {
            return res.status(404).json({ success: false, message: 'No verification request found for this email.' });
        }

        // Check if the OTP resend interval has passed (30 seconds)
        const currentTime = Date.now();
        const createdAtTime = new Date(tempUser.createdAt).getTime();

        if (currentTime - createdAtTime < 30000) {
            return res.status(400).json({ success: false, message: 'Please wait 30 seconds before requesting a new OTP.' });
        }

        // Generate new OTP
        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

        // Update OTP and reset creation time
        tempUser.verifyOtp = newOtp;
        tempUser.createdAt = new Date(); // Reset the createdAt timestamp
        await tempUser.save();

        // Send OTP email
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: email,
            subject: 'Your OTP Code for Email Verification',
            text: `Your new OTP for email verification is: ${newOtp}`
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ success: true, message: 'OTP resent successfully. Please check your email.' });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Internal server error. Please try again later.' });
    }
};

export const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ success: false, message: "Email and Password are Required" })
    }

    try {

        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({ success: false, message: 'Invaild Email or Password' })
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.json({ success: false, message: "Invaild Email or Password" })
        }

        if (user.isBlocked) {
            return res.json({ 
                success: false, 
                message: "Your account has been blocked. Please contact support." 
            });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({ success: true });

    } catch (error) {
        return res.json({ success: false, message: error.message })
    }
}

export const logout = async (req, res) => {
    try {
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })

        return res.json({ success: true, message: "Logged Out" })

    } catch (error) {
        return res.json({ success: false, message: error.message })
    }
}

// Check if user is Authenticated
export const isAuthenticated = async (req, res) => {
    try {
        return res.json({ success: true});
    } catch (error) {
        return res.json({ success: false, message: error.message });
    }
}

//Reset User Password
export const resetPassword = async (req, res) => {
    const {email, otp, newPassword} = req.body;

    if(!email, !otp, !newPassword){
        return res.json({ success: false, message: "Email, OTP and New Password are Required" });
    }

    try {
        
        const user = await userModel.findOne({email});
        if(!user){
            return res.json({success: false, message: "User not Found"});
        }

        if(user.resetOtp === '' || user.resetOtp !== otp){
            return res.json({ success: false, message: "Invaild OTP" });
        }

        if(user.resetOtpExpireAt < Date.now()){
            return res.json({ success: false, message: "OTP Expired" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        user.password = hashedPassword;
        user.resetOtp = '';
        user.resetOtpExpireAt = 0;

        await user.save();

        return res.json({ success: true, message: "Password has been Reset Successfully" });

    } catch (error) {
        return res.json({ success: false, message: error.message });
    }
}

// Send Reset OTP (Initial Request)
export const sendResetOtp = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.json({ success: false, message: "Email is required" });
    }

    try {
        const user = await userModel.findOne({ email });
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }

        // Check if 30 seconds have passed since the last OTP request
        if (user.resetOtpRequestedAt && Date.now() - user.resetOtpRequestedAt < 30 * 1000) {
            return res.json({ success: false, message: "Please wait 30 seconds before requesting a new OTP" });
        }

        // Generate a new OTP
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        user.resetOtp = otp;
        user.resetOtpExpireAt = Date.now() + 15 * 60 * 1000;
        user.resetOtpRequestedAt = Date.now(); 

        await user.save();

        // Send OTP email
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: 'Password Reset OTP',
            text: `Your OTP for resetting your ticket master account password is ${otp}.`
        };

        await transporter.sendMail(mailOptions);

        return res.json({ success: true, message: "OTP successfully sent to your email" });

    } catch (error) {
        return res.json({ success: false, message: error.message });
    }
};

// Resend OTP (with 30-sec cooldown)
export const resendResetOtp = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.json({ success: false, message: "Email is required" });
    }

    try {
        const user = await userModel.findOne({ email });
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }

        // Check if 30 seconds have passed since the last OTP request
        if (user.resetOtpRequestedAt && Date.now() - user.resetOtpRequestedAt < 30 * 1000) {
            return res.json({ success: false, message: "Please wait 30 seconds before requesting a new OTP" });
        }

        // Generate new OTP
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        user.resetOtp = otp;
        user.resetOtpExpireAt = Date.now() + 15 * 60 * 1000;
        user.resetOtpRequestedAt = Date.now(); 

        await user.save();

        // Send OTP email
        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: user.email,
            subject: 'Resend: Password Reset OTP',
            text: `Your new OTP for resetting your ticket master account password is ${otp}.`
        };

        await transporter.sendMail(mailOptions);

        return res.json({ success: true, message: "New OTP successfully sent to your email" });

    } catch (error) {
        return res.json({ success: false, message: error.message });
    }
};
