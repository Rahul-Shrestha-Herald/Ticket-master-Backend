import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // Additional user profile fields
    dateOfBirth: { type: Date },
    permanentAddress: { type: String },
    temporaryAddress: { type: String },
    contactNumber: { type: String },

    isAccountVerified: { type: Boolean, default: false },
    resetOtp: { type: String, default: '' },
    resetOtpExpireAt: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false },
});

const userModel = mongoose.models.User || mongoose.model('User', userSchema);

export default userModel;
