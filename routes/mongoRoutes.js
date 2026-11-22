const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');

const router = express.Router();

/* Default initial products seed data */
const SEED_PRODUCTS = [
    { name: 'Real Madrid Home Jersey', cat: 'jerseys', tag: 'real-madrid', price: 2499, mrp: 2999, rating: 5, reviews: 124, featured: true, inStock: true, img: 'https://assets.adidas.com/images/w_1880,f_auto,q_auto/78b62417f1e042aeb25e3353d278de3b_9366/IX8095_HM1.jpg', description: 'Official-spec kit in breathable, moisture-wicking fabric.' },
    { name: 'FC Barcelona Home Jersey', cat: 'jerseys', tag: 'barcelona', price: 2299, mrp: 2999, rating: 5, reviews: 98, featured: true, inStock: true, img: 'https://static.nike.com/a/images/t_PDP_1280_v1/f_auto,q_auto:eco/a86b647d-09b1-407b-859b-3ea00c34f2ee/fc-barcelona-2023-24-stadium-home-mens-dri-fit-soccer-jersey-bX1HWL.png', description: 'Blaugrana colours in authentic stadium spec.' },
    { name: 'Manchester City Jersey', cat: 'jerseys', tag: 'man-city', price: 2599, mrp: 3099, rating: 4, reviews: 61, featured: true, inStock: true, img: 'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=900&q=80', description: 'Sky blue home jersey for true Cityzens.' },
    { name: 'Liverpool Home Jersey', cat: 'jerseys', tag: 'liverpool', price: 2399, mrp: 2899, rating: 5, reviews: 84, featured: false, inStock: true, img: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=900&q=80', description: 'Classic Anfield red home kit.' },
    { name: 'Adidas Football Boots', cat: 'boots', tag: 'fg', price: 4999, mrp: 6299, rating: 5, reviews: 76, featured: true, inStock: true, img: 'https://assets.adidas.com/images/w_1880,f_auto,q_auto/1b9f186318804b37bc689379f2a7b096_9366/IE1805_HM1.jpg', description: 'Engineered for firm ground traction and precision control.' },
    { name: 'Pro Training Boots', cat: 'boots', tag: 'tf', price: 3899, mrp: 4799, rating: 4, reviews: 52, featured: true, inStock: true, img: 'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?auto=format&fit=crop&w=900&q=80', description: 'Turf surface studded sole with high abrasion resistance.' },
    { name: 'Official Match Football', cat: 'accessories', tag: 'ball', price: 1499, mrp: 1999, rating: 5, reviews: 210, featured: true, inStock: true, img: 'https://images.unsplash.com/photo-1486286701208-1d58e9338013?auto=format&fit=crop&w=900&q=80', description: 'FIFA certified thermally bonded match ball.' },
    { name: 'Football Training Kit', cat: 'accessories', tag: 'kit', price: 1999, mrp: 2799, rating: 4, reviews: 44, featured: true, inStock: true, img: 'https://images.unsplash.com/photo-1593085512500-5d55148d6f0d?auto=format&fit=crop&w=900&q=80', description: 'Includes speed cones, ladder, and captain band.' }
];

/* In-memory fallback database for offline / non-mongod testing */
let fallbackProducts = SEED_PRODUCTS.map((p, i) => ({
    _id: `mock_prod_${i + 1}`,
    ...p,
    createdAt: new Date().toISOString()
}));
let fallbackOrders = [];

const isConnected = () => mongoose.connection.readyState === 1;

/* ================= SYSTEM & STATUS ================= */

// GET /api/mongo/status
router.get('/status', (req, res) => {
    const connected = isConnected();
    res.json({
        ok: true,
        connected,
        state: connected ? 'connected' : 'disconnected (using in-memory fallback)',
        host: connected ? mongoose.connection.host : 'localhost (fallback)',
        database: connected ? mongoose.connection.name : 'footyhub (fallback)'
    });
});

// POST /api/mongo/seed (Seeds database with initial products)
router.post('/seed', async (req, res) => {
    try {
        if (isConnected()) {
            await Product.deleteMany({});
            const docs = await Product.insertMany(SEED_PRODUCTS);
            return res.json({ ok: true, message: 'Database seeded with products!', count: docs.length, data: docs });
        }
        fallbackProducts = SEED_PRODUCTS.map((p, i) => ({
            _id: `mock_prod_${Date.now()}_${i}`,
            ...p,
            createdAt: new Date().toISOString()
        }));
        res.json({ ok: true, message: 'Fallback store seeded with products!', count: fallbackProducts.length, data: fallbackProducts });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/* ================= PRODUCT CRUD OPERATIONS ================= */

// CREATE: POST /api/mongo/products
router.post('/products', async (req, res) => {
    try {
        const { name, cat, tag, price, mrp, rating, reviews, img, featured, inStock, description } = req.body;
        if (!name || !cat || price === undefined || mrp === undefined) {
            return res.status(400).json({ ok: false, error: 'Name, Category, Price, and MRP are required.' });
        }

        if (isConnected()) {
            const product = new Product({
                name, cat, tag, price: Number(price), mrp: Number(mrp),
                rating: Number(rating) || 5, reviews: Number(reviews) || 0,
                img: img || '', featured: !!featured, inStock: inStock !== false,
                description: description || ''
            });
            await product.save();
            return res.status(201).json({ ok: true, message: 'Product created successfully in MongoDB!', data: product });
        }

        const newProd = {
            _id: `mock_prod_${Date.now()}`,
            name, cat, tag, price: Number(price), mrp: Number(mrp),
            rating: Number(rating) || 5, reviews: Number(reviews) || 0,
            img: img || '', featured: !!featured, inStock: inStock !== false,
            description: description || '',
            createdAt: new Date().toISOString()
        };
        fallbackProducts.unshift(newProd);
        res.status(201).json({ ok: true, message: 'Product created successfully (in-memory)!', data: newProd });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// READ (ALL): GET /api/mongo/products
router.get('/products', async (req, res) => {
    try {
        const { cat, search, sort } = req.query;

        if (isConnected()) {
            const query = {};
            if (cat && cat !== 'all') query.cat = cat;
            if (search) query.name = { $regex: search, $options: 'i' };

            let q = Product.find(query);
            if (sort === 'price-asc') q = q.sort({ price: 1 });
            else if (sort === 'price-desc') q = q.sort({ price: -1 });
            else q = q.sort({ createdAt: -1 });

            const products = await q.exec();
            return res.json({ ok: true, count: products.length, data: products });
        }

        let list = [...fallbackProducts];
        if (cat && cat !== 'all') list = list.filter(p => p.cat === cat);
        if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
        if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
        else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);

        res.json({ ok: true, count: list.length, data: list, note: 'Serving from in-memory fallback' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// READ (ONE): GET /api/mongo/products/:id
router.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (isConnected()) {
            const product = await Product.findById(id);
            if (!product) return res.status(404).json({ ok: false, error: 'Product not found.' });
            return res.json({ ok: true, data: product });
        }
        const product = fallbackProducts.find(p => p._id === id);
        if (!product) return res.status(404).json({ ok: false, error: 'Product not found.' });
        res.json({ ok: true, data: product });
    } catch (err) {
        res.status(400).json({ ok: false, error: 'Invalid product ID format.' });
    }
});

// UPDATE: PUT /api/mongo/products/:id
router.put('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (isConnected()) {
            const updated = await Product.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
            if (!updated) return res.status(404).json({ ok: false, error: 'Product not found.' });
            return res.json({ ok: true, message: 'Product updated successfully in MongoDB!', data: updated });
        }

        const index = fallbackProducts.findIndex(p => p._id === id);
        if (index === -1) return res.status(404).json({ ok: false, error: 'Product not found.' });
        fallbackProducts[index] = { ...fallbackProducts[index], ...updates };
        res.json({ ok: true, message: 'Product updated successfully (in-memory)!', data: fallbackProducts[index] });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// DELETE: DELETE /api/mongo/products/:id
router.delete('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (isConnected()) {
            const deleted = await Product.findByIdAndDelete(id);
            if (!deleted) return res.status(404).json({ ok: false, error: 'Product not found.' });
            return res.json({ ok: true, message: 'Product deleted from MongoDB!', deletedId: id });
        }

        const index = fallbackProducts.findIndex(p => p._id === id);
        if (index === -1) return res.status(404).json({ ok: false, error: 'Product not found.' });
        fallbackProducts.splice(index, 1);
        res.json({ ok: true, message: 'Product deleted from fallback store!', deletedId: id });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

/* ================= ORDER CRUD OPERATIONS ================= */

// CREATE: POST /api/mongo/orders
router.post('/orders', async (req, res) => {
    try {
        const b = req.body;
        const orderId = 'MDB' + (1000 + Math.floor(Math.random() * 9000));
        const orderData = {
            orderId,
            customer: b.customer,
            payment: b.payment,
            items: b.items,
            totals: b.totals,
            promo: b.promo || null,
            status: 'Pending'
        };

        if (isConnected()) {
            const order = new Order(orderData);
            await order.save();
            return res.status(201).json({ ok: true, message: 'Order saved in MongoDB!', orderId: order.orderId, data: order });
        }

        const newOrder = { _id: `mock_order_${Date.now()}`, ...orderData, createdAt: new Date().toISOString() };
        fallbackOrders.unshift(newOrder);
        res.status(201).json({ ok: true, message: 'Order saved (in-memory)!', orderId: newOrder.orderId, data: newOrder });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// READ (ALL): GET /api/mongo/orders
router.get('/orders', async (req, res) => {
    try {
        if (isConnected()) {
            const orders = await Order.find().sort({ createdAt: -1 });
            return res.json({ ok: true, count: orders.length, data: orders });
        }
        res.json({ ok: true, count: fallbackOrders.length, data: fallbackOrders });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// UPDATE STATUS: PATCH /api/mongo/orders/:id/status
router.patch('/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const validStatuses = ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ ok: false, error: `Status must be one of: ${validStatuses.join(', ')}` });
        }

        if (isConnected()) {
            const updated = await Order.findByIdAndUpdate(id, { status }, { new: true });
            if (!updated) return res.status(404).json({ ok: false, error: 'Order not found.' });
            return res.json({ ok: true, message: 'Order status updated in MongoDB!', data: updated });
        }

        const order = fallbackOrders.find(o => o._id === id || o.orderId === id);
        if (!order) return res.status(404).json({ ok: false, error: 'Order not found.' });
        order.status = status;
        res.json({ ok: true, message: 'Order status updated!', data: order });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

// DELETE: DELETE /api/mongo/orders/:id
router.delete('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (isConnected()) {
            const deleted = await Order.findByIdAndDelete(id);
            if (!deleted) return res.status(404).json({ ok: false, error: 'Order not found.' });
            return res.json({ ok: true, message: 'Order deleted from MongoDB!', deletedId: id });
        }

        const idx = fallbackOrders.findIndex(o => o._id === id || o.orderId === id);
        if (idx === -1) return res.status(404).json({ ok: false, error: 'Order not found.' });
        fallbackOrders.splice(idx, 1);
        res.json({ ok: true, message: 'Order deleted!', deletedId: id });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});

module.exports = router;
