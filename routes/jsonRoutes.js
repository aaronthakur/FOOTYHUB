const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Order = require('../models/Order');
const Contact = require('../models/Contact');
const Newsletter = require('../models/Newsletter');

const router = express.Router();
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory and files exist
fs.mkdirSync(DATA_DIR, { recursive: true });
['contact', 'newsletter', 'orders'].forEach(name => {
    const file = path.join(DATA_DIR, `${name}.json`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
});

/* Helper: string sanitizer */
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Thread-safe atomic file saver queue */
let queue = Promise.resolve();
const saveToJson = (filename, buildRecord) => {
    const run = queue.then(async () => {
        const filePath = path.join(DATA_DIR, `${filename}.json`);
        let list = [];
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            list = JSON.parse(raw);
        } catch (e) {
            if (e.code !== 'ENOENT') throw e;
        }
        if (!Array.isArray(list)) list = [];

        const result = buildRecord(list);
        if (result.record) {
            list.push(result.record);
            await fs.promises.writeFile(`${filePath}.tmp`, JSON.stringify(list, null, 2));
            await fs.promises.rename(`${filePath}.tmp`, filePath);
        }
        return result;
    });
    queue = run.catch(() => {});
    return run;
};

/* Helper: read JSON file */
const readJson = async (filename) => {
    const filePath = path.join(DATA_DIR, `${filename}.json`);
    try {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
};

/* ================= CONTACT APIS ================= */

// GET /api/json/contact (Fetch saved contact queries)
router.get('/contact', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const mongoData = await Contact.find().sort({ submittedAt: -1 });
            if (mongoData.length > 0) {
                return res.json({ ok: true, count: mongoData.length, data: mongoData, source: 'mongodb' });
            }
        }
        const data = await readJson('contact');
        res.json({ ok: true, count: data.length, data, source: 'json' });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Failed to read contact data.' });
    }
});

// POST /api/json/contact (Save contact query)
router.post('/contact', async (req, res) => {
    const b = req.body || {};
    const data = {
        firstName: str(b.firstName, 60),
        lastName: str(b.lastName, 60),
        email: str(b.email, 120),
        topic: str(b.topic, 60),
        message: str(b.message, 2000)
    };

    const errors = {};
    if (data.firstName.length < 2) errors.firstName = 'Enter your first name.';
    if (!data.lastName) errors.lastName = 'Enter your last name.';
    if (!EMAIL_REGEX.test(data.email)) errors.email = 'Enter a valid email.';
    if (!data.topic) errors.topic = 'Choose a topic.';
    if (data.message.length < 10) errors.message = 'Message must be at least 10 characters.';

    if (Object.keys(errors).length) {
        return res.status(400).json({ ok: false, error: 'Please check the form and try again.', errors });
    }

    try {
        // 1. Save to local JSON file
        const result = await saveToJson('contact', list => ({
            record: { id: list.length + 1, submittedAt: new Date().toISOString(), ...data },
            message: 'Thanks! We’ll get back to you within one business day.'
        }));

        // 2. Also save directly to MongoDB if connected
        if (mongoose.connection.readyState === 1) {
            try {
                await Contact.create(data);
                console.log('✅ Contact form saved to MongoDB');
            } catch (mErr) {
                console.warn('⚠️ Could not save contact to MongoDB:', mErr.message);
            }
        }

        res.status(201).json({ ok: true, message: result.message, record: result.record });
    } catch (err) {
        console.error('Save contact error:', err);
        res.status(500).json({ ok: false, error: 'Could not save message.' });
    }
});

/* ================= NEWSLETTER APIS ================= */

// GET /api/json/newsletter (Fetch subscribers)
router.get('/newsletter', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const mongoData = await Newsletter.find().sort({ subscribedAt: -1 });
            if (mongoData.length > 0) {
                return res.json({ ok: true, count: mongoData.length, data: mongoData, source: 'mongodb' });
            }
        }
        const data = await readJson('newsletter');
        res.json({ ok: true, count: data.length, data, source: 'json' });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Failed to read newsletter data.' });
    }
});

// POST /api/json/newsletter (Save subscriber)
router.post('/newsletter', async (req, res) => {
    const email = str(req.body?.email, 120);
    if (!EMAIL_REGEX.test(email)) {
        return res.status(400).json({ ok: false, error: 'Enter a valid email.' });
    }

    try {
        // 1. Save to local JSON file
        const result = await saveToJson('newsletter', list => {
            const exists = list.some(r => r.email.toLowerCase() === email.toLowerCase());
            if (exists) {
                return { message: 'You’re already subscribed. Thanks!' };
            }
            return {
                record: { id: list.length + 1, submittedAt: new Date().toISOString(), email },
                message: 'You’re subscribed. Welcome to the club!'
            };
        });

        // 2. Also save directly to MongoDB if connected
        if (mongoose.connection.readyState === 1) {
            try {
                await Newsletter.findOneAndUpdate(
                    { email: email.toLowerCase() },
                    { email: email.toLowerCase(), subscribedAt: new Date() },
                    { upsert: true }
                );
                console.log('✅ Newsletter subscriber saved to MongoDB:', email);
            } catch (mErr) {
                console.warn('⚠️ Could not save newsletter to MongoDB:', mErr.message);
            }
        }

        res.status(201).json({ ok: true, message: result.message });
    } catch (err) {
        console.error('Save newsletter error:', err);
        res.status(500).json({ ok: false, error: 'Could not save subscription.' });
    }
});

