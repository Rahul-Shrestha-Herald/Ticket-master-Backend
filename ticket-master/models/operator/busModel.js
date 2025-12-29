import mongoose from 'mongoose';

const busSchema = new mongoose.Schema({
  busName: { type: String, required: true },
  busNumber: { type: String, required: true },
  primaryContactNumber: { type: String, required: true },
  secondaryContactNumber: { type: String },
  busDescription: { type: String },
  documents: {
    bluebook: { type: String },
    roadPermit: { type: String },
    insurance: { type: String },
  },
  reservationPolicies: { type: [String], default: [] },
  amenities: { type: [String], default: [] },
  images: {
    front: { type: String },
    back: { type: String },
    left: { type: String },
    right: { type: String },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator' },
  verified: { type: Boolean, default: false },
}, { timestamps: true });

const Bus = mongoose.model('Bus', busSchema);
export default Bus;
