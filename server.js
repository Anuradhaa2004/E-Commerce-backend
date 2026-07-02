const path = require('path');
// console.log('--- Server starting now ---');
// console.log('Routes file path:', path.join(__dirname, 'routes', 'productRoutes.js'));
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');

// Routes import karein
const productRoutes = require('./routes/productRoutes');
const authRoutes = require('./routes/authRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const cartRoutes = require('./routes/cartRoutes');
const shipwayRoutes = require('./routes/shipwayRoutes');
const orderRoutes = require('./routes/orderRoutes');
const addressRoutes = require('./routes/addressRoutes');

const app = express();

// Middleware
app.use(compression());
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    maxAge: '30d',
    etag: true,
    lastModified: true
}));

// Routes Integration
app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/shipway', shipwayRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressRoutes);

// --- Yahan Cron Job Import Karein ---
require('./cronJobs');

// Connection logic
const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MONGO_URI is not defined in environment variables');
        }
        await mongoose.connect(mongoUri);
        console.log("MongoDB Connected Successfully!");
    } catch (err) {
        console.error("MongoDB Connection Error:", err.message);
        process.exit(1);
    }
};

connectDB();

app.get('/ping', (req, res) => {
    res.status(200).send('I am alive');
});

app.get('/', (req, res) => res.send('Backend is running successfully!'));
app.listen(process.env.PORT || 5000, () => {
    console.log(`Server is running on port ${process.env.PORT || 5000}`);
});