const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');

router.post('/add-to-cart', async (req, res) => {
    const { userId, phoneNumber, items } = req.body;
    try {
        // Upsert logic: Agar cart hai toh update karo, nahi toh naya banao
        const cart = await Cart.findOneAndUpdate(
            { userId },
            { items, phoneNumber, updatedAt: Date.now() },
            { new: true, upsert: true }
        );
        res.status(200).json(cart);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;