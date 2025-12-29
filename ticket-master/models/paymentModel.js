import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema({
    ticketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ticket',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        required: true,
        default: 'khalti'
    },
    status: {
        type: String,
        enum: ['initiated', 'completed', 'failed', 'refunded', 'canceled'],
        default: 'initiated'
    },
    transactionId: {
        type: String
    },
    pidx: {
        type: String,
        required: true
    },
    purchase_order_id: {
        type: String,
        required: true
    },
    paymentDetails: {
        type: Object
    },
    paidAt: {
        type: Date
    },
    refundedAt: {
        type: Date
    }
}, { timestamps: true });

export default mongoose.model('Payment', PaymentSchema); 