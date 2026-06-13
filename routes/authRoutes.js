const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'anuradhagupta1829@gmail.com';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'e-commerce-20b88';

// Cache for Google's public certificates
let publicKeys = {};
let keysExpiry = 0;

const getGooglePublicKeys = async () => {
    if (Date.now() < keysExpiry && Object.keys(publicKeys).length > 0) {
        return publicKeys;
    }
    try {
        const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
        const data = await response.json();
        
        // Parse cache control header
        const cacheControl = response.headers.get('cache-control');
        if (cacheControl) {
            const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
            if (maxAgeMatch) {
                keysExpiry = Date.now() + parseInt(maxAgeMatch[1]) * 1000;
            }
        }
        publicKeys = data;
        return publicKeys;
    } catch (err) {
        console.error("Error fetching Google public keys:", err);
        throw new Error("Failed to fetch Google public keys for verification.");
    }
};

const verifyFirebaseToken = async (idToken) => {
    if (!idToken) {
        throw new Error('No token provided');
    }
    const decodedHeader = jwt.decode(idToken, { complete: true });
    if (!decodedHeader || !decodedHeader.header || !decodedHeader.header.kid) {
        throw new Error('Invalid token format');
    }
    
    const kid = decodedHeader.header.kid;
    const keys = await getGooglePublicKeys();
    const publicKey = keys[kid];
    
    if (!publicKey) {
        throw new Error('Matching public key not found');
    }
    
    return jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        audience: FIREBASE_PROJECT_ID,
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`
    });
};

// Google Login Route
router.post('/google-login', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({ message: 'Firebase ID Token is required.' });
        }
        
        // Verify Firebase Token
        const decodedToken = await verifyFirebaseToken(idToken);
        const { email, name, email_verified } = decodedToken;
        
        if (!email) {
            return res.status(400).json({ message: 'Token payload does not contain an email address.' });
        }
        if (!email_verified) {
            return res.status(400).json({ message: 'Google email is not verified.' });
        }
        
        const normalizedEmail = email.toLowerCase();
        
        // Determine role (admin if matching ADMIN_EMAIL env)
        const role = (normalizedEmail === ADMIN_EMAIL.toLowerCase()) ? 'admin' : 'user';
        
        // Find or create user
        let user = await User.findOne({ email: normalizedEmail });
        let isNewUser = false;
        if (!user) {
            isNewUser = true;
            user = new User({
                name: name || 'Google User',
                email: normalizedEmail,
                role: role,
                isVerified: true,
                createdAt: new Date()
            });
            await user.save();
            console.log(`Created new user: ${normalizedEmail} with role ${role}`);
        } else {
            // Update details or role if needed
            let isModified = false;
            if (user.role !== role) {
                user.role = role;
                isModified = true;
            }
            if (!user.isVerified) {
                user.isVerified = true;
                isModified = true;
            }
            if (isModified) {
                await user.save();
            }
        }
        
        // Check if user needs mobile number setup
        const needsMobileSetup = !user.mobile && user.role !== 'admin';
        
        res.status(200).json({
            message: 'Login successful',
            isNewUser: isNewUser || needsMobileSetup,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                mobile: user.mobile
            }
        });
    } catch (error) {
        console.error('Google Sign-in/Login error:', error);
        res.status(401).json({
            message: 'Authentication failed.',
            details: error.message
        });
    }
});

// Update Profile / Complete Profile Route
router.post('/update-profile', async (req, res) => {
    try {
        const { userId, mobile } = req.body;
        if (!userId || !mobile) {
            return res.status(400).json({ message: 'User ID and Mobile number are required.' });
        }
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        
        user.mobile = mobile;
        await user.save();
        
        res.status(200).json({
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                mobile: user.mobile
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Server error during profile update.', details: error.message });
    }
});

module.exports = router;
