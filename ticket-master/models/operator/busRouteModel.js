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
    ]
  },
  { timestamps: true }
);

const Route = mongoose.model('Route', routeSchema);
export default Route;
