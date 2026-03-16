import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAccountVerified: { type: Boolean, default: false },
  profilePicture: { type: String, default: '' },
}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);
export default Admin;
