const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// Twilio Client setup
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// 1. OTP Send Route
router.post('/send-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        const otp = Math.floor(100000 + Math.random() * 900000); // 6 digit OTP

        // Twilio se SMS bhejein
        await client.messages.create({
            body: `Aapka OTP hai: ${otp}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });

        // Yahan aapko OTP database mein save karna hoga (abhi ke liye bas console mein check kar lein)
        console.log("Generated OTP:", otp);

        res.status(200).json({ success: true, message: "OTP sent successfully!", otp }); // 'otp' frontend ko test ke liye bhej rahe hain
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. OTP Verify Route
router.post('/verify-otp', (req, res) => {
    const { userEnteredOtp, storedOtp } = req.body;

    // Note: Abhi hum 'storedOtp' frontend se le rahe hain (Testing ke liye)
    // Jab MongoDB use karenge, tab database se match karenge.
    if (userEnteredOtp == storedOtp) {
        res.status(200).json({ success: true, message: "Verified!" });
    } else {
        res.status(400).json({ success: false, message: "Galat OTP!" });
    }
});

module.exports = router;