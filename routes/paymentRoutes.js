const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
// NOTE: Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET inside backend's .env file
const razorpay = new Razorpay({
  key_id: (process.env.RAZORPAY_KEY_ID || 'YOUR_RAZORPAY_KEY_ID').trim(),
  key_secret: (process.env.RAZORPAY_KEY_SECRET || 'YOUR_RAZORPAY_KEY_SECRET').trim(),
});

// Route 1: Create Order ID (POST)
router.post('/order', async (req, res) => {
  console.log('Received order creation request with body:', req.body);
  console.log('Razorpay Key ID:', razorpay.key_id);
  console.log('Razorpay Secret length:', razorpay.key_secret.length);
  try {
    const { amount, currency = 'INR', receipt } = req.body;
    
    if (!amount) {
      return res.status(400).json({ message: 'Amount is required' });
    }

    const options = {
      amount: Math.round(amount * 100), // amount in paisa
      currency,
      receipt: receipt || `receipt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
  console.log('Razorpay order created:', order);
    if (!order) {
      return res.status(500).json({ message: 'Failed to generate order ID' });
    }

    res.status(200).json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: (process.env.RAZORPAY_KEY_ID || 'YOUR_RAZORPAY_KEY_ID').trim()
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ message: 'Razorpay order creation failed', error: error.message });
  }
});

// Route 2: Verify Signature (POST)
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', (process.env.RAZORPAY_KEY_SECRET || 'YOUR_RAZORPAY_KEY_SECRET').trim())
      .update(sign.toString())
      .digest('hex');

    if (expectedSign === razorpay_signature) {
      return res.status(200).json({ message: 'Payment verified successfully', verified: true });
    } else {
      return res.status(400).json({ message: 'Invalid payment signature', verified: false });
    }
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    res.status(500).json({ message: 'Signature verification failed', error: error.message });
  }
});

module.exports = router;
