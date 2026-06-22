const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: { type: String, required: true },
  addressLine: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  mobile: { type: String, required: true },
  alternateMobile: { type: String, default: '' },
  label: { type: String, required: true, default: 'Home' }, // 'Home', 'Office', 'Work', 'Others'
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Address', addressSchema);