/* ================= ORDERS APIS ================= */

// GET /api/json/orders (Fetch all saved orders)
router.get('/orders', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const mongoOrders = await Order.find().sort({ createdAt: -1 });
            if (mongoOrders.length > 0) {
                return res.json({ ok: true, count: mongoOrders.length, data: mongoOrders, source: 'mongodb' });
            }
        }
        const data = await readJson('orders');
        res.json({ ok: true, count: data.length, data, source: 'json' });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Failed to read orders.' });
    }
});

// POST /api/json/orders (Save order)
router.post('/orders', async (req, res) => {
    const b = req.body || {};
    const c = b.customer || {}, p = b.payment || {}, t = b.totals || {};

    const customer = {
        name: str(c.name, 80),
        email: str(c.email, 120),
        phone: str(c.phone, 10),
        address: str(c.address, 200),
        city: str(c.city, 60),
        pin: str(c.pin, 6)
    };
    const payment = { method: str(p.method, 4) };
    const errors = {};

    if (customer.name.length < 2) errors.name = 'Enter your name.';
    if (!EMAIL_REGEX.test(customer.email)) errors.email = 'Enter a valid email.';
    if (!/^[6-9]\d{9}$/.test(customer.phone)) errors.phone = 'Enter a 10-digit mobile number.';
    if (customer.address.length < 8) errors.address = 'Enter your address.';
    if (customer.city.length < 2) errors.city = 'Enter your city.';
    if (!/^[1-9]\d{5}$/.test(customer.pin)) errors.pin = 'Enter a 6-digit PIN code.';
    if (!['cod', 'upi', 'card'].includes(payment.method)) errors.payment = 'Choose a payment method.';

    if (payment.method === 'upi') {
        payment.upi = str(p.upi, 60);
        if (!/^[A-Za-z0-9.\-_]{2,}@[A-Za-z]{2,}$/.test(payment.upi)) errors.upi = 'Enter a valid UPI ID.';
    }
    if (payment.method === 'card') {
        payment.cardLast4 = str(p.cardLast4, 4);
        if (!/^\d{4}$/.test(payment.cardLast4)) errors.card = 'Invalid card.';
    }

    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 50).map(i => ({
        id: str(i.id, 40),
        name: str(i.name, 100),
        size: i.size ? str(i.size, 10) : null,
        qty: Number(i.qty),
        price: Number(i.price)
    }));

    if (!items.length || items.some(i => !i.id || !(i.qty >= 1 && i.qty <= 10) || !(i.price > 0))) {
        errors.items = 'Your cart is empty or invalid.';
    }

    const totals = {
        subtotal: Number(t.subtotal),
        discount: Number(t.discount),
        shipping: Number(t.shipping),
        total: Number(t.total)
    };

    if (Object.values(totals).some(n => !Number.isFinite(n) || n < 0)) {
        errors.totals = 'Invalid totals.';
    }

    if (Object.keys(errors).length) {
        return res.status(400).json({ ok: false, error: 'Please check the form and try again.', errors });
    }

    try {
        // 1. Save to local JSON file
        const result = await saveToJson('orders', list => {
            const orderId = 'FH' + (1001 + list.length);
            const record = {
                orderId,
                submittedAt: new Date().toISOString(),
                customer,
                payment,
                items,
                totals,
                promo: b.promo ? str(b.promo, 20) : null
            };
            return { record, orderId };
        });

        // 2. Also save directly to MongoDB if connected
        if (mongoose.connection.readyState === 1) {
            try {
                await Order.create({
                    orderId: result.orderId,
                    customer,
                    payment,
                    items,
                    totals,
                    promo: b.promo ? str(b.promo, 20) : null,
                    status: 'Pending'
                });
                console.log(`✅ Order ${result.orderId} saved to MongoDB!`);
            } catch (mErr) {
                console.warn(`⚠️ Could not save order ${result.orderId} to MongoDB:`, mErr.message);
            }
        }

        res.status(201).json({ ok: true, orderId: result.orderId, message: 'Order placed successfully!' });
    } catch (err) {
        console.error('Save order error:', err);
        res.status(500).json({ ok: false, error: 'Could not save your order.' });
    }
});

/* ================= OVERVIEW STATS API ================= */
router.get('/stats', async (req, res) => {
    try {
        const [orders, contact, newsletter] = await Promise.all([
            readJson('orders'),
            readJson('contact'),
            readJson('newsletter')
        ]);
        const totalRevenue = orders.reduce((sum, o) => sum + (o.totals?.total || 0), 0);
        res.json({
            ok: true,
            counts: {
                orders: orders.length,
                messages: contact.length,
                subscribers: newsletter.length,
                revenue: totalRevenue
            }
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: 'Failed to compile stats.' });
    }
});

module.exports = router;
