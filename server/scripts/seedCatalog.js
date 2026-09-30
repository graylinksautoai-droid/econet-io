/**
 * seedCatalog.js — One-time catalog seed for the EcoNet marketplace.
 *
 * Run: node server/scripts/seedCatalog.js
 *
 * Uses the existing MONGODB_URI from server/.env.
 * Idempotent — skips products that already have the same slug.
 * Never deletes existing records.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

const productSchema = new mongoose.Schema({
  slug:       { type: String, required: true, unique: true },
  name:       { type: String, required: true },
  seller:     { type: String, required: true },
  category:   { type: String, required: true },
  description:{ type: String, default: '' },
  priceMinor: { type: Number, required: true },
  currency:   { type: String, default: 'NGN' },
  image:      { type: String, default: '' },
  stock:      { type: Number, default: null },
  active:     { type: Boolean, default: true },
  createdAt:  { type: Date, default: Date.now }
}, { collection: 'marketplace_products', versionKey: false });

const Product = mongoose.model('Product', productSchema);

const CATALOG = [
  // ── Produce ──────────────────────────────────────────────────────────
  {
    slug: 'mixed-fruits',
    name: 'Mixed Fruits',
    seller: 'EcoFarms NG',
    category: 'produce',
    description: 'Seasonal mixed fruits sourced from verified eco-farms.',
    priceMinor: 250000,   // ₦2,500
    currency: 'NGN',
    image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&q=70',
    stock: 50,
    active: true
  },
  {
    slug: 'organic-vegetables',
    name: 'Organic Vegetables',
    seller: 'GreenLeaf Farms',
    category: 'produce',
    description: 'Pesticide-free vegetables grown using sustainable methods.',
    priceMinor: 180000,   // ₦1,800
    currency: 'NGN',
    image: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=400&q=70',
    stock: 40,
    active: true
  },
  {
    slug: 'local-honey',
    name: 'Local Honey',
    seller: 'BeeFarm Nigeria',
    category: 'produce',
    description: 'Pure honey from community-owned beehives in rural Nigeria.',
    priceMinor: 350000,   // ₦3,500
    currency: 'NGN',
    image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&q=70',
    stock: 30,
    active: true
  },
  // ── Renewable energy / resilience gear ────────────────────────────────
  {
    slug: 'solar-lantern',
    name: 'Solar Lantern',
    seller: 'SunPower NG',
    category: 'renewable',
    description: 'Portable solar-charged lantern, 8 hour run time. Perfect for off-grid communities.',
    priceMinor: 1500000,  // ₦15,000
    currency: 'NGN',
    image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&q=70',
    stock: 25,
    active: true
  },
  {
    slug: 'water-purifier-tablet',
    name: 'Water Purification Tablets',
    seller: 'CleanWater Initiative',
    category: 'renewable',
    description: '50-tablet pack. Treats up to 50 litres of drinking water. NSF certified.',
    priceMinor: 80000,    // ₦800
    currency: 'NGN',
    image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&q=70',
    stock: 100,
    active: true
  },
  {
    slug: 'tree-seedling-pack',
    name: 'Tree Seedling Pack (×10)',
    seller: 'GreenNation',
    category: 'renewable',
    description: 'Ten native tree seedlings for reforestation and climate resilience missions.',
    priceMinor: 120000,   // ₦1,200
    currency: 'NGN',
    image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=70',
    stock: 200,
    active: true
  },
];

async function seed() {
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 30000 });
  console.log('Connected to Atlas');

  let inserted = 0;
  let skipped  = 0;

  for (const item of CATALOG) {
    const exists = await Product.findOne({ slug: item.slug }).lean();
    if (exists) {
      console.log(`  skip  ${item.slug}`);
      skipped++;
    } else {
      await Product.create(item);
      console.log(`  seed  ${item.slug}  ₦${(item.priceMinor / 100).toLocaleString('en-NG')}`);
      inserted++;
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} already existed.`);
  await mongoose.disconnect();
}

seed().catch((err) => { console.error(err); process.exit(1); });
