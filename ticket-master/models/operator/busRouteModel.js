import mongoose from 'mongoose';

const routeSchema = mongoose.Schema(
  {
    operator: { type: mongoose.Schema.Types.ObjectId, ref: 'Operator', required: true },
    bus: { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    price: { type: Number, required: true },
    pickupPoints: [{ type: String }],
    dropPoints: [{ type: String }],
    customPrices: [
      {
        origin: { type: String },
        drop: { type: String },
        price: { type: Number }
      }
    ],
    // Ordered stops with per-segment fare for dynamic fare calculation.
    // fare = cost to travel FROM the previous stop TO this stop.
    // First stop's fare is 0 (it's the boarding origin).
    stopFares: [
      {
        stop: { type: String, required: true },
        fare: { type: Number, default: 0 }
      }
    ],
    // Whether to show the base price on the ticket listing card
    showPrice: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const Route = mongoose.model('Route', routeSchema);
export default Route;
