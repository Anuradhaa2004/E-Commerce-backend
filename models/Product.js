const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    category: { type: String, required: true },
    imageUrl: { type: String }, // First image as fallback
    imageUrls: { type: [String], default: [] },
    videoUrl: { type: String },
    stock: { type: Number, default: 0 }, // Stock quantity
    availableSizes: { type: [String], default: [] }, // Sizes available for the product
    availableColors: { type: [String], default: [] }, // Colors available for the product (legacy/fallback)
    colorVariants: [
        {
            colorName: { type: String, required: true },
            imageUrl: { type: String }, // Legacy/first image fallback
            imageUrls: { type: [String], default: [] } // New array for multiple images
        }
    ], // Specific images mapped to colors
    reviews: [
        {
            userName: { type: String, default: 'Anonymous' },
            rating: { type: Number, required: true },
            comment: { type: String, required: true },
            images: { type: [String], default: [] },
            createdAt: { type: Date, default: Date.now }
        }
    ],

    createdAt: { type: Date, default: Date.now }
});

productSchema.index({ category: 1, _id: -1 });

module.exports = mongoose.model('Product', productSchema);