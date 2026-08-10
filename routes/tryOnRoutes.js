const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const FormData = require('form-data');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Smart Category Detector powered by Google Gemini Vision API
 * Detects whether garment is 'upper_body', 'lower_body', or 'dresses'
 */
const detectCategoryWithGemini = async (garmentImageUrl, productCategory, productName) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `Analyze this fashion garment product.
Product Name: "${productName || ''}"
Product Category: "${productCategory || ''}"

Classify this item into EXACTLY ONE of these three categories for AI virtual try-on:
1. "dresses" (Use for full-body outfits like dresses, kurta sets, kurtis, gowns, sarees, lehengas, suits, or two-piece sets).
2. "lower_body" (Use for bottoms like pants, jeans, trousers, skirts, shorts, or lower-body clothing).
3. "upper_body" (Use for tops, shirts, t-shirts, blouses, jackets, or upper-body clothing).

REPLY ONLY WITH ONE EXACT WORD: either "dresses", "lower_body", or "upper_body". Do NOT add punctuation or extra words.`;

        let imagePart = null;

        if (garmentImageUrl && garmentImageUrl.startsWith('data:image/')) {
            const matches = garmentImageUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
            if (matches) {
                imagePart = {
                    inlineData: {
                        mimeType: matches[1],
                        data: matches[2]
                    }
                };
            }
        } else if (garmentImageUrl && garmentImageUrl.startsWith('http')) {
            try {
                const response = await fetch(garmentImageUrl);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                const mimeType = response.headers.get('content-type') || 'image/jpeg';
                imagePart = {
                    inlineData: {
                        mimeType,
                        data: buffer.toString('base64')
                    }
                };
            } catch (fetchErr) {
                console.warn('[Gemini Vision] Fetch image buffer failed:', fetchErr.message);
            }
        }

        const contents = imagePart ? [prompt, imagePart] : [prompt];
        const result = await model.generateContent(contents);
        const rawText = result.response.text().trim().toLowerCase();

        console.log(`[Gemini Smart Detector] Output: "${rawText}"`);

        if (rawText.includes('dresses')) return 'dresses';
        if (rawText.includes('lower_body') || rawText.includes('lower body')) return 'lower_body';
        if (rawText.includes('upper_body') || rawText.includes('upper body')) return 'upper_body';

    } catch (geminiErr) {
        console.warn('[Gemini Smart Detector Warning]:', geminiErr.message || geminiErr);
    }
    return null;
};

/**
 * Handler for POST /api/enhanced-try-on
 * Analyzes posture and garment with Gemini Vision to generate an enhanced fabric draping prompt,
 * then forwards request to the original try-on model at http://localhost:5000/api/virtual-try-on.
 */
