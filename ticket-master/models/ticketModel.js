import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        busId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Bus',
            required: true
        },
        bookingId: {
            type: String,
            unique: true,
            required: true
        },
        reservationId: {
            type: String,
            required: false
        },
        passengerInfo: {
            name: String,
            email: String,
            phone: String,
            alternatePhone: String
        },
        ticketInfo: {
            busName: String,
            busNumber: String,
            fromLocation: String,
            toLocation: String,
            departureTime: String,
            arrivalTime: String,
            selectedSeats: [String],
            pickupPoint: String,
            dropPoint: String,
            date: Date
        },
        operatorContact: {
            primaryNumber: String,
            secondaryNumber: String
        },
        pickupPointId: String,
        dropPointId: String,
        price: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'canceled'],
            default: 'pending'
        },
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'refunded'],
            default: 'pending'
        },
        bookingDate: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

// Check if model already exists to avoid OverwriteModelError
const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);

export default Ticket; 