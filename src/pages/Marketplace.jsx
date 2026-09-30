/**
 * Marketplace — real catalog + real order/payment lifecycle.
 *
 * - Products come from GET /api/marketplace/products (persisted catalog).
 *   An empty catalog renders an honest empty state — never fake merchandise.
 * - Checkout creates a PENDING order with server-computed totals.
 * - Payment goes through Paystack: the backend initializes the transaction
 *   and this page redirects to the provider's authorization URL. On return,
 *   the reference in the URL is verified SERVER-SIDE before any status is
 *   shown. A redirect alone never marks anything paid.
 */
import { useState, useEffect, useCallback } from 'react';
import { FaShoppingCart, FaTimes, FaLeaf, FaAd } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest } from '../services/api.js';

const formatNaira = (minor) => {
  const n = Number(minor);
  const safe = Number.isFinite(n) ? n : 0;
  return `₦${(safe / 100).toLocaleString('en-NG')}`;
};

const toPriceMinor = (item) => {
  if (item == null) return 0;
  // Canonical persisted catalog shape.
  if (Number.isFinite(item.priceMinor)) return Math.round(item.priceMinor);
  // Legacy numeric naira amount.
  if (typeof item.price === 'number' && Number.isFinite(item.price)) {
    return Math.round(item.price * 100);
  }
  // Legacy formatted strings such as "N2,500", "₦2,500", "2500".
  if (typeof item.price === 'string') {
    const cleaned = item.price.replace(/[^0-9.]/g, '');
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) return Math.round(parsed * 100);
  }
  return 0;
};

const lineTotalMinor = (item) => toPriceMinor(item) * (Number.isFinite(item?.quantity) ? item.quantity : 1);

