require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const Product = require('../models/Product');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';

async function migrateProducts() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB.');

        const products = await Product.find({});
        console.log(`Found ${products.length} products to migrate.`);

        let updatedCount = 0;

        for (const product of products) {
            let needsUpdate = false;
            let qImages = [];
            if (product.imageUrls && product.imageUrls.length > 0) {
                qImages = product.imageUrls;
            } else if (product.imageUrl) {
                qImages = [product.imageUrl];
            }

            if (!product.colorVariants || product.colorVariants.length === 0) {
                if (product.availableColors && product.availableColors.length > 0) {
                    const newVariants = [];
                    const numColors = product.availableColors.length;
                    const imagesPerColor = Math.ceil(qImages.length / numColors);

                    product.availableColors.forEach((color, index) => {
                        const start = index * imagesPerColor;
                        const end = Math.min(start + imagesPerColor, qImages.length);
                        const slicedImages = qImages.slice(start, end);

                        newVariants.push({
                            colorName: color,
                            imageUrl: slicedImages.length > 0 ? slicedImages[0] : '',
                            imageUrls: slicedImages
                        });
                    });

                    product.colorVariants = newVariants;
                    needsUpdate = true;
                }
            } else {
                let updatedVariants = false;
                const numColors = product.colorVariants.length;
                const imagesPerColor = Math.ceil(qImages.length / numColors);

                product.colorVariants.forEach((variant, index) => {
                    if (!variant.imageUrls || variant.imageUrls.length === 0) {
                        const start = index * imagesPerColor;
                        const end = Math.min(start + imagesPerColor, qImages.length);
                        const slicedImages = qImages.slice(start, end);

                        variant.imageUrls = slicedImages;
                        if (!variant.imageUrl && slicedImages.length > 0) {
                            variant.imageUrl = slicedImages[0];
                        }
                        updatedVariants = true;
                    }
                });

                if (updatedVariants) {
                    product.markModified('colorVariants');
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                await product.save();
                updatedCount++;
                console.log(`Migrated product: ${product.name} (${product._id})`);
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} products.`);
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        mongoose.disconnect();
    }
}

migrateProducts();
