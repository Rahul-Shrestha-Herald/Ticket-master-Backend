import mongoose from 'mongoose';

// Seat schema for individual seats
const seatSchema = new mongoose.Schema({
  seatId: { type: String, required: true }, // Unique identifier like "A1", "B2", etc.
  row: { type: Number, required: true },
  col: { type: Number, required: true },
  label: { type: String, required: true }, // Display label
  x: { type: Number, default: 0 }, // X position for drag-and-drop
  y: { type: Number, default: 0 }, // Y position for drag-and-drop
  status: { 
    type: String, 
    enum: ['available', 'damaged', 'maintenance'], 
    default: 'available' 
  }, // Seat status
  seatType: { 
    type: String, 
    enum: ['regular', 'premium', 'sleeper'], 
    default: 'regular' 
  }
}, { _id: false });

// Seat layout schema
const seatLayoutSchema = new mongoose.Schema({
  rows: { type: Number, default: 10 },
  cols: { type: Number, default: 5 },
  seats: [seatSchema], // Array of seat objects with positions
  aislePositions: { type: [Number], default: [] }, // Column positions for aisles
  layoutType: { 
    type: String, 
    enum: ['standard', 'custom'], 
    default: 'custom' 
  }
}, { _id: false });

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
  // Dynamic seat layout
  seatLayout: { type: seatLayoutSchema },
  // Damaged seats tracking (for quick lookup)
  damagedSeats: { type: [String], default: [] }, // Array of seatIds that are damaged
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator' },
  verified: { type: Boolean, default: false },
}, { timestamps: true });

const Bus = mongoose.model('Bus', busSchema);
export default Bus;
