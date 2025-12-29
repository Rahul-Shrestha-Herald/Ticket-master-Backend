import mongoose from 'mongoose';

const scheduleSchema = mongoose.Schema({
  operator: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true },
  bus: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
  route: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
  scheduleDates: [{ type: Date, required: true }],
  fromTime: { type: String, required: true },
  toTime: { type: String, required: true },
  pickupTimes: [{ type: String, required: true }],
  dropTimes: [{ type: String, required: true }],
  seats: {
    global: {
      available: { type: [String], default: [] },
      booked: { type: [String], default: [] }
    },
    dates: {
      type: Map,
      of: {
        available: { type: [String], default: [] },
        booked: { type: [String], default: [] }
      },
      default: {}
    }
  },
  permanentlyBookedSeats: {
    type: [{
      date: {
        type: String, // Format: YYYY-MM-DD
        required: true
      },
      seats: {
        type: [String],
        default: []
      }
    }],
    default: []
  }
}, { timestamps: true });

const Schedule = mongoose.model('Schedule', scheduleSchema);
export default Schedule;
