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
    { name: 'video', maxCount: 1 },
    { name: 'colorImages', maxCount: 20 }
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

// Helper function to upload file to Cloudinary and delete local temp file ONLY on success
const uploadToCloudinaryDirect = async (file) => {
    const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET;

    if (!isCloudinaryConfigured) {
        console.log('[Background Upload] Cloudinary is not configured.');
        return null;
    }

    try {
        const result = await cloudinary.uploader.upload(file.path, {
            folder: 'ecommerce-products',
            resource_type: 'auto'
        });
        
        // Delete the local temporary file only on successful upload
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        return result.secure_url;
    } catch (err) {
        console.error('Error uploading file to Cloudinary in background:', err);
        return null;
    }
};

// Background processor to handle uploads and DB mapping asynchronously
const processUploadsInBackground = async (productId, imageFiles, videoFiles, req) => {
    try {
        console.log(`[Background Task] Starting Cloudinary uploads for product ${productId}...`);
        
        // Upload images to Cloudinary in parallel
        const cloudinaryImageUrls = await Promise.all(imageFiles.map(file => uploadToCloudinaryDirect(file)));
        
        let cloudinaryVideoUrl = '';
        if (videoFiles.length > 0) {
            cloudinaryVideoUrl = await uploadToCloudinaryDirect(videoFiles[0]);
        }
        
        // Find product
        const product = await Product.findById(productId);
        if (!product) {
            console.log(`[Background Task] Product ${productId} not found (might have been deleted). Cleaning up files.`);
            // Clean up files anyway to avoid disk leaks
            imageFiles.concat(videoFiles).forEach(file => {
                if (file && file.path && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
            return;
        }

        // Map local URLs to Cloudinary URLs in the product's arrays
        const host = req ? req.get('host') : 'localhost:5000';
        const protocol = req ? req.protocol : 'http';
        const localPrefix = `${protocol}://${host}/uploads/`;

        // Update product's imageUrls
        let urlsUpdated = false;
        if (product.imageUrls) {
            product.imageUrls = product.imageUrls.map(url => {
                if (url && url.startsWith(localPrefix)) {
                    const filename = url.substring(localPrefix.length);
                    const fileIndex = imageFiles.findIndex(f => f.filename === filename);
                    if (fileIndex !== -1 && cloudinaryImageUrls[fileIndex]) {
                        urlsUpdated = true;
                        return cloudinaryImageUrls[fileIndex];
                    }
                }
                return url;
            });
        }

        // Update colorVariants image URLs
        if (product.colorVariants && product.colorVariants.length > 0) {
            product.colorVariants = product.colorVariants.map(variant => {
                if (variant.imageUrl && variant.imageUrl.startsWith(localPrefix)) {
                    const filename = variant.imageUrl.substring(localPrefix.length);
                    // Check if it's in imageFiles (or colorImages which we'll combine)
                    const fileIndex = imageFiles.findIndex(f => f.filename === filename);
                    if (fileIndex !== -1 && cloudinaryImageUrls[fileIndex]) {
                        urlsUpdated = true;
                        variant.imageUrl = cloudinaryImageUrls[fileIndex];
                    }
                }
                
                if (variant.imageUrls && variant.imageUrls.length > 0) {
                    variant.imageUrls = variant.imageUrls.map(url => {
                        if (url && url.startsWith(localPrefix)) {
                            const filename = url.substring(localPrefix.length);
                            const fileIndex = imageFiles.findIndex(f => f.filename === filename);
                            if (fileIndex !== -1 && cloudinaryImageUrls[fileIndex]) {
                                urlsUpdated = true;
                                return cloudinaryImageUrls[fileIndex];
                            }
                        }
                        return url;
                    });
                }
                return variant;
            });
        }

        // Update main imageUrl if it was a local URL
        if (product.imageUrl && product.imageUrl.startsWith(localPrefix)) {
            const filename = product.imageUrl.substring(localPrefix.length);
            const fileIndex = imageFiles.findIndex(f => f.filename === filename);
            if (fileIndex !== -1 && cloudinaryImageUrls[fileIndex]) {
                product.imageUrl = cloudinaryImageUrls[fileIndex];
                urlsUpdated = true;
            } else if (product.imageUrls.length > 0) {
                product.imageUrl = product.imageUrls[0];
                urlsUpdated = true;
            }
        }

        // Update videoUrl if it was local
        if (product.videoUrl && product.videoUrl.startsWith(localPrefix)) {
            const filename = product.videoUrl.substring(localPrefix.length);
            const fileIndex = videoFiles.findIndex(f => f.filename === filename);
            if (fileIndex !== -1 && cloudinaryVideoUrl) {
                product.videoUrl = cloudinaryVideoUrl;
                urlsUpdated = true;
            }
        }

        if (urlsUpdated) {
            await product.save();
            console.log(`[Background Task] Successfully uploaded and updated product ${productId} with Cloudinary URLs.`);
        } else {
            console.log(`[Background Task] No URLs needed to be updated for product ${productId}.`);
        }
    } catch (err) {
        console.error(`[Background Task] Error uploading to Cloudinary in background for product ${productId}:`, err);
    }
};

// 1. Add new product (POST) — accepts up to 10 images
router.post('/add', productUpload, async (req, res) => {
    try {
        const imageFiles = req.files && req.files.images ? req.files.images : [];
        const colorImageFiles = req.files && req.files.colorImages ? req.files.colorImages : [];
        const videoFiles = req.files && req.files.video ? req.files.video : [];

        // Save local paths first
        const host = req ? req.get('host') : 'localhost:5000';
        const protocol = req ? req.protocol : 'http';

        const localImageUrls = imageFiles.map(file => `${protocol}://${host}/uploads/${file.filename}`);
        const localImageUrl = localImageUrls.length > 0 ? localImageUrls[0] : '';
        let localVideoUrl = '';
        if (videoFiles.length > 0) {
            localVideoUrl = `${protocol}://${host}/uploads/${videoFiles[0].filename}`;
        }
        
        // Parse colorVariants
        let parsedColorVariants = [];
        if (req.body.colorVariants) {
            try {
                parsedColorVariants = JSON.parse(req.body.colorVariants);
                let newFileIndex = 0;
                parsedColorVariants = parsedColorVariants.map((variant) => {
                    const count = variant.newFileCount || 0;
                    if (count > 0) {
                        const variantUrls = [];
                        for (let i = 0; i < count; i++) {
                            if (colorImageFiles[newFileIndex]) {
                                variantUrls.push(`${protocol}://${host}/uploads/${colorImageFiles[newFileIndex].filename}`);
                            }
                            newFileIndex++;
                        }
                        if (variantUrls.length > 0) {
                            variant.imageUrls = (variant.imageUrls || []).concat(variantUrls);
                            if (!variant.imageUrl) {
                                variant.imageUrl = variant.imageUrls[0];
                            }
                        }
                    }
                    return variant;
                });
            } catch (e) {
                console.error("Error parsing colorVariants:", e);
            }
        }

        const newProduct = new Product({
            name: req.body.name,
            description: req.body.description,
            price: parseFloat(req.body.price),
            originalPrice: parseFloat(req.body.originalPrice) || parseFloat(req.body.price),
            category: req.body.category,
            stock: parseInt(req.body.stock) || 0,
            availableSizes: req.body.availableSizes ? (Array.isArray(req.body.availableSizes) ? req.body.availableSizes : [req.body.availableSizes]) : [],
            availableColors: req.body.availableColors ? (Array.isArray(req.body.availableColors) ? req.body.availableColors : [req.body.availableColors]) : [],
            colorVariants: parsedColorVariants,
            imageUrl: localImageUrl || (parsedColorVariants.length > 0 ? parsedColorVariants[0].imageUrl : ''),
            imageUrls: localImageUrls,
            videoUrl: localVideoUrl
        });

        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);

        // Combine all images for background upload
        const allImagesToUpload = [...imageFiles, ...colorImageFiles];

        // Process Cloudinary uploads in background
        if (allImagesToUpload.length > 0 || videoFiles.length > 0) {
            processUploadsInBackground(savedProduct._id, allImagesToUpload, videoFiles, req);
        }
    } catch (err) {
        console.error('Error in adding product:', err);
        res.status(500).json({ message: 'Failed to add product', error: err.message });
    }
});

// 2. Saare products fetch karne ke liye (GET)
router.get('/', async (req, res) => {
    try {
        const { limit, cursor, category } = req.query;
        let query = {};

        if (category && category !== 'All') {
            query.category = category;
        }

        // Using $lt because we sort by _id descending (newest first)
        if (cursor) {
            query._id = { $lt: cursor };
        }

        let productsQuery = Product.find(query).sort({ _id: -1 });

        if (limit) {
            productsQuery = productsQuery.limit(parseInt(limit));
        }

        const products = await productsQuery;
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
        if (req.body.originalPrice) product.originalPrice = parseFloat(req.body.originalPrice);
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
        const colorImageFiles = req.files && req.files.colorImages ? req.files.colorImages : [];
        const videoFiles = req.files && req.files.video ? req.files.video : [];

        // Parse colorVariants
        let parsedColorVariants = [];
        if (req.body.colorVariants) {
            try {
                parsedColorVariants = JSON.parse(req.body.colorVariants);
                // The frontend should pass existing variants with `imageUrl`.
                // For new variants or updated ones, it should pass them in order 
                // of `colorImageFiles` if they are new files, but wait:
                // Handling mapping for edits is tricky if we mix old and new files.
                // Assuming the frontend passes `{ colorName: 'Red', imageUrl: '...', isNewFile: true/false }`
                // But let's just keep it simple: the frontend uploads the complete new set of `colorVariants`.
                // If a variant has a new file, the frontend will append it to `colorImages` and the backend will map it.
                // Let's assume the frontend sends the variants in order, and `colorImageFiles` contains only the new files.
                // To properly map, the frontend can pass an index.
                let newFileIndex = 0;
                parsedColorVariants = parsedColorVariants.map((variant) => {
                    const count = variant.newFileCount || 0;
                    if (!variant.imageUrls) variant.imageUrls = [];
                    
                    if (count > 0) {
                        const variantUrls = [];
                        for (let i = 0; i < count; i++) {
                            if (colorImageFiles[newFileIndex]) {
                                const host = req ? req.get('host') : 'localhost:5000';
                                const protocol = req ? req.protocol : 'http';
                                variantUrls.push(`${protocol}://${host}/uploads/${colorImageFiles[newFileIndex].filename}`);
                            }
                            newFileIndex++;
                        }
                        variant.imageUrls = variant.imageUrls.concat(variantUrls);
                    }
                    if (variant.imageUrls.length > 0 && !variant.imageUrl) {
                        variant.imageUrl = variant.imageUrls[0];
                    }
                    return variant;
                });
                product.colorVariants = parsedColorVariants;
            } catch (e) {
                console.error("Error parsing colorVariants:", e);
            }
        }

        // Generate local static URLs for new images
        const host = req ? req.get('host') : 'localhost:5000';
        const protocol = req ? req.protocol : 'http';
        const newLocalImageUrls = imageFiles.map(file => `${protocol}://${host}/uploads/${file.filename}`);

        product.imageUrls = [...currentUrls, ...newLocalImageUrls];
        // fallback image is first of regular images or first of color variants
        product.imageUrl = product.imageUrls[0] || (product.colorVariants && product.colorVariants.length > 0 ? product.colorVariants[0].imageUrl : '');

        // Handle videoUrl update
        let newLocalVideoUrl = '';
        if (videoFiles.length > 0) {
            newLocalVideoUrl = `${protocol}://${host}/uploads/${videoFiles[0].filename}`;
            product.videoUrl = newLocalVideoUrl;
        } else if (req.body.existingVideoUrl !== undefined) {
            product.videoUrl = req.body.existingVideoUrl;
        }

        const updatedProduct = await product.save();
        res.status(200).json(updatedProduct);

        // Process Cloudinary uploads in background for new files
        const allImagesToUpload = [...imageFiles, ...colorImageFiles];
        if (allImagesToUpload.length > 0 || videoFiles.length > 0) {
            processUploadsInBackground(updatedProduct._id, allImagesToUpload, videoFiles, req);
        }
    } catch (err) {
        console.error('Error in editing product:', err);
        res.status(500).json({ message: 'Failed to edit product', error: err.message });
    }
});

module.exports = router;
