const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Replicate = require('replicate');
const cloudinary = require('cloudinary').v2;

// Ensure uploads directory exists for temp storage
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer disk storage for user photo upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'tryon-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    const isAllowedExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

    if (allowedTypes.includes(file.mimetype) || isAllowedExt) {
        cb(null, true);
    } else {
        cb(new Error('Invalid image format! Please upload JPG, PNG, or WEBP images.'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configure Cloudinary if environment variables exist
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

/**
 * Helper to get a publicly accessible URL or Data URI for Replicate input
 */
const getAccessibleImageUrl = async (file, req) => {
    if (!file) return null;

    // 1. Try uploading to Cloudinary if available
    const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET;

    if (isCloudinaryConfigured) {
        try {
            const result = await cloudinary.uploader.upload(file.path, {
                folder: 'tryon-user-photos',
                resource_type: 'image'
            });
            return result.secure_url;
        } catch (err) {
            console.error('Cloudinary upload failed for try-on photo:', err.message);
        }
    }

    // 2. Fallback: Data URI (Replicate API natively supports Data URIs!)
    const fileBuffer = fs.readFileSync(file.path);
    const mimeType = file.mimetype || 'image/jpeg';
    return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
};

/**
 * POST /api/virtual-try-on
 * Accepts:
 *   - user_image (file upload via multipart form-data) OR user_image_url (body)
 *   - product_image (URL string in body)
 *   - category (optional: 'upper_body', 'lower_body', 'dresses')
 */
router.post('/', upload.single('user_image'), async (req, res) => {
    let tempFilePath = req.file ? req.file.path : null;

    try {
        const token = process.env.REPLICATE_API_TOKEN;
        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Replicate API token is not configured on the server. Please add REPLICATE_API_TOKEN to backend/.env file.'
            });
        }

        const productImage = req.body.product_image;
        if (!productImage) {
            return res.status(400).json({
                success: false,
                error: 'Product garment image URL is required.'
            });
        }

        let userImageUrl = req.body.user_image_url;
        if (req.file) {
            userImageUrl = await getAccessibleImageUrl(req.file, req);
        }

        if (!userImageUrl) {
            return res.status(400).json({
                success: false,
                error: 'Please upload a full-body user photo or provide a valid user image URL.'
            });
        }

        const category = req.body.category || 'upper_body';

        console.log(`[Virtual Try-On] Initiating AI processing with Replicate API for category: ${category}...`);

        const replicate = new Replicate({ auth: token });

        // Using IDM-VTON model on Replicate
        // cuuupid/idm-vton or yzd-v/idm-vton model version
        const output = await replicate.run(
            "cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985",
            {
                input: {
                    human_img: userImageUrl,
                    garm_img: garmentImageUrl,
                    category: "upper_body", // ya dress ke hisab se
                    crop: false,
                    seed: 42
                }
            }
        );
        let resultImageUrl = null;
        if (Array.isArray(output) && output.length > 0) {
            resultImageUrl = typeof output[0] === 'string' ? output[0] : (output[0].url ? output[0].url() : String(output[0]));
        } else if (typeof output === 'string') {
            resultImageUrl = output;
        } else if (output && typeof output.url === 'function') {
            resultImageUrl = output.url();
        }

        if (!resultImageUrl) {
            throw new Error('AI service completed but did not return a valid result image URL.');
        }

        console.log('[Virtual Try-On] AI process completed successfully!');

        return res.status(200).json({
            success: true,
            result_image: resultImageUrl
        });

    } catch (error) {
        console.error('[Virtual Try-On Error]:', error.message || error);
        return res.status(500).json({
            success: false,
            error: error.message || 'An error occurred during AI Virtual Try-On processing.'
        });
    } finally {
        // Clean up temporary user image file from server disk
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error('Error removing temporary try-on file:', err);
            });
        }
    }
});

module.exports = router;