function Marketplace({ user }) {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');

  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [activeTab, setActiveTab] = useState('products');
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutData, setCheckoutData] = useState({ name: '', email: '', phone: '', address: '', paymentMethod: 'card' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderResult, setOrderResult] = useState(null); // real order/payment status panel
  const [orders, setOrders] = useState(null);
  const [showOrders, setShowOrders] = useState(false);
  const [notice, setNotice] = useState('');

  const flash = (msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 4000);
  };

  // ── Load the real catalog ────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError('');
    try {
      const res = await fetch(API_ENDPOINTS.MARKETPLACE.PRODUCTS);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.message || `HTTP ${res.status}`);
      setProducts(body.data || []);
    } catch {
      setProductsError('The catalog could not be loaded. Check your connection and try again.');
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // ── Paystack return: verify the reference server-side before showing status ─
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference) return;

    // Clean the URL immediately so a refresh never re-verifies blindly.
    window.history.replaceState({}, '', window.location.pathname);

    (async () => {
      try {
        const body = await apiRequest(API_ENDPOINTS.PAYMENTS.VERIFY(reference));
        if (body.success) {
          setOrderResult({
            reference: body.data.reference,
            paymentStatus: body.data.status,
            message: body.data.status === 'PAID'
              ? 'Payment verified and settled.'
              : `Payment status: ${body.data.status}`
          });
        } else {
          setOrderResult({ reference, paymentStatus: 'FAILED', message: body.message || 'Payment could not be verified.' });
        }
      } catch (err) {
        setOrderResult({ reference, paymentStatus: 'FAILED', message: err.message || 'Payment verification failed.' });
      }
    })();
  }, []);

  // ── Cart (client-side only; authoritative pricing happens server-side) ────
  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId) => setCart(prev => prev.filter(item => item.id !== itemId));

  const cartTotalMinor = cart.reduce((sum, item) => sum + lineTotalMinor(item), 0);

  const isCheckoutValid = () =>
    checkoutData.name.trim() !== '' && checkoutData.email.trim() !== '' && cart.length > 0;

  // ── Checkout: create order → initialize payment → provider redirect ────────
  const handlePlaceOrder = async () => {
    if (!isCheckoutValid()) {
      flash('Add at least one item and provide your name and email.');
      return;
    }
    setIsProcessing(true);
    try {
      const orderRes = await apiRequest(API_ENDPOINTS.MARKETPLACE.CHECKOUT, {
        method: 'POST',
        body: JSON.stringify({
          name: checkoutData.name,
          email: checkoutData.email,
          phone: checkoutData.phone,
          address: checkoutData.address,
          paymentMethod: checkoutData.paymentMethod,
          items: cart.map(c => ({ slug: c.id, quantity: c.quantity }))
        })
      });

      if (!orderRes.success) throw new Error(orderRes.message || 'Checkout failed');
      const order = orderRes.data;
      setShowCheckout(false);

      if (checkoutData.paymentMethod === 'cash_on_delivery' || checkoutData.paymentMethod === 'cod') {
        // Cash on delivery is an offline workflow: it is recorded as PENDING
        // and never presented as a settled electronic payment.
        setCart([]);
        setOrderResult({
          orderId: order.orderId,
          paymentStatus: 'PENDING_COD',
          totalMinor: order.totalMinor,
          message: `Order placed for cash on delivery. Status: PENDING — ${formatNaira(order.totalMinor)} will be collected on delivery. This is not a paid electronic transaction.`
        });
        return;
      }

      if (!order.paymentsConfigured) {
        // Honest pending state — no fake success, no fabricated payment.
        setCart([]);
        setOrderResult({
          orderId: order.orderId,
          paymentStatus: order.status,
          totalMinor: order.totalMinor,
          message: 'Order created and saved as PENDING. Online payment is not configured on this deployment yet, so nothing has been charged. The order is visible in your order history.'
        });
        return;
      }

      const initRes = await apiRequest(API_ENDPOINTS.PAYMENTS.INITIALIZE, {
        method: 'POST',
        body: JSON.stringify({ orderId: order.orderId })
      });
      if (!initRes.success) throw new Error(initRes.message || 'Could not initialize payment');

      // Hand the customer to the provider's checkout. Status is resolved on
      // return via server-side verification — never assumed here.
      window.location.assign(initRes.data.authorizationUrl);
    } catch (error) {
      flash(error.message || 'Order processing failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const loadOrders = async () => {
    try {
      const body = await apiRequest(API_ENDPOINTS.MARKETPLACE.ORDERS);
      if (body.success) { setOrders(body.data); setShowOrders(true); }
    } catch {
      flash('Could not load your orders.');
    }
  };

  const produceItems = products.filter(p => p.category === 'produce');
  const gearItems = products.filter(p => p.category !== 'produce' && p.category !== 'advertising');
  const adItems = products.filter(p => p.category === 'advertising');

  const renderProductCard = (item) => (
    <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg transition-transform hover:scale-105 duration-300">
      <img src={item.image} alt={item.name} className="w-full h-48 sm:h-56 object-cover" />
      <div className="p-4 sm:p-5">
        <h3 className="font-bold text-base sm:text-lg text-gray-900">{item.name}</h3>
        <p className="text-xs sm:text-sm text-gray-600 mb-2">{item.seller}</p>
        <p className="text-emerald-600 font-bold text-lg sm:text-xl mb-3">{formatNaira(toPriceMinor(item))}</p>
        <button
          onClick={() => addToCart(item)}
          disabled={!item.inStock}
          className="w-full border border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white py-2 rounded-lg font-semibold text-sm sm:text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {item.inStock ? 'Add to Cart' : 'Out of Stock'}
        </button>
      </div>
    </div>
  );

  const renderCatalogSection = (items, emptyMessage) => {
    if (productsLoading) {
      return <p className="text-gray-500 py-8 text-center">Loading catalog…</p>;
    }
    if (productsError) {
      return (
        <div className="text-center py-8">
          <p className="text-red-600 mb-3">{productsError}</p>
          <button onClick={loadProducts} className="border border-emerald-600 text-emerald-600 px-4 py-2 rounded-lg">Retry</button>
        </div>
      );
    }
    if (items.length === 0) {
      return <p className="text-gray-500 py-8 text-center">{emptyMessage}</p>;
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {items.map(renderProductCard)}
      </div>
    );
  };


  return (
    <div className="eco-page eco-fade-up">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-emerald-700 mb-2">Green Marketplace</h1>
          <p className="text-gray-600">Renewable energy solutions and climate resilience products.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadOrders}
            className="border border-emerald-600 text-emerald-600 px-4 py-2 rounded-lg hover:bg-emerald-50"
          >
            My Orders
          </button>
          <button
            onClick={() => setShowCart(!showCart)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 relative"
          >
            Cart ({cart.length})
            {cart.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      {notice && (
        <div className="fixed top-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-lg z-50">{notice}</div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg">
        <button onClick={() => setActiveTab('products')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${activeTab === 'products' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          <FaLeaf className="inline w-4 h-4 mr-2" />Products
        </button>
        <button onClick={() => setActiveTab('renewable')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${activeTab === 'renewable' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          <FaShoppingCart className="inline w-4 h-4 mr-2" />Renewable Energy
        </button>
        <button onClick={() => setActiveTab('ads')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${activeTab === 'ads' ? 'bg-white text-emerald-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
          <FaAd className="inline w-4 h-4 mr-2" />Ads Center
        </button>
      </div>

      {activeTab === 'products' && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Fresh Produce</h2>
          {renderCatalogSection(produceItems, 'No produce listings are available right now.')}
        </div>
      )}

      {activeTab === 'renewable' && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Renewable Energy & Climate Resilience</h2>
          {renderCatalogSection(gearItems, 'No renewable-energy listings are available right now.')}
        </div>
      )}

      {activeTab === 'ads' && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Advertising</h2>
          {renderCatalogSection(adItems, 'No advertising products are available right now.')}
        </div>
      )}

      {/* Cart Sidebar */}
      {showCart && (
        <div className="fixed inset-0 z-[50] flex">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCart(false)}></div>
          <div className="ml-auto w-96 bg-white h-full overflow-y-auto shadow-2xl relative z-[51]">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Shopping Cart</h2>
                <button onClick={() => setShowCart(false)} className="text-gray-400 hover:text-gray-600">
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>

              {cart.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Your cart is empty</p>
              ) : (
                <>
                  <div className="space-y-4 mb-6">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center space-x-4 bg-gray-50 p-4 rounded-lg">
                        <img src={item.image} alt={item.name} className="w-16 h-16 object-cover rounded" />
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{item.name}</h3>
                          <p className="text-sm text-gray-600">{item.seller}</p>
                          <p className="text-emerald-600 font-bold">{formatNaira(toPriceMinor(item))}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium">Qty: {item.quantity}</span>
                          <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-700">
                            <FaTimes className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-lg font-semibold text-gray-900">Total:</span>
                      <span className="text-2xl font-bold text-emerald-600">{formatNaira(cartTotalMinor)}</span>
                    </div>
                    <button
                      className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 font-semibold"
                      onClick={() => { setShowCheckout(true); setShowCart(false); }}
                    >
                      Proceed to Checkout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-[40] flex">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowCheckout(false)}></div>
          <div className="ml-auto w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl relative z-[41]">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Checkout</h2>
                <button onClick={() => setShowCheckout(false)} className="text-gray-400 hover:text-gray-600">
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    {cart.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                        <div className="flex items-center space-x-3">
                          <img src={item.image} alt={item.name} className="w-12 h-12 object-cover rounded" />
                          <div>
                            <h4 className="font-medium text-gray-900">{item.name}</h4>
                            <p className="text-sm text-gray-600">{item.seller}</p>
                            <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-emerald-600">{formatNaira(lineTotalMinor(item))}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-4">
                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between items-center text-sm text-gray-600">
                        <span>Subtotal</span>
                        <span>{formatNaira(cartTotalMinor)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          Platform fee (30%)
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">EcoNet</span>
                        </span>
                        <span>{formatNaira(Math.floor(cartTotalMinor * 30 / 100))}</span>
                      </div>
                      <div className="flex justify-between items-center font-semibold text-gray-900 border-t pt-2">
                        <span className="text-lg">You pay</span>
                        <span className="text-2xl text-emerald-600">{formatNaira(cartTotalMinor)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      The 30% platform fee is included in the listed prices and retained by EcoNet. Final totals are computed server-side from the catalog.
                    </p>
                  </div>
                </div>


                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Shipping & Payment</h3>
                  <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handlePlaceOrder(); }}>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input type="text" value={checkoutData.name}
                        onChange={(e) => setCheckoutData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input type="email" value={checkoutData.email}
                        onChange={(e) => setCheckoutData(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input type="tel" value={checkoutData.phone}
                        onChange={(e) => setCheckoutData(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
                      <textarea rows={3} value={checkoutData.address}
                        onChange={(e) => setCheckoutData(prev => ({ ...prev, address: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Payment method</label>
                      <select value={checkoutData.paymentMethod}
                        onChange={(e) => setCheckoutData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500">
                        <option value="card">Card (Paystack)</option>
                        <option value="bank_transfer">Bank transfer (Paystack)</option>
                        <option value="cash_on_delivery">Cash on delivery (pay on receipt)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {checkoutData.paymentMethod === 'cash_on_delivery'
                          ? 'Cash on delivery keeps the order PENDING. Nothing is charged online; payment is collected on delivery.'
                          : 'Card and bank transfer are processed by Paystack. You will be redirected to the secure provider page — your order is only confirmed after the provider verifies the payment.'}
                      </p>
                    </div>
                    <button type="submit" disabled={isProcessing}
                      className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 font-semibold disabled:opacity-60">
                      {isProcessing ? 'Processing…' : checkoutData.paymentMethod === 'cash_on_delivery' ? 'Place Order' : 'Continue to Payment'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Real order / payment status panel */}
      {orderResult && (
        <div className="fixed inset-0 z-[30] flex">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setOrderResult(null)}></div>
          <div className="ml-auto w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl relative z-[31]">
            <div className="p-6">
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${orderResult.paymentStatus === 'PAID' ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${orderResult.paymentStatus === 'PAID' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0L8.586 13H7a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8a1 1 0 00-.707.293l7-7a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {orderResult.paymentStatus === 'PAID' ? 'Payment Verified' : `Order: ${orderResult.paymentStatus}`}
                </h2>
                <p className="text-gray-600 mb-4">{orderResult.message}</p>
                <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                  {orderResult.orderId && (
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-500">Order ID:</span>
                      <span className="font-mono font-semibold text-emerald-600">{orderResult.orderId}</span>
                    </div>
                  )}
                  {orderResult.reference && (
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-500">Payment Ref:</span>
                      <span className="font-mono font-semibold text-emerald-600">{orderResult.reference}</span>
                    </div>
                  )}
                  {orderResult.totalMinor != null && (
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-500">Total:</span>
                      <span className="font-semibold text-gray-900">{formatNaira(orderResult.totalMinor)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status:</span>
                    <span className="font-medium text-gray-900">{orderResult.paymentStatus}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <button onClick={() => setOrderResult(null)}
                    className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 font-medium">
                    Continue Shopping
                  </button>
                  <button onClick={loadOrders}
                    className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 font-medium">
                    View My Orders
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Order history */}
      {showOrders && (
        <div className="fixed inset-0 z-[30] flex">
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowOrders(false)}></div>
          <div className="ml-auto w-full max-w-lg bg-white h-full overflow-y-auto shadow-2xl relative z-[31]">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">My Orders</h2>
                <button onClick={() => setShowOrders(false)} className="text-gray-400 hover:text-gray-600">
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>
              {!orders ? (
                <p className="text-gray-500">Loading…</p>
              ) : orders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">You have no orders yet.</p>
              ) : (
                <div className="space-y-3">
                  {orders.map((o) => (
                    <div key={o.orderId} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-sm font-semibold text-emerald-700">{o.orderId}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${o.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : o.status === 'REFUNDED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {o.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{o.items.map(i => `${i.name} ×${i.quantity}`).join(', ')}</p>
                      <p className="text-gray-900 font-semibold mt-1">{formatNaira(o.totalMinor)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Marketplace;

