/**
 * Marketplace routes — persisted catalog + orders with a real payment lifecycle.
 *
 * - Products come from the `marketplace_products` collection. If the catalog
 *   is empty the endpoint returns an empty list (honest empty state) — never
 *   fabricated merchandise.
 * - Checkout validates items against the persisted catalog and computes
 *   subtotal/fee/total server-side in integer minor units (kobo).
 *   Client-submitted prices/totals are IGNORED.
 * - A created order is PENDING. It becomes PAID only through the canonical
 *   payment settlement path (services/payments/settlementService.js) after
 *   provider verification. This route never marks an order paid.
 */
import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';
import Product from '../models/Product.js';
import Order, { ORDER_STATUS } from '../models/Order.js';
import { paymentConfig, splitFee } from '../services/payments/paymentConfig.js';

const router = express.Router();
const isMongoReady = () => mongoose.connection.readyState === 1;

const publicProduct = (p) => ({
  id: p.slug,
  name: p.name,
  seller: p.seller,
  category: p.category,
  description: p.description,
  image: p.image,
  inStock: p.stock == null ? true : p.stock > 0,
  // Display fields derived from the authoritative minor-unit price.
  priceMinor: p.priceMinor,
  currency: p.currency,
  price: `NGN ${(p.priceMinor / 100).toLocaleString('en-NG')}`
});

// List active catalog products
router.get('/products', async (req, res) => {
  if (!isMongoReady()) {
    // Return an honest empty catalog rather than hanging
    return res.json({ success: true, data: [], _unavailable: true, message: 'Catalog temporarily unavailable — database not connected' });
  }
  const t = setTimeout(() => {
    if (!res.headersSent) res.json({ success: true, data: [], _unavailable: true, message: 'Catalog request timed out' });
  }, 8000);
  try {
    const products = await Product.find({ active: true }).sort({ createdAt: 1 }).lean();
    clearTimeout(t);
    if (!res.headersSent) res.json({ success: true, data: products.map(publicProduct) });
  } catch (error) {
    clearTimeout(t);
    console.error('Error fetching products:', error);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

// Create an order from catalog items. Amounts are computed server-side.
router.post('/checkout', protect, async (req, res) => {
  if (!isMongoReady()) {
    return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE', message: 'Checkout unavailable: database not connected' });
  }
  try {
    const { name, email, phone = '', address = '', paymentMethod = 'card', items } = req.body || {};

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Name and email are required' });
    }
    const normalizedPaymentMethod = paymentMethod === 'cod' ? 'cash_on_delivery' : paymentMethod;
    if (!['card', 'bank_transfer', 'cash_on_delivery'].includes(normalizedPaymentMethod)) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Unsupported payment method' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'At least one item is required' });
    }
    if (items.length > 50) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Too many items' });
    }

    // Resolve every line against the persisted catalog.
    const slugs = items.map(i => String(i.slug || i.id || ''));
    const products = await Product.find({ slug: { $in: slugs }, active: true }).lean();
    const bySlug = new Map(products.map(p => [p.slug, p]));

    const lines = [];
    for (const item of items) {
      const slug = String(item.slug || item.id || '');
      const product = bySlug.get(slug);
      if (!product) {
        return res.status(404).json({ success: false, code: 'PRODUCT_NOT_FOUND', message: `Unknown or inactive product: ${slug}` });
      }
      const quantity = Number.parseInt(item.quantity, 10);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: `Invalid quantity for ${slug}` });
      }
      if (product.stock != null && product.stock < quantity) {
        return res.status(409).json({ success: false, code: 'OUT_OF_STOCK', message: `Insufficient stock for ${product.name}` });
      }
      lines.push({
        productSlug: product.slug,
        name: product.name,
        unitPriceMinor: product.priceMinor,
        quantity,
        lineTotalMinor: product.priceMinor * quantity
      });
    }

    const subtotalMinor = lines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
    const fee = splitFee(subtotalMinor);

    // DEV_AUTH users have string IDs (e.g. 'dev_grinder_1') that cannot be
    // cast to MongoDB ObjectId. Use a sentinel ObjectId so the order is still
    // persisted; the buyer field is informational only for DEV_AUTH sessions.
    const isDevUser = !mongoose.Types.ObjectId.isValid(String(req.user._id));
    const buyerId   = isDevUser
      ? new mongoose.Types.ObjectId('000000000000000000000001')
      : req.user._id;

    const order = await Order.create({
      orderId: `ECO-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      buyer: buyerId,
      customer: { name: name.trim(), email: email.trim().toLowerCase(), phone, address },
      items: lines,
      currency: paymentConfig.currency,
      paymentMethod: normalizedPaymentMethod,
      subtotalMinor,
      platformFeeMinor: fee.feeMinor,
      feeRateBps: fee.feeRateBps,
      // The customer pays the gross subtotal; the fee is the platform's share OF it.
      // Cash on delivery stays PENDING (offline) and is never marked PAID here.
      totalMinor: subtotalMinor,
      status: ORDER_STATUS.PENDING
    });

    return res.status(201).json({
      success: true,
      message: normalizedPaymentMethod === 'cash_on_delivery'
        ? 'Order created — cash on delivery (PENDING, pay on receipt)'
        : 'Order created — payment required',
      data: {
        orderId: order.orderId,
        status: order.status,
        currency: order.currency,
        paymentMethod: order.paymentMethod,
        subtotalMinor: order.subtotalMinor,
        platformFeeMinor: order.platformFeeMinor,
        feeRateBps: order.feeRateBps,
        totalMinor: order.totalMinor,
        paymentsConfigured: paymentConfig.configured
      }
    });
  } catch (error) {
    console.error('Error processing checkout:', error);
    res.status(500).json({ success: false, message: 'Failed to process checkout' });
  }
});

// Buyer's own orders
router.get('/orders', protect, async (req, res) => {
  try {
    const isDevUser = !mongoose.Types.ObjectId.isValid(String(req.user._id));
    const buyerId   = isDevUser
      ? new mongoose.Types.ObjectId('000000000000000000000001')
      : req.user._id;
    const orders = await Order.find({ buyer: buyerId }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({
      success: true,
      data: orders.map(o => ({
        orderId: o.orderId,
        status: o.status,
        currency: o.currency,
        paymentMethod: o.paymentMethod || 'card',
        totalMinor: o.totalMinor,
        platformFeeMinor: o.platformFeeMinor,
        items: o.items,
        paymentRef: o.paymentRef,
        createdAt: o.createdAt,
        paidAt: o.paidAt
      }))
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

export default router;
