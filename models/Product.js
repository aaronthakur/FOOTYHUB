const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
        maxlength: [120, 'Product name cannot exceed 120 characters']
    },
    cat: {
        type: String,
        required: [true, 'Category is required'],
        enum: ['jerseys', 'boots', 'accessories']
    },
    tag: {
        type: String,
        trim: true
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price must be positive']
    },
    mrp: {
        type: Number,
        required: [true, 'MRP is required'],
        min: [0, 'MRP must be positive']
    },
    rating: {
        type: Number,
        default: 5,
        min: 1,
        max: 5
    },
    reviews: {
        type: Number,
        default: 0
    },
    img: {
        type: String,
        default: ''
    },
    featured: {
        type: Boolean,
        default: false
    },
    inStock: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Product', productSchema);
