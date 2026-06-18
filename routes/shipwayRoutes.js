const express = require('express');
const router = express.Router();
const { createShipment } = require('../services/shipwayService');
const { sendEmailConfirmation } = require('../services/emailService');

router.post('/create-shipment', async (req, res) => {
    try {
        const result = await createShipment(req.body);
        
        // Send email confirmation asynchronously
        sendEmailConfirmation(req.body)
            .then(emailResult => {
                if (emailResult && emailResult.success) {
                    console.log(`Email sent successfully for order: ${req.body.orderId}`);
                } else if (emailResult && emailResult.message) {
                    console.log(`Email skipped: ${emailResult.message}`);
                }
            })
            .catch(emailError => {
                console.error(`Failed to send order email:`, emailError);
            });

        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ error: "Service failed" });
    }
});

module.exports = router;