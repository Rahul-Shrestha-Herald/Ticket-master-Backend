import mongoose from 'mongoose';

const busLocationSchema = new mongoose.Schema({
    busId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bus',
        required: true,
        index: true
    },
    operatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Operator',
        required: true
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true
        }
    },
    speed: {
        type: Number, // km/h
        default: 0
    },
    heading: {
        type: Number, // degrees (0-360)
        default: 0
    },
    accuracy: {
        type: Number, // meters
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Create geospatial index for location queries
busLocationSchema.index({ location: '2dsphere' });

// Index for finding active buses
busLocationSchema.index({ isActive: 1, lastUpdated: -1 });

// Method to check if location is stale (older than 5 minutes)
busLocationSchema.methods.isStale = function() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.lastUpdated < fiveMinutesAgo;
};

// Static method to get active bus location
busLocationSchema.statics.getActiveBusLocation = async function(busId) {
    const location = await this.findOne({ 
        busId, 
        isActive: true 
    }).sort({ lastUpdated: -1 });
    
    if (location && !location.isStale()) {
        return location;
    }
    return null;
};

const BusLocation = mongoose.model('BusLocation', busLocationSchema);

export default BusLocation;
