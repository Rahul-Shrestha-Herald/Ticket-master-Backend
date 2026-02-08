import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

console.log('=== MongoDB Connection Test ===\n');

const testConnection = async () => {
    try {
        console.log('1. Environment Check:');
        console.log(`   MONGODB_URI: ${process.env.MONGODB_URI}`);
        console.log();

        console.log('2. Attempting to connect...');
        
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        console.log('   ✓ Connection successful!');
        console.log(`   Database: ${mongoose.connection.name}`);
        console.log(`   Host: ${mongoose.connection.host}`);
        console.log(`   Port: ${mongoose.connection.port}`);
        console.log();

        console.log('3. Testing database operations...');
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`   ✓ Found ${collections.length} collections`);
        
        if (collections.length > 0) {
            console.log('   Collections:', collections.map(c => c.name).join(', '));
        }
        console.log();

        console.log('✅ MongoDB is working correctly!');
        
        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.log('   ✗ Connection failed!');
        console.log();
        console.error('Error:', error.message);
        console.log();
        
        console.log('Troubleshooting:');
        
        if (error.message.includes('ECONNREFUSED')) {
            console.log('❌ MongoDB is not running or not accessible');
            console.log('   Solutions:');
            console.log('   1. Start MongoDB: net start MongoDB');
            console.log('   2. Or start manually: mongod --dbpath "C:\\data\\db"');
            console.log('   3. Or use MongoDB Compass');
        } else if (error.message.includes('buffering timed out')) {
            console.log('❌ Connection timeout - MongoDB not responding');
            console.log('   Solutions:');
            console.log('   1. Check if MongoDB is running: mongo --version');
            console.log('   2. Try different connection string:');
            console.log('      MONGODB_URI=mongodb://localhost:27017/ticket-master');
            console.log('   3. Check firewall settings');
        } else if (error.message.includes('authentication failed')) {
            console.log('❌ Authentication error');
            console.log('   Solutions:');
            console.log('   1. Check username/password in connection string');
            console.log('   2. Or use connection without auth for local dev');
        } else {
            console.log('❌ Unknown error');
            console.log('   Try:');
            console.log('   1. Restart MongoDB');
            console.log('   2. Check MongoDB logs');
            console.log('   3. Verify connection string format');
        }
        
        process.exit(1);
    }
};

testConnection();
