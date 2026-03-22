import mongoose from 'mongoose';

const pointsHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['earn', 'redeem'],
        required: true
    },
    points: {
        type: Number,
        required: true,
        min: 0
    },
    description: {
        type: String,
        required: true
    },
    ticketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
        default: null
    },
    bookingId: {
        type: String,
        default: null
    },
    // For earn: amount paid; for redeem: discount given
    relatedAmount: {
        type: Number,
        default: 0
    },
    balanceAfter: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

const PointsHistory = mongoose.models.PointsHistory || mongoose.model('PointsHistory', pointsHistorySchema);
export default PointsHistory;
