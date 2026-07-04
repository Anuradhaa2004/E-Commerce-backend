const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  _id: { type: String },
  name: { type: String, required: true },
  category: { type: String },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  selectedSize: { type: String },
  selectedColor: { type: String },
  selectedImage: { type: String }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  email: { type: String, required: true },
  items: [orderItemSchema],
  total: { type: Number, required: true },
  status: { type: String, default: 'Confirmed' },
  paymentMethod: { type: String, default: 'Cash on Delivery' },
  date: { type: Date, default: Date.now },
  cancellationDetails: {
    reason:    { type: String, default: null },
    comment:   { type: String, default: null },
    timestamp: { type: Date, default: null }
  }
}, {
  timestamps: true
});

orderSchema.index({ email: 1 });

module.exports = mongoose.model('Order', orderSchema);
