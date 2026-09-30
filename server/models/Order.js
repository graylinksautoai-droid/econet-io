/**
 * Order — marketplace order with a canonical payment lifecycle.
 *
 * Lifecycle: PENDING → PAYMENT_REQUIRED → PAID | FAILED | CANCELLED | REFUNDED
 *
 * - PENDING:           created, payment not yet initialized.
 * - PAYMENT_REQUIRED:  payment initialized, awaiting provider completion.
 * - PAID:              settled only AFTER provider verification + settlement.
 * - FAILED:            payment failed or verification failed.
 * - CANCELLED:         abandoned/expired before settlement.
 * - REFUNDED:          settled then reversed via the canonical refund path.
 *
 * Amounts are INTEGER MINOR UNITS (kobo) computed server-side from the
 * persisted Product catalog — never from client-submitted totals.
 */
import mongoose from 'mongoose';

export const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED'
});

const orderItemSchema = new mongoose.Schema({
  productSlug: { type: String, required: true },
  name: { type: String, required: true },
  unitPriceMinor: { type: Number, required: true, min: 1 },
  quantity: { type: Number, required: true, min: 1 },
  lineTotalMinor: { type: Number, required: true, min: 1 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  items: { type: [orderItemSchema], required: true },
  currency: { type: String, required: true, enum: ['NGN'], default: 'NGN' },
  subtotalMinor: { type: Number, required: true, min: 1 },
  platformFeeMinor: { type: Number, required: true, min: 0, default: 0 },
  feeRateBps: { type: Number, required: true, min: 0, default: 0 },
  totalMinor: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    required: true,
    enum: Object.values(ORDER_STATUS),
    default: ORDER_STATUS.PENDING,
    index: true
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['card', 'bank_transfer', 'cash_on_delivery'],
    default: 'card',
    index: true
  },
  paymentRef: { type: String, default: null, index: true },
  paidAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, immutable: true }
}, {
  collection: 'marketplace_orders',
  versionKey: false,
  timestamps: false
});

export default mongoose.model('Order', orderSchema);
