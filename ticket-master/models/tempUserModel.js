import mongoose from 'mongoose';

const tempUserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    verifyOtp: { type: String, required: true },
    verifyOtpExpireAt: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now, expires: 900 }, // Expires in 15 minutes
});

export default mongoose.model('TempUser', tempUserSchema);