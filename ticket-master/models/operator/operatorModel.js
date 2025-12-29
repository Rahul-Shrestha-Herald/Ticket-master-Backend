import mongoose from 'mongoose';

const operatorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  panNo: { type: String, required: true },
  panImage: { type: String, default: '' },
  contact: { type: String, default: '' },
  permanentAddress: { type: String, default: '' },
  isAccountVerified: { type: Boolean, default: false },
  resetOtp: { type: String, default: '' },
  resetOtpExpireAt: { type: Number, default: 0 },
  isBlocked: { type: Boolean, default: false },
}, { timestamps: true });

const Operator = mongoose.model('Operator', operatorSchema);
export default Operator;