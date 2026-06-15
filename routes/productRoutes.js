console.log('🚀 Product Routes successfully loaded!');
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage engine
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isImage = /jpeg|jpg|png|webp|gif/.test(ext) || file.mimetype.startsWith('image/');
    const isVideo = /mp4|webm|ogg|mov|mkv|avi/.test(ext) || file.mimetype.startsWith('video/');
    if (isImage || isVideo) {
        return cb(null, true);
    }
    cb(new Error('Only image and video files are allowed!'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB max for videos

// Middleware to handle multiple files from different fields
const productUpload = upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'video', maxCount: 1 }
]);

const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to upload file to Cloudinary and delete local temp file
const uploadToCloudinary = async (file, req) => {
    const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET;

    if (isCloudinaryConfigured) {
        try {
            const result = await cloudinary.uploader.upload(file.path, {
                folder: 'ecommerce-products',
                resource_type: 'auto'
            });
            // Delete the local temporary file
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
            return result.secure_url;
        } catch (err) {
            console.error('Error uploading file to Cloudinary, falling back to local storage:', err);
            const host = req ? req.get('host') : 'localhost:5000';
            const protocol = req ? req.protocol : 'http';
            return `${protocol}://${host}/uploads/${file.filename}`;
        }
    } else {
        const host = req ? req.get('host') : 'localhost:5000';
        const protocol = req ? req.protocol : 'http';
        return `${protocol}://${host}/uploads/${file.filename}`;
    }
};

// 1. Add new product (POST) — accepts up to 10 images
router.post('/add', productUpload, async (req, res) => {
    try {
        const imageFiles = req.files && req.files.images ? req.files.images : [];
        const videoFiles = req.files && req.files.video ? req.files.video : [];

        const imageUrls = await Promise.all(imageFiles.map(file => uploadToCloudinary(file, req)));
        const imageUrl = imageUrls.length > 0 ? imageUrls[0] : '';

        let videoUrl = '';
        if (videoFiles.length > 0) {
            videoUrl = await uploadToCloudinary(videoFiles[0], req);
        }

        const newProduct = new Product({
            name: req.body.name,
            description: req.body.description,
            price: parseFloat(req.body.price),
            category: req.body.category,
            stock: parseInt(req.body.stock) || 0,
            availableSizes: req.body.availableSizes ? (Array.isArray(req.body.availableSizes) ? req.body.availableSizes : [req.body.availableSizes]) : [],
            availableColors: req.body.availableColors ? (Array.isArray(req.body.availableColors) ? req.body.availableColors : [req.body.availableColors]) : [],
            imageUrl: imageUrl,
            imageUrls: imageUrls,
            videoUrl: videoUrl
        });

        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);
    } catch (err) {
        console.error('Error in adding product:', err);
        res.status(500).json({ message: 'Failed to add product', error: err.message });
    }
});

// 2. Saare products fetch karne ke liye (GET)
router.get('/', async (req, res) => {
    try {
        const products = await Product.find();
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json(err);
    }
});

// Delete a product by ID
router.delete('/delete/:id', async (req, res) => {
    console.log('Delete request received for ID:', req.params.id);
    try {
        const deleted = await Product.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.status(200).json({ message: 'Product deleted', id: req.params.id });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ message: 'Failed to delete product', error: err.message });
    }
});

// Add review to product (POST)
router.post('/:id/review', upload.array('images', 5), async (req, res) => {
    try {
        const { rating, comment, userName } = req.body;
        if (!rating || !comment) {
            return res.status(400).json({ message: 'Rating and comment are required' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const reviewImages = req.files
            ? await Promise.all(req.files.map(file => uploadToCloudinary(file)))
            : [];

        const newReview = {
            rating: parseInt(rating),
            comment,
            userName: userName || 'Anonymous',
            images: reviewImages,
            createdAt: new Date()
        };

        if (!product.reviews) {
            product.reviews = [];
        }

        product.reviews.push(newReview);
        const savedProduct = await product.save();
        res.status(200).json(savedProduct);
    } catch (err) {
        console.error('Error adding review:', err);
        res.status(500).json({ message: 'Failed to add review', error: err.message });
    }
});

// Update an existing product (PUT)
router.put('/edit/:id', productUpload, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Update basic details
        product.name = req.body.name || product.name;
        product.description = req.body.description || product.description;
        if (req.body.price) product.price = parseFloat(req.body.price);
        product.category = req.body.category || product.category;
        if (req.body.stock !== undefined) product.stock = parseInt(req.body.stock) || 0;

        if (req.body.availableSizes) {
            product.availableSizes = Array.isArray(req.body.availableSizes)
                ? req.body.availableSizes
                : [req.body.availableSizes];
        }

        if (req.body.availableColors !== undefined) {
            product.availableColors = Array.isArray(req.body.availableColors)
                ? req.body.availableColors
                : (req.body.availableColors === '' ? [] : [req.body.availableColors]);
        }

        // Gather existing images passed from frontend (remaining after optional deletion)
        let currentUrls = [];
        if (req.body.existingImageUrls) {
            currentUrls = Array.isArray(req.body.existingImageUrls)
                ? req.body.existingImageUrls
                : [req.body.existingImageUrls];
        } else {
            // Default to all current images if field not passed (so we append new files to current list)
            currentUrls = product.imageUrls || [];
        }

        // Append new uploaded images
        const imageFiles = req.files && req.files.images ? req.files.images : [];
        const videoFiles = req.files && req.files.video ? req.files.video : [];

        const newImageUrls = await Promise.all(imageFiles.map(file => uploadToCloudinary(file, req)));
        product.imageUrls = [...currentUrls, ...newImageUrls];
        product.imageUrl = product.imageUrls[0] || '';

        // Handle videoUrl update
        if (videoFiles.length > 0) {
            product.videoUrl = await uploadToCloudinary(videoFiles[0], req);
        } else if (req.body.existingVideoUrl !== undefined) {
            product.videoUrl = req.body.existingVideoUrl;
        }

        const updatedProduct = await product.save();
        res.status(200).json(updatedProduct);
    } catch (err) {
        console.error('Error in editing product:', err);
        res.status(500).json({ message: 'Failed to edit product', error: err.message });
    }
});

module.exports = router;
