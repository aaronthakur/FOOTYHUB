const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    size: { type: String, default: null },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    customer: {
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
        city: { type: String, required: true },
        pin: { type: String, required: true }
    },
    payment: {
        method: { type: String, required: true, enum: ['cod', 'upi', 'card'] },
        upi: { type: String, default: null },
        cardLast4: { type: String, default: null }
    },
    items: [orderItemSchema],
    totals: {
        subtotal: { type: Number, required: true },
        discount: { type: Number, default: 0 },
        shipping: { type: Number, default: 0 },
        total: { type: Number, required: true }
    },
    promo: { type: String, default: null },
    status: {
        type: String,
        enum: ['Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', orderSchema);
