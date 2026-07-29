const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// Multer error handling wrapper middleware
const handleUpload = (req, res, next) => {
    upload.single('user_image')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ success: false, error: err.message });
        }
        next();
    });
};

// Configure Cloudinary if environment variables exist
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
}

/**
 * Helper to get a publicly accessible URL or Data URI for AI model input
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

    // 2. Fallback: Data URI
    const fileBuffer = fs.readFileSync(file.path);
    const mimeType = file.mimetype || 'image/jpeg';
    return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
};

/**
 * POST /api/virtual-try-on
 * Uses 100% Free Hugging Face Spaces (Gradio Client) for IDM-VTON
 */
router.post('/', handleUpload, async (req, res) => {
    let tempFilePath = req.file ? req.file.path : null;

    try {
        const { category, product_image, user_image_url, garment_description } = req.body;
        
        // Smart category resolution for IDM-VTON model (dresses, lower_body, upper_body)
        const resolveCategory = (catInput, descInput) => {
            if (catInput && ['dresses', 'upper_body', 'lower_body'].includes(catInput)) {
                return catInput;
            }
            const text = `${catInput || ''} ${descInput || ''}`.toLowerCase();
            if (
                text.includes('kurta') || text.includes('kurti') || text.includes('dress') ||
                text.includes('saree') || text.includes('lehenga') || text.includes('gown') ||
                text.includes('suit') || text.includes('set')
            ) {
                return 'dresses';
            }
            if (
                text.includes('jeans') || text.includes('pant') || text.includes('trouser') ||
                text.includes('skirt') || text.includes('lower') || text.includes('bottom')
            ) {
                return 'lower_body';
            }
            return 'upper_body';
        };

        const itemCategory = resolveCategory(category, garment_description);

        let garmentImageUrl = product_image || req.body.garmentImageUrl;
        if (!garmentImageUrl) {
            return res.status(400).json({
                success: false,
                error: 'Product garment image URL is required.'
            });
        }

        // Handle relative URLs for product image
        if (garmentImageUrl && !garmentImageUrl.startsWith('http') && !garmentImageUrl.startsWith('data:')) {
            const host = req.get('host');
            const protocol = req.protocol;
            garmentImageUrl = `${protocol}://${host}${garmentImageUrl.startsWith('/') ? '' : '/'}${garmentImageUrl}`;
        }

        let userImageUrl = user_image_url || req.body.humanImageUrl;
        if (req.file) {
            userImageUrl = await getAccessibleImageUrl(req.file, req);
        }

        if (!userImageUrl && !tempFilePath) {
            return res.status(400).json({
                success: false,
                error: 'Please upload a full-body user photo or provide a valid user image URL.'
            });
        }

        let categoryPrompt = "a top, t-shirt, shirt, or upper body outfit";
        if (itemCategory === 'dresses') {
            categoryPrompt = "a full body dress, kurta set, saree, or gown";
        } else if (itemCategory === 'lower_body') {
            categoryPrompt = "pants, jeans, trousers, or lower body clothing";
        }

        const garmentPromptDescription = garment_description 
            ? `${garment_description}, ${categoryPrompt}` 
            : categoryPrompt;

        console.log(`[Virtual Try-On] Processing category: ${itemCategory} (prompt: "${categoryPrompt}")...`);

        // Dynamically import @gradio/client
        const { Client, handle_file } = await import('@gradio/client');

        // Hugging Face Public Spaces for IDM-VTON
        const hfSpaces = [
            "yisol/IDM-VTON",
            "Nymbo/Virtual-Try-On",
            "Nymbo/IDM-VTON",
            "zero-gpu-explorers/IDM-VTON",
            "wildvest/IDM-VTON",
            "kwaivgi/kling-vton"
        ];

        let resultImageUrl = null;
        let lastError = null;
        const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;

        for (const spaceName of hfSpaces) {
            try {
                console.log(`[Virtual Try-On] Connecting to Hugging Face Space: ${spaceName}...`);
                const clientOptions = {};
                if (hfToken) {
                    clientOptions.hf_token = hfToken;
                }

                const app = await Client.connect(spaceName, clientOptions);

                // Prepare file inputs for Gradio Client
                const humanImgInput = tempFilePath ? handle_file(tempFilePath) : handle_file(userImageUrl);
                const garmentImgInput = handle_file(garmentImageUrl);

                let result = null;
                try {
                    result = await app.predict("/tryon", [
                        { background: humanImgInput, layers: [], composite: null },
                        garmentImgInput,
                        garmentPromptDescription,
                        true, // is_checked
                        true, // is_checked_crop
                        30,   // denoise_steps
                        42    // seed
                    ]);
                } catch (predErr) {
                    console.warn(`[Virtual Try-On] Endpoint /tryon failed on ${spaceName}, trying index 0...`, predErr.message);
                    result = await app.predict(0, [
                        { background: humanImgInput, layers: [], composite: null },
                        garmentImgInput,
                        garmentPromptDescription,
                        true,
                        true,
                        30,
                        42
                    ]);
                }

                if (result && result.data && result.data.length > 0) {
                    const first = result.data[0];
                    if (typeof first === 'string') {
                        resultImageUrl = first;
                    } else if (first && first.url) {
                        resultImageUrl = first.url;
                    } else if (first && first.path) {
                        resultImageUrl = first.path;
                    } else if (Array.isArray(first) && first[0]) {
                        resultImageUrl = typeof first[0] === 'string' ? first[0] : (first[0].url || first[0].path);
                    }

                    if (resultImageUrl) {
                        console.log(`[Virtual Try-On] Successfully generated try-on via ${spaceName}!`);
                        break;
                    }
                }
            } catch (err) {
                console.warn(`[Virtual Try-On] Space ${spaceName} unavailable or sleeping:`, err.message || err);
                lastError = err;
            }
        }

        // If Hugging Face spaces were busy, try Replicate fallback if API token exists
        if (!resultImageUrl && process.env.REPLICATE_API_TOKEN) {
            try {
                console.log('[Virtual Try-On] Falling back to Replicate API...');
                const Replicate = require('replicate');
                const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
                const output = await replicate.run(
                    "cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985",
                    {
                        input: {
                            human_img: userImageUrl,
                            garm_img: garmentImageUrl,
                            category: itemCategory || "upper_body",
                            crop: false,
                            seed: 42
                        }
                    }
                );
                if (Array.isArray(output) && output.length > 0) {
                    const first = output[0];
                    resultImageUrl = typeof first === 'string' ? first : (first && typeof first.url === 'function' ? first.url() : String(first));
                } else if (typeof output === 'string') {
                    resultImageUrl = output;
                }
            } catch (repErr) {
                console.warn('[Virtual Try-On] Replicate fallback failed:', repErr.message);
            }
        }

        if (!resultImageUrl) {
            throw new Error('Free AI try-on servers are currently waking up from sleep. Please try again in 10-15 seconds.');
        }

        console.log('[Virtual Try-On] AI process completed successfully!');

        return res.status(200).json({
            success: true,
            result_image: resultImageUrl
        });

    } catch (error) {
        console.error('[Virtual Try-On Error]:', error.message || error);
        let userFriendlyError = error.message || 'An error occurred during AI Virtual Try-On processing.';
        if (userFriendlyError.includes('Space metadata could not be loaded') || userFriendlyError.includes('sleeping')) {
            userFriendlyError = 'Free AI Try-On servers are currently waking up. Please click "Generate Try-On" again in a few seconds.';
        }
        return res.status(500).json({
            success: false,
            error: userFriendlyError
        });
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error('Error removing temporary try-on file:', err);
            });
        }
    }
});

module.exports = router;