const handleEnhancedTryOn = async (req, res) => {
    let tempFilePath = req.file ? req.file.path : null;

    try {
        const { category, product_image_url, product_image, product_name, user_image_url } = req.body;
        const garmentImageUrl = product_image_url || product_image;

        if (!garmentImageUrl) {
            return res.status(400).json({
                success: false,
                error: 'Product garment image URL is required.'
            });
        }

        let userImageUrl = user_image_url;
        if (req.file) {
            userImageUrl = await getAccessibleImageUrl(req.file, req);
        }

        if (!userImageUrl && !tempFilePath) {
            return res.status(400).json({
                success: false,
                error: 'Please upload a full-body user photo.'
            });
        }

        // 1. Analyze posture & garment with Gemini Vision API
        let enhancedDescription = `${product_name || ''} ${category || ''}`.trim();
        const apiKey = process.env.GEMINI_API_KEY;

        if (apiKey) {
            try {
                console.log('[Enhanced Try-On] Analyzing user posture & garment with Gemini Vision AI...');
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

                const prompt = `Analyze this person's posture, body shape, shoulders, and waist line in the user photo.
Garment Product Name: "${product_name || 'Fashion Item'}"
Garment Category: "${category || 'upper_body'}"

Write a highly detailed, realistic text prompt describing exactly how this ${product_name || 'garment'} should realistically drape, fit, fold, crease, and contour around this person's body posture, shoulders, waist, and arms. Include natural fabric weight, folds, and realistic textures matching their exact posture. Keep it concise (under 80 words).`;

                let imagePart = null;
                if (req.file) {
                    const fileBuffer = fs.readFileSync(req.file.path);
                    const mimeType = req.file.mimetype || 'image/jpeg';
                    imagePart = {
                        inlineData: {
                            mimeType: mimeType,
                            data: fileBuffer.toString('base64')
                        }
                    };
                } else if (userImageUrl && userImageUrl.startsWith('data:image/')) {
                    const matches = userImageUrl.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
                    if (matches) {
                        imagePart = {
                            inlineData: {
                                mimeType: matches[1],
                                data: matches[2]
                            }
                        };
                    }
                } else if (userImageUrl && userImageUrl.startsWith('http')) {
                    try {
                        const imgRes = await fetch(userImageUrl);
                        const arrBuf = await imgRes.arrayBuffer();
                        const buf = Buffer.from(arrBuf);
                        const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
                        imagePart = {
                            inlineData: {
                                mimeType,
                                data: buf.toString('base64')
                            }
                        };
                    } catch (e) {
                        console.warn('[Enhanced Try-On] Fetch user image buffer failed:', e.message);
                    }
                }

                const contents = imagePart ? [prompt, imagePart] : [prompt];
                const geminiResult = await model.generateContent(contents);
                const rawDescription = geminiResult.response.text().trim();

                if (rawDescription) {
                    enhancedDescription = rawDescription;
                    console.log(`[Enhanced Try-On] ✨ Gemini Vision generated enhanced prompt:\n"${enhancedDescription}"`);
                }
            } catch (geminiErr) {
                console.warn('[Enhanced Try-On] Gemini Vision prompt generation warning:', geminiErr.message || geminiErr);
            }
        }

        // 2. Forward original user_image, product_image, category, and enhanced description to original model
        const port = process.env.PORT || 5000;
        const originalEndpoint = `http://localhost:${port}/api/virtual-try-on`;

        console.log(`[Enhanced Try-On] Forwarding request to original try-on model at ${originalEndpoint}...`);

        const formData = new FormData();
        if (req.file) {
            formData.append('user_image', fs.createReadStream(req.file.path), {
                filename: req.file.originalname || 'user_photo.jpg',
                contentType: req.file.mimetype || 'image/jpeg'
            });
        } else if (user_image_url) {
            formData.append('user_image_url', user_image_url);
        }

        formData.append('product_image', garmentImageUrl);
        formData.append('category', category || 'upper_body');
        formData.append('garment_description', enhancedDescription);
        if (product_name) {
            formData.append('product_name', product_name);
        }

        const response = await axios.post(originalEndpoint, formData, {
            headers: {
                ...formData.getHeaders()
            },
            timeout: 120000
        });

        // 3. Return final generated image response back to React frontend
        return res.status(200).json(response.data);

    } catch (error) {
        console.error('[Enhanced Try-On Error]:', error.response?.data || error.message || error);
        return res.status(error.response?.status || 500).json({
            success: false,
            error: error.response?.data?.error || error.message || 'Enhanced Virtual Try-On failed.'
        });
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error('Error removing temporary try-on file:', err);
            });
        }
    }
};

router.post('/enhanced-try-on', handleUpload, handleEnhancedTryOn);

/**
 * POST /api/virtual-try-on
 * Uses 100% Free Hugging Face Spaces (Gradio Client) for IDM-VTON
 */
router.post('/', handleUpload, async (req, res) => {
    if (req.baseUrl.includes('enhanced-try-on') || req.path.includes('enhanced')) {
        return handleEnhancedTryOn(req, res);
    }
    let tempFilePath = req.file ? req.file.path : null;

    try {
        const { category, product_image, user_image_url, garment_description } = req.body;
        
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

        // 1. Smart Category Detection via Gemini Vision API (if GEMINI_API_KEY set)
        let itemCategory = category;
        if (process.env.GEMINI_API_KEY) {
            console.log('[Virtual Try-On] Invoking Google Gemini Vision for Smart Category Detection...');
            const geminiCategory = await detectCategoryWithGemini(garmentImageUrl, category, garment_description);
            if (geminiCategory) {
                itemCategory = geminiCategory;
                console.log(`[Virtual Try-On] ✨ Gemini Vision AI detected category: "${itemCategory}"`);
            }
        }

        // 2. Keyword fallback if Gemini didn't return a category
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

        if (!itemCategory || !['dresses', 'upper_body', 'lower_body'].includes(itemCategory)) {
            itemCategory = resolveCategory(category, garment_description);
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

                // Crop human image ONLY for upper_body tops. For dresses/kurtis and lower_body, keep false for full-body try-on!
                const isCropHuman = itemCategory === 'upper_body';

                let result = null;
                try {
                    result = await app.predict("/tryon", [
                        { background: humanImgInput, layers: [], composite: null },
                        garmentImgInput,
                        garmentPromptDescription,
                        true, // is_checked (garment parsing)
                        isCropHuman, // is_checked_crop (false for dresses/kurtis to fit full body!)
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
                        isCropHuman,
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
