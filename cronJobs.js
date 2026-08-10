const cron = require('node-cron');
const Cart = require('./models/Cart');
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// Har ghante (0th minute) check karega
cron.schedule('0 * * * *', async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const carts = await Cart.find({ updatedAt: { $lt: oneHourAgo } });

    for (const cart of carts) {
        try {
            await client.messages.create({
                contentSid: 'YOUR_APPROVED_TEMPLATE_SID', // Twilio console se lein
                from: 'whatsapp:+14155238886',
                to: `whatsapp:${cart.phoneNumber}`,
                contentVariables: JSON.stringify({ '1': 'Aapka cart wait kar raha hai!' })
            });
        } catch (err) {
            console.log("Error sending reminder:", err);
        }
    }
});