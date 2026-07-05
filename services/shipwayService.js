const axios = require("axios");

const createShipment = async (orderData) => {
    try {
        const auth = Buffer.from(
            `${process.env.SHIPWAY_USERNAME}:${process.env.SHIPWAY_PASSWORD}`
        ).toString("base64");

        const payload = {
            order_id: orderData.orderId,
            payment_type: orderData.paymentType === "COD" ? "C" : "P",
            email: orderData.email,
            shipping_firstname: orderData.firstname,
            shipping_lastname: orderData.lastname,
            shipping_phone: orderData.phone,
            shipping_address: orderData.address,
            shipping_city: orderData.city,
            shipping_state: orderData.state,
            shipping_zipcode: orderData.zipcode,
            shipping_country: orderData.country || "India",
            products: orderData.products
        };

        const response = await axios.post(
            "https://app.shipway.com/api/v2orders",
            payload,
            {
                headers: {
                    Authorization: `Basic ${auth}`,
                    "Content-Type": "application/json"
                }
            }
        );

        return response.data;

    } catch (error) {
        console.error(
            "Shipway Error:",
            error.response?.data || error.message
        );

        return {
            success: false,
            error: error.response?.data || error.message
        };
    }
};


// New cancellation function – attempts to cancel an existing order on Shipway.
// Shipway does not officially expose a cancel endpoint; we attempt a common pattern.
// If the call fails, the calling code should fallback to email notification.
const cancelShipment = async (orderId, cancellationDetails) => {
    try {
        const auth = Buffer.from(
            `${process.env.SHIPWAY_USERNAME}:${process.env.SHIPWAY_PASSWORD}`
        ).toString('base64');
        const response = await axios.post(
            `https://app.shipway.com/api/v2orders/${orderId}/cancel`,
            { cancellationDetails },
            {
                headers: {
                    Authorization: `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.warn('Shipway cancel endpoint unavailable or failed, falling back to email.', error.message);
        return { success: false, error: error.message };
    }
};

module.exports = { createShipment, cancelShipment };