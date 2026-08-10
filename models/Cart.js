// backend/models/Cart.js
const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    userId: String,
    phoneNumber: String,
    items: Array,
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Cart', cartSchema);