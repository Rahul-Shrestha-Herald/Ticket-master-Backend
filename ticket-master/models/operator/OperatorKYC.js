import mongoose from 'mongoose';

const operatorKYCSchema = new mongoose.Schema({
  operator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Operator',
    required: true,
    unique: true
  },
  // Step 1: PAN Details
  panNumber: { type: String, default: '' },
  panImage: { type: String, default: '' },
  
  // Step 2: Business Details
  businessName: { type: String, default: '' },
  businessAddress: { type: String, default: '' },
  businessRegistrationNumber: { type: String, default: '' },
  businessRegistrationImage: { type: String, default: '' },
  
  // Step 3: ID Proof
  idProofType: { type: String, enum: ['citizenship', 'passport', 'driving-license'], default: 'citizenship' },
  idProofNumber: { type: String, default: '' },
  idProofImage: { type: String, default: '' },
  
  // Step 4: License & Permits
  drivingLicenseNumber: { type: String, default: '' },
  drivingLicenseImage: { type: String, default: '' },
  busPermitNumber: { type: String, default: '' },
  busPermitImage: { type: String, default: '' },
  vehicleRegistrationNumber: { type: String, default: '' },
  vehicleRegistrationImage: { type: String, default: '' },
  
  // Step tracking
  currentStep: { type: Number, default: 1, min: 1, max: 4 },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'submitted', 'approved', 'rejected'],
    default: 'pending'
  },
  
  // Admin review
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  
  submittedAt: { type: Date, default: null }
}, { timestamps: true });

const OperatorKYC = mongoose.model('OperatorKYC', operatorKYCSchema);
export default OperatorKYC;
