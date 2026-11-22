/* =========================================================================
   FOOTYHUB - 3rd Evaluation Server (Node.js + Express + MongoDB + External API)
   ========================================================================= */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

const jsonRoutes = require('./routes/jsonRoutes');
const mongoRoutes = require('./routes/mongoRoutes');
const externalRoutes = require('./routes/externalRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/footyhub';

/* ---------- Middleware ---------- */
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

/* ---------- API Routes ---------- */

// 1. External Football APIs (TheSportsDB integration)
app.use('/api/external', externalRoutes);

// 2. MongoDB CRUD APIs (Create, Read, Update, Delete for Products and Orders)
app.use('/api/mongo', mongoRoutes);

// 3. Local JSON APIs (Save & Fetch from data/*.json files)
app.use('/api/json', jsonRoutes);

// 4. Aliases for 2nd Evaluation frontend compatibility (POST /api/contact, /api/orders, /api/newsletter)
app.use('/api', jsonRoutes);

/* ---------- Health / Status Route ---------- */
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        service: 'FOOTYHUB 3rd Evaluation API',
        uptime: process.uptime(),
        mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected (using fallback)',
        timestamp: new Date().toISOString()
    });
});

/* ---------- Fallback for 404 / client-side routing ---------- */
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ ok: false, error: `Endpoint not found: ${req.method} ${req.originalUrl}` });
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

/* ---------- Global Error Handler ---------- */
app.use((err, req, res, next) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ ok: false, error: 'Internal server error', details: err.message });
});

/* ---------- Start Server & Connect to MongoDB ---------- */
app.listen(PORT, () => {
    console.log('----------------------------------------------------');
    console.log(`🚀 FOOTYHUB Express Server listening on http://localhost:${PORT}`);
    console.log('----------------------------------------------------');
    console.log('📋 Evaluation Endpoints available:');
    console.log(` • External APIs:        http://localhost:${PORT}/api/external/standings`);
    console.log(` • Local JSON APIs:      http://localhost:${PORT}/api/json/orders`);
    console.log(` • MongoDB CRUD APIs:    http://localhost:${PORT}/api/mongo/products`);
    console.log('----------------------------------------------------');
});

// Connect to MongoDB asynchronously without blocking server startup
mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .then(async () => {
        console.log(`✅ MongoDB connected successfully: ${mongoose.connection.host}/${mongoose.connection.name}`);
        // Auto-sync any existing local JSON submissions to MongoDB
        try {
            const fs = require('fs');
            const Order = require('./models/Order');
            const Newsletter = require('./models/Newsletter');
            const ordersPath = path.join(__dirname, 'data', 'orders.json');
            if (fs.existsSync(ordersPath)) {
                const orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
                for (const o of orders) {
                    await Order.findOneAndUpdate({ orderId: o.orderId }, o, { upsert: true });
                }
            }
            const newsPath = path.join(__dirname, 'data', 'newsletter.json');
            if (fs.existsSync(newsPath)) {
                const news = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
                for (const n of news) {
                    await Newsletter.findOneAndUpdate({ email: n.email }, { email: n.email, subscribedAt: n.submittedAt }, { upsert: true });
                }
            }
            console.log('🔄 Synced local data with MongoDB Atlas');
        } catch (syncErr) {
            console.warn('⚠️ Sync notice:', syncErr.message);
        }
    })
    .catch((err) => {
        console.warn(`⚠️  MongoDB connection notice: ${err.message}`);
        console.log('ℹ️  Running in graceful fallback mode: MongoDB CRUD APIs will operate seamlessly using in-memory store.');
    });

module.exports = app;
