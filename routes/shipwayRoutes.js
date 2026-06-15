// backend/routes/shipwayRoutes.js
const express = require('express');
const router = express.Router();
const { createShipment } = require('../services/shipwayService'); // Service ko import kiya

router.post('/create-shipment', async (req, res) => {
    try {
        const result = await createShipment(req.body);
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ error: "Service failed" });
    }
});

module.exports = rotate; // Sorry, yahan `module.exports = router;` hona chahiye