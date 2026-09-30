/**
 * Product — persisted marketplace catalog item.
 *
 * Replaces the previously hard-coded in-route catalog. Prices are INTEGER
 * MINOR UNITS (kobo). A product with `active: false` is not purchasable.
 */
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  seller: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, default: '' },
  priceMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, enum: ['NGN'], default: 'NGN' },
  image: { type: String, default: '' },
  stock: { type: Number, default: null }, // null = not stock-tracked
  active: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, {
  collection: 'marketplace_products',
  versionKey: false,
  timestamps: false
});

export default mongoose.model('Product', productSchema);
