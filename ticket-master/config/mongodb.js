import mongoose from "mongoose";

const connectDB = async () => {
    try {
        // Set mongoose options
        mongoose.set('strictQuery', false);
        
        // Connection event listeners
        mongoose.connection.on('connected', () => {
            console.log("✓ MongoDB connected successfully");
        });

        mongoose.connection.on('error', (err) => {
            console.error("✗ MongoDB connection error:", err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log("MongoDB disconnected");
        });

        // Connect with proper options
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
        });

    } catch (error) {
        console.error("✗ MongoDB connection failed:", error.message);
        console.error("Please check:");
        console.error("1. MongoDB is running (net start MongoDB)");
        console.error("2. MONGODB_URI in .env is correct");
        console.error("3. MongoDB is accessible on port 27017");
        process.exit(1);
    }
};

export default connectDB;
