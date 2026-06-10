const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');
const nodemailer = require('nodemailer');

const ADMIN_EMAIL = 'anuradhagupta1829@gmail.com';

// Nodemailer SMTP Transporter
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    family: 4,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});
transporter.verify((err, success) => {
    if (err) {
        console.log("SMTP ERROR:", err);
    } else {
        console.log("SMTP READY");
    }
});

// Helper to hash passwords using standard built-in crypto
const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

// Signup Route (Legacy or Admin-only)
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password, role = 'user' } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        const normalizedEmail = email.toLowerCase();
        // Admin signup – enforce fixed credentials and skip OTP
        if (role === 'admin') {
            const adminHash = hashPassword('Anuradha@1829');
            if (normalizedEmail !== ADMIN_EMAIL.toLowerCase() || hashPassword(password) !== adminHash) {
                return res.status(403).json({ message: 'Invalid admin credentials.' });
            }
            const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });
            if (existingAdmin) {
                return res.status(400).json({ message: 'Admin account already exists.' });
            }
        }
        // Regular user signup without OTP is disabled – respond with instruction
        return res.status(400).json({ message: 'Use /signup/initiate for user registration with OTP.' });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error during signup.' });
    }
});

// ----- OTP based signup flow (Email OTP) -----
// Step 1: Initiate signup – create user entry (unverified), generate 6-digit code, send via email
router.post('/signup/initiate', async (req, res) => {
    try {
        const { name, email, password, role = 'user', countryCode, mobile } = req.body;
        if (!name || !email || !password || !countryCode || !mobile) {
            return res.status(400).json({ message: 'All fields including country code and mobile are required.' });
        }
        const normalizedEmail = email.toLowerCase();
        const fullNumber = `${countryCode}${mobile}`; // e.g., +91xxxxxxxxxx
        const hashedPassword = hashPassword(password);

        // If registration role is admin, enforce fixed credentials first
        if (role === 'admin') {
            const adminHash = hashPassword('Anuradha@1829');
            if (normalizedEmail !== ADMIN_EMAIL.toLowerCase() || hashedPassword !== adminHash) {
                return res.status(400).json({ message: 'Invalid admin credentials.' });
            }
        }

        // Generate a 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        let user = await User.findOne({ email: normalizedEmail });
        if (user) {
            if (user.isVerified) {
                return res.status(400).json({ message: 'User already exists with this email.' });
            }
            // If user exists but is not verified, update details, new OTP and expiration
            user.name = name;
            user.password = hashedPassword;
            user.mobile = fullNumber;
            user.otp = otpCode;
            user.otpExpires = otpExpires;
            await user.save();
        } else {
            // Create user but mark as not verified yet
            user = new User({
                name,
                email: normalizedEmail,
                password: hashedPassword,
                role,
                mobile: fullNumber,
                isVerified: false,
                otp: otpCode,
                otpExpires: otpExpires
            });
            await user.save();
        }

        // Send Email
        const mailOptions = {
            from: `"Ridhika Enterprises" <${process.env.SMTP_USER || 'Ridhikaenterprises2023@gmail.com'}>`,
            to: normalizedEmail,
            subject: 'Verify Your Email - OTP Verification',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #c49a45; text-align: center;">Ridhika Enterprises</h2>
                    <p>Hello <strong>${name}</strong>,</p>
                    <p>Thank you for registering. Please use the following One-Time Password (OTP) to verify your account. This code is valid for 10 minutes.</p>
                    <div style="background-color: #f9f9f9; border: 1px dashed #c49a45; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #333; margin: 20px 0;">
                        ${otpCode}
                    </div>
                    <p>If you did not request this code, please ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #888; text-align: center;">This is an automated email. Please do not reply directly.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        res.status(200).json({ message: 'OTP sent to your email.', userId: user._id });
    } catch (error) {
        console.error('Email OTP initiate error:', error);
        res.status(500).json({
            message: 'Failed to send OTP email.',
            details: error.message + ' (Please check if App Password is required for Gmail SMTP)'
        });
    }
});

// Step 2: Verify OTP – confirm code and activate account
router.post('/signup/verify', async (req, res) => {
    try {
        const { userId, otp } = req.body;
        if (!userId || !otp) {
            return res.status(400).json({ message: 'userId and otp are required.' });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Verify OTP
        if (!user.otp || !user.otpExpires) {
            return res.status(400).json({ message: 'No active OTP session found. Please request a new OTP.' });
        }

        if (new Date() > user.otpExpires) {
            return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
        }

        if (user.otp !== otp.trim()) {
            return res.status(400).json({ message: 'Invalid OTP code.' });
        }

        // Clear OTP and mark user as verified
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        // Return auth payload (same shape as login)
        res.status(200).json({
            message: 'Registration successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                mobile: user.mobile
            }
        });
    } catch (error) {
        console.error('Email OTP verification error:', error);
        res.status(500).json({ message: 'Server error during OTP verification.', details: error.message });
    }
});

// Login Route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }
        const normalizedEmail = email.toLowerCase();

        // Fixed Admin Direct Login
        if (normalizedEmail === ADMIN_EMAIL.toLowerCase()) {
            const adminHash = hashPassword('Anuradha@1829');
            if (hashPassword(password) === adminHash) {
                return res.status(200).json({
                    message: 'Login successful',
                    user: {
                        id: 'admin-fixed-id',
                        name: 'Admin',
                        email: ADMIN_EMAIL,
                        role: 'admin',
                        mobile: '+919999999999'
                    }
                });
            } else {
                return res.status(400).json({ message: 'Invalid credentials.' });
            }
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }
        const hashedPassword = hashPassword(password);
        if (user.password !== hashedPassword) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }
        // Prevent login for unverified regular users
        if (user.role !== 'admin' && !user.isVerified) {
            return res.status(403).json({ message: 'Account not verified. Complete OTP verification.' });
        }
        const userRole = normalizedEmail === ADMIN_EMAIL ? 'admin' : user.role;
        res.status(200).json({
            message: 'Login successful',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: userRole,
                mobile: user.mobile
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

module.exports = router;
