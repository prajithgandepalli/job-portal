import mongoose from "mongoose";
import dns from "node:dns";

// Set public DNS servers (Google & Cloudflare)
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
    // ignore
}

// Function to connect to the MongoDB database
const connectDB = async () => {

    mongoose.connection.on('connected', () => console.log('Database Connected Successfully'));
    mongoose.connection.on('error', (err) => console.error('Database Connection Error:', err.message));

    let uri = process.env.MONGODB_URI || '';
    
    if (uri.includes('?')) {
        const [base, query] = uri.split('?');
        const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
        uri = `${cleanBase}/job-portal?${query}`;
    } else if (uri) {
        const cleanBase = uri.endsWith('/') ? uri.slice(0, -1) : uri;
        uri = `${cleanBase}/job-portal`;
    }

    try {
        console.log('Connecting to Primary MongoDB Cluster...');
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    } catch (error) {
        console.warn('\n------------------------------------------------------------');
        console.warn('⚠️ Primary MongoDB Atlas Cluster unreachable:', error.message);
        console.warn('Reason: The Atlas cluster "job-cluster.o3mu8f8.mongodb.net" is currently paused/deleted or unreachable.');
        console.warn('Attempting fallback connection to local MongoDB (mongodb://127.0.0.1:27017/job-portal)...');
        console.warn('------------------------------------------------------------\n');

        try {
            await mongoose.connect('mongodb://127.0.0.1:27017/job-portal', { serverSelectionTimeoutMS: 3000 });
            console.log('Connected to Local MongoDB (127.0.0.1:27017)');
        } catch (localErr) {
            console.error('Local MongoDB fallback also unavailable. Please resume your cluster on MongoDB Atlas or start local MongoDB.');
        }
    }

}

export default connectDB;