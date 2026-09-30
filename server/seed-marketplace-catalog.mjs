/**
 * One-time marketplace catalog migration (operator tool).
 *
 * The marketplace previously served a hard-coded catalog from route code and
 * the frontend. This script persists that catalog into the
 * `marketplace_products` collection as REAL product documents.
 *
 * Safety:
 * - Runs ONLY when the collection is completely empty (no production data is
 *   ever overwritten or deleted).
 * - Idempotent via $setOnInsert.
 *
 * Usage (from the repo root):
 *   node server/seed-marketplace-catalog.mjs
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '.env') });

const { default: Product } = await import('./models/Product.js');

const CATALOG = [
  { slug: 'mixed-fruits', name: 'Mixed Fruits', seller: 'Mama Put Farms', category: 'produce', priceMinor: 250_000,
    image: 'https://res.cloudinary.com/dp9ffewdb/image/upload/v1772254703/fruit-market_1_nbn4jw.jpg', description: 'Fresh mixed fruit selection from local growers.' },
  { slug: 'fresh-tomatoes', name: 'Fresh Tomatoes', seller: 'Jos Growers', category: 'produce', priceMinor: 120_000,
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadc2b5?w=400&h=300&fit=crop&crop=entropy&auto=format', description: 'Fresh farm tomatoes.' },
  { slug: 'heirloom-tomatoes', name: 'Heirloom Tomatoes', seller: 'Green Harvest', category: 'produce', priceMinor: 180_000,
    image: 'https://images.unsplash.com/photo-1546470427-e93b291aeb52?w=400&h=300&fit=crop&crop=entropy&auto=format', description: 'Vine-ripened heirloom tomatoes.' },
  { slug: 'mixed-vegetables', name: 'Mixed Vegetables', seller: 'EcoFarms NG', category: 'produce', priceMinor: 320_000,
    image: 'https://images.unsplash.com/photo-1470438151330-544065b1b9b1?w=400&h=300&fit=crop&crop=entropy&auto=format', description: 'Organic vegetable selection.' },
  { slug: 'solar-panel-kit-300w', name: 'Solar Panel Kit 300W', seller: 'EcoSolar NG', category: 'solar', priceMinor: 8_500_000,
    image: 'https://res.cloudinary.com/dp9ffewdb/image/upload/v1772254703/solar-panel_nbn4jw.jpg', description: 'Complete solar installation kit with inverter and battery.' },
  { slug: 'mini-wind-turbine', name: 'Mini Wind Turbine', seller: 'WindPower Africa', category: 'wind', priceMinor: 12_000_000,
    image: 'https://images.unsplash.com/photo-1548919175-b3692c76253f?w=400&h=300&fit=crop&crop=entropy&auto=format', description: '500W residential wind turbine for home use.' },
  { slug: 'solar-battery-200ah', name: 'Solar Battery 200Ah', seller: 'EnergyStore NG', category: 'battery', priceMinor: 4_500_000,
    image: 'https://images.unsplash.com/photo-1584257889848-45fb9335e85a?w=400&h=300&fit=crop&crop=entropy&auto=format', description: 'Deep cycle battery for solar systems.' },
  { slug: 'led-solar-lights', name: 'LED Solar Lights', seller: 'BrightLight Africa', category: 'lighting', priceMinor: 1_500_000,
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop&crop=entropy&auto=format', description: 'Energy-efficient LED lights with solar charging.' }
];

try {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 45000 });

  const existing = await Product.countDocuments();
  if (existing > 0) {
    console.log(`[catalog] Collection already has ${existing} product(s). Nothing to do — no data was modified.`);
  } else {
    for (const p of CATALOG) {
      await Product.updateOne({ slug: p.slug }, { $setOnInsert: { ...p, currency: 'NGN', stock: null, active: true } }, { upsert: true });
    }
    console.log(`[catalog] Seeded ${CATALOG.length} marketplace products.`);
  }
} catch (err) {
  console.error('[catalog] Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
