const nodemailer = require('nodemailer');

const sendEmailConfirmation = async (orderData) => {
    try {
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        // Skip sending if credentials are not configured or are left as placeholders
        if (!smtpUser || !smtpPass || smtpPass === 'YOUR_GMAIL_APP_PASSWORD_HERE') {
            console.warn("SMTP credentials not configured or using default placeholders. Skipping email confirmation.");
            return {
                success: false,
                message: "SMTP credentials not configured"
            };
        }

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '465'),
            secure: process.env.SMTP_PORT === '465', // true for 465, false for 587
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        });

        // Compute total amount
        let subtotal = 0;
        const productsRows = orderData.products.map(p => {
            const price = parseFloat(p.price) || 0;
            const qty = parseInt(p.product_quantity) || 1;
            const rowTotal = price * qty;
            subtotal += rowTotal;
            return `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #f1f1f1; font-size: 14px; color: #333333; font-weight: 500;">
                        ${p.product}
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #f1f1f1; font-size: 14px; color: #666666; text-align: center;">
                        ${qty}
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #f1f1f1; font-size: 14px; color: #333333; text-align: right; font-weight: 600;">
                        ₹${price.toLocaleString('en-IN')}
                    </td>
                </tr>
            `;
        }).join('');

        const formattedDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const mailOptions = {
            from: `"Ridhika Enterprises" <${smtpUser}>`,
            to: orderData.email,
            subject: `Order Confirmed! #${orderData.orderId}`,
            html: `
                <div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; background-color: #f7f9fa; padding: 40px 15px; margin: 0; min-height: 100%;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border: 1px solid #eaeaea;">
                        
                        <!-- Header Banner -->
                        <div style="background: linear-gradient(135deg, #1e1e24 0%, #2e2e38 100%); padding: 35px 20px; text-align: center;">
                            <h1 style="color: #c9a84c; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px;">RIDHIKA ENTERPRISES</h1>
                            <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 14px; font-weight: 300; letter-spacing: 0.5px;">Premium Ethnic Wear & Accessories</p>
                        </div>

                        <!-- Thank You Box -->
                        <div style="padding: 30px 30px 10px 30px; text-align: center;">
                            <div style="width: 56px; height: 56px; line-height: 56px; border-radius: 50%; background-color: #fcf8eb; color: #c9a84c; font-size: 28px; display: inline-block; margin-bottom: 15px; text-align: center;">✓</div>
                            <h2 style="color: #2e2e38; margin: 0 0 10px 0; font-size: 22px; font-weight: 700;">Order Confirmed!</h2>
                            <p style="color: #666666; margin: 0; font-size: 15px; line-height: 1.6;">
                                Dear ${orderData.firstname || 'Customer'}, thank you for shopping with us! We have received your order and are preparing it for shipment.
                            </p>
                        </div>

                        <div style="padding: 20px 30px;">
                            <div style="background-color: #fafafa; border-radius: 8px; padding: 15px; margin-bottom: 25px; border: 1px solid #f0f0f0;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="font-size: 13px; color: #888888; padding: 4px 0;">Order ID:</td>
                                        <td style="font-size: 13px; color: #333333; font-weight: 600; padding: 4px 0; text-align: right;">#${orderData.orderId}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-size: 13px; color: #888888; padding: 4px 0;">Order Date:</td>
                                        <td style="font-size: 13px; color: #333333; padding: 4px 0; text-align: right;">${formattedDate}</td>
                                    </tr>
                                    <tr>
                                        <td style="font-size: 13px; color: #888888; padding: 4px 0;">Payment Method:</td>
                                        <td style="font-size: 13px; color: #333333; font-weight: 600; padding: 4px 0; text-align: right; text-transform: uppercase;">${orderData.paymentType || 'Prepaid'}</td>
                                    </tr>
                                </table>
                            </div>

                            <!-- Items Summary Table -->
                            <h3 style="color: #2e2e38; margin: 0 0 12px 0; font-size: 16px; font-weight: 700; border-bottom: 2px solid #c9a84c; padding-bottom: 8px;">Order Items</h3>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                                <thead>
                                    <tr style="background-color: #fafafa;">
                                        <th style="padding: 10px 12px; font-size: 12px; color: #888888; text-transform: uppercase; text-align: left; font-weight: 600; border-bottom: 1px solid #eaeaea;">Product</th>
                                        <th style="padding: 10px 12px; font-size: 12px; color: #888888; text-transform: uppercase; text-align: center; font-weight: 600; border-bottom: 1px solid #eaeaea; width: 60px;">Qty</th>
                                        <th style="padding: 10px 12px; font-size: 12px; color: #888888; text-transform: uppercase; text-align: right; font-weight: 600; border-bottom: 1px solid #eaeaea; width: 100px;">Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${productsRows}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="2" style="padding: 12px; font-size: 14px; color: #333333; font-weight: 600; text-align: right;">Total Amount:</td>
                                        <td style="padding: 12px; font-size: 16px; color: #c9a84c; font-weight: 700; text-align: right;">₹${subtotal.toLocaleString('en-IN')}</td>
                                    </tr>
                                </tfoot>
                            </table>

                            <!-- Shipping Address Card -->
                            <div style="background-color: #fafafa; border-radius: 8px; border: 1px solid #eaeaea; padding: 20px; margin-bottom: 25px;">
                                <h4 style="margin: 0 0 10px 0; color: #2e2e38; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Shipping Address</h4>
                                <p style="margin: 0; font-size: 14px; color: #555555; line-height: 1.5; font-weight: 400;">
                                    <strong>${orderData.firstname || ''} ${orderData.lastname || ''}</strong><br/>
                                    ${orderData.address || ''}<br/>
                                    ${orderData.city || ''}, ${orderData.state || ''} - ${orderData.zipcode || ''}<br/>
                                    Phone: ${orderData.phone || ''}
                                </p>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div style="background-color: #fafafa; border-top: 1px solid #eaeaea; padding: 25px 30px; text-align: center;">
                            <p style="margin: 0 0 8px 0; font-size: 13px; color: #888888;">If you have any questions or need support, contact us:</p>
                            <a href="mailto:ridhikaenterprises2023@gmail.com" style="color: #c9a84c; font-size: 14px; font-weight: 600; text-decoration: none;">ridhikaenterprises2023@gmail.com</a>
                            <div style="margin-top: 20px; border-top: 1px solid #eeeeee; padding-top: 15px;">
                                <p style="margin: 0; font-size: 11px; color: #b0b0b0;">&copy; ${new Date().getFullYear()} Ridhika Enterprises. All Rights Reserved.</p>
                            </div>
                        </div>

                    </div>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Order confirmation email sent successfully. MessageID:', info.messageId);
        return {
            success: true,
            messageId: info.messageId
        };

    } catch (error) {
        console.error('Nodemailer Error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

// Fallback notification when Shipway cancellation fails
const sendCancellationEmail = async ({ orderId, reason, comment }) => {
  try {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if (!smtpUser || !smtpPass || smtpPass === 'YOUR_GMAIL_APP_PASSWORD_HERE') {
      console.warn('SMTP credentials not configured. Skipping cancellation email.');
      return { success: false, message: 'SMTP not configured' };
    }
    const adminEmail = process.env.ADMIN_EMAIL || smtpUser;
    const transporter = require('nodemailer').createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: smtpUser, pass: smtpPass }
    });
    const mailOptions = {
      from: `"Ridhika Enterprises" <${smtpUser}>`,
      to: adminEmail,
      subject: `Shipway cancellation failed for Order #${orderId}`,
      html: `
        <div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; background:#f7f9fa; padding:30px;">
          <h2 style="color:#c94c4c;">⚠️ Shipway Cancellation Failure</h2>
          <p>Order <strong>#${orderId}</strong> could not be cancelled via Shipway API.</p>
          <p><strong>Reason:</strong> ${reason || 'N/A'}</p>
          <p><strong>Comment:</strong> ${comment || 'N/A'}</p>
          <p>Please take manual action to prevent shipment.</p>
        </div>
      `
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('Cancellation fallback email sent. MessageID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('Error sending cancellation fallback email:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendEmailConfirmation, sendCancellationEmail };
