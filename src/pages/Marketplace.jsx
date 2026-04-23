import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import { FaShoppingCart, FaTimes, FaPlus, FaMinus, FaTrash } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest } from '../services/api.js';
import { FaSolarPanel, FaWind, FaBatteryFull, FaLightbulb, FaLeaf, FaAd, FaChartLine, FaCoins } from "react-icons/fa";

function Marketplace({ user, onLogout, onNavigate }) {
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [activeTab, setActiveTab] = useState('products');
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutData, setCheckoutData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    paymentMethod: 'card'
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderId, setOrderId] = useState('');

  // Static product data (same as in Dashboard)
  const marketplaceImages = [
    { id: 1, src: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&h=300&fit=crop&crop=entropy&auto=format", alt: "Vibrant fruit market display", name: "Mixed Fruits", price: "N2,500", seller: "Mama Put Farms" },
    { id: 2, src: "https://images.unsplash.com/photo-1592924357228-91a4daadc2b5?w=400&h=300&fit=crop&crop=entropy&auto=format", alt: "Fresh red tomatoes", name: "Fresh Tomatoes", price: "N1,200", seller: "Jos Growners" },
    { id: 3, src: "https://images.unsplash.com/photo-1546470427-e93b291aeb52?w=400&h=300&fit=crop&crop=entropy&auto=format", alt: "Ripe tomatoes on vine", name: "Heirloom Tomatoes", price: "N1,800", seller: "Green Harvest" },
    { id: 4, src: "https://images.unsplash.com/photo-1470438151330-544065b1b9b1?w=400&h=300&fit=crop&crop=entropy&auto=format", alt: "Organic vegetable harvest", name: "Mixed Vegetables", price: "N3,200", seller: "EcoFarms NG" },
  ];

  // Renewable energy products
  const renewableProducts = [
    { 
      id: 5, 
      src: "https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&h=300&fit=crop&crop=entropy&auto=format", 
      alt: "Solar panel system", 
      name: "Solar Panel Kit 300W", 
      price: "85,000", 
      seller: "EcoSolar NG",
      category: "solar",
      description: "Complete solar installation kit with inverter and battery"
    },
    { 
      id: 6, 
      src: "https://images.unsplash.com/photo-1548919175-b3692c76253f?w=400&h=300&fit=crop&crop=entropy&auto=format", 
      alt: "Wind turbine", 
      name: "Mini Wind Turbine", 
      price: "120,000", 
      seller: "WindPower Africa",
      category: "wind",
      description: "500W residential wind turbine for home use"
    },
    { 
      id: 7, 
      src: "https://images.unsplash.com/photo-1584257889848-45fb9335e85a?w=400&h=300&fit=crop&crop=entropy&auto=format", 
      alt: "Solar battery system", 
      name: "Solar Battery 200Ah", 
      price: "45,000", 
      seller: "EnergyStore NG",
      category: "battery",
      description: "Deep cycle battery for solar systems"
    },
    { 
      id: 8, 
      src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop&crop=entropy&auto=format", 
      alt: "LED lighting system", 
      name: "LED Solar Lights", 
      price: "15,000", 
      seller: "BrightLight Africa",
      category: "lighting",
      description: "Energy-efficient LED lights with solar charging"
    },
  ];

  // Ads center data
  const adsData = [
    {
      id: 1,
      title: "Premium Banner Ad",
      price: "5,000",
      duration: "1 week",
      impressions: "10,000",
      description: "Top banner placement on dashboard",
      type: "banner"
    },
    {
      id: 2,
      title: "Sidebar Promotion",
      price: "3,000",
      duration: "1 week",
      impressions: "5,000",
      description: "Right sidebar promotion space",
      type: "sidebar"
    },
    {
      id: 3,
      title: "Feed Integration",
      price: "8,000",
      duration: "1 week",
      impressions: "15,000",
      description: "Sponsored posts in environmental feed",
      type: "feed"
    }
  ];

  const addToCart = (item) => {
    setCart(prev => {
      const existingItem = prev.find(cartItem => cartItem.id === item.id);
      if (existingItem) {
        return prev.map(cartItem =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const getTotalPrice = () => {
    return cart.reduce((total, item) => {
      const price = parseInt(item.price.replace(/[^\d]/g, ''));
      return total + (price * item.quantity);
    }, 0);
  };

  const isCheckoutValid = () => {
    return (
      checkoutData.name.trim() !== '' &&
      checkoutData.email.trim() !== '' &&
      checkoutData.phone.trim() !== '' &&
      checkoutData.address.trim() !== '' &&
      cart.length > 0
    );
  };

  const handlePlaceOrder = async () => {
    if (!isCheckoutValid()) {
      alert('Please fill in all required fields and add items to cart');
      return;
    }

    setIsProcessing(true);
    
    try {
      const orderData = {
        name: checkoutData.name,
        email: checkoutData.email,
        phone: checkoutData.phone,
        address: checkoutData.address,
        paymentMethod: checkoutData.paymentMethod,
        items: cart,
        total: getTotalPrice()
      };

      const response = await apiRequest(API_ENDPOINTS.MARKETPLACE.CHECKOUT, {
        method: 'POST',
        body: JSON.stringify(orderData)
      });

      if (response.success) {
        setOrderId(response.data.orderId);
        setOrderPlaced(true);
        setCart([]);
        setShowCheckout(false);
        
        // Show success feedback
        const successMessage = document.createElement('div');
        successMessage.className = 'fixed top-4 right-4 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        successMessage.textContent = 'Order placed successfully!';
        document.body.appendChild(successMessage);
        
        setTimeout(() => {
          document.body.removeChild(successMessage);
        }, 3000);
      }
      
    } catch (error) {
      console.error('Order processing failed:', error);
      alert('Order processing failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MainLayout user={user} onLogout={onLogout} onNavigate={onNavigate}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-emerald-700 mb-2">Green Marketplace</h1>
            <p className="text-gray-600">Renewable energy solutions and climate resilience products.</p>
          </div>
          
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

        {/* Tabs */}
        <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              activeTab === 'products' 
                ? 'bg-white text-emerald-700 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FaLeaf className="inline w-4 h-4 mr-2" />
            Products
          </button>
          <button
            onClick={() => setActiveTab('renewable')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              activeTab === 'renewable' 
                ? 'bg-white text-emerald-700 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FaSolarPanel className="inline w-4 h-4 mr-2" />
            Renewable Energy
          </button>
          <button
            onClick={() => setActiveTab('ads')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              activeTab === 'ads' 
                ? 'bg-white text-emerald-700 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FaAd className="inline w-4 h-4 mr-2" />
            Ads Center
          </button>
        </div>

        {/* Products Tab */}
        {activeTab === 'products' && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Fresh Produce</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {marketplaceImages.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg transition-transform hover:scale-105 duration-300">
                  <img src={item.src} alt={item.alt} className="w-full h-48 sm:h-56 object-cover" />
                  <div className="p-4 sm:p-5">
                    <h3 className="font-bold text-base sm:text-lg text-gray-900">{item.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-600 mb-2">{item.seller}</p>
                    <p className="text-emerald-600 font-bold text-lg sm:text-xl mb-3">{item.price}</p>
                    <button 
                      onClick={() => addToCart(item)}
                      className="w-full border border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white py-2 rounded-lg font-semibold text-sm sm:text-base transition-colors"
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Renewable Energy Tab */}
        {activeTab === 'renewable' && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Renewable Energy & Climate Resilience</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {renewableProducts.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg transition-transform hover:scale-105 duration-300">
                  <img src={item.src} alt={item.alt} className="w-full h-48 sm:h-56 object-cover" />
                  <div className="p-4 sm:p-5">
                    <div className="flex items-center mb-2">
                      {item.category === 'solar' && <FaSolarPanel className="w-5 h-5 text-yellow-500 mr-2" />}
                      {item.category === 'wind' && <FaWind className="w-5 h-5 text-blue-500 mr-2" />}
                      {item.category === 'battery' && <FaBatteryFull className="w-5 h-5 text-green-500 mr-2" />}
                      {item.category === 'lighting' && <FaLightbulb className="w-5 h-5 text-purple-500 mr-2" />}
                      <span className="text-xs text-gray-500 capitalize">{item.category}</span>
                    </div>
                    <h3 className="font-bold text-base sm:text-lg text-gray-900">{item.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-600 mb-2">{item.seller}</p>
                    <p className="text-xs text-gray-500 mb-3">{item.description}</p>
                    <p className="text-emerald-600 font-bold text-lg sm:text-xl mb-3">N{item.price}</p>
                    <button 
                      onClick={() => addToCart(item)}
                      className="w-full border border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white py-2 rounded-lg font-semibold text-sm sm:text-base transition-colors"
                    >
                      Add to Cart
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ads Center Tab */}
        {activeTab === 'ads' && (
          <div>
            <div className="flex items-center mb-4">
              <FaChartLine className="w-6 h-6 text-emerald-600 mr-2" />
              <h2 className="text-xl font-semibold text-gray-900">Ads Center & Monetization</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {adsData.map((ad) => (
                <div key={ad.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg">
                  <div className="bg-gradient-to-r from-emerald-500 to-blue-600 p-4">
                    <div className="flex items-center text-white">
                      <FaAd className="w-8 h-8 mr-3" />
                      <div>
                        <h3 className="font-bold text-lg">{ad.title}</h3>
                        <p className="text-sm opacity-90">{ad.type}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-gray-600 mb-4">{ad.description}</p>
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Price:</span>
                        <span className="font-semibold text-emerald-600">N{ad.price}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Duration:</span>
                        <span className="font-medium">{ad.duration}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Impressions:</span>
                        <span className="font-medium">{ad.impressions}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => addToCart(ad)}
                      className="w-full bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 font-semibold transition-colors flex items-center justify-center"
                    >
                      <FaCoins className="w-4 h-4 mr-2" />
                      Purchase Ad Space
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cart Sidebar */}
        {showCart && (
          <div className="fixed inset-0 z-[50] flex">
            <div 
              className="fixed inset-0 bg-black/30 backdrop-blur-sm" 
              onClick={() => setShowCart(false)}
            ></div>
            <div className="ml-auto w-96 bg-white h-full overflow-y-auto shadow-2xl transform transition-transform duration-300 ease-in-out relative z-[51]">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Shopping Cart</h2>
                  <button
                    onClick={() => setShowCart(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
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
                          <img src={item.src} alt={item.alt} className="w-16 h-16 object-cover rounded" />
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{item.name}</h3>
                            <p className="text-sm text-gray-600">{item.seller}</p>
                            <p className="text-emerald-600 font-bold">{item.price}</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium">Qty: {item.quantity}</span>
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <FaTimes className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-lg font-semibold text-gray-900">Total:</span>
                        <span className="text-2xl font-bold text-emerald-600">
                          {getTotalPrice().toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
                        </span>
                      </div>
                      
                      <button
                        className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 font-semibold"
                        onClick={() => {
                          setShowCheckout(true);
                          setShowCart(false);
                        }}
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
            <div 
              className="fixed inset-0 bg-black/20 backdrop-blur-sm" 
              onClick={() => setShowCheckout(false)}
            ></div>
            <div className="ml-auto w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl transform transition-transform duration-300 ease-in-out relative z-[41]">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Checkout</h2>
                  <button
                    onClick={() => setShowCheckout(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <FaTimes className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Order Summary */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      {cart.map((item) => (
                        <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                          <div className="flex items-center space-x-3">
                            <img src={item.src} alt={item.alt} className="w-12 h-12 object-cover rounded" />
                            <div>
                              <h4 className="font-medium text-gray-900">{item.name}</h4>
                              <p className="text-sm text-gray-600">{item.seller}</p>
                              <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-emerald-600">{item.price}</p>
                            <p className="text-sm text-gray-600">N{parseInt(item.price) * item.quantity}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-lg font-semibold text-gray-900">Total:</span>
                        <span className="text-2xl font-bold text-emerald-600">
                          N{getTotalPrice().toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Checkout Form */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Shipping & Payment</h3>
                    <form className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input
                          type="text"
                          value={checkoutData.name}
                          onChange={(e) => setCheckoutData(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="Enter your full name"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          value={checkoutData.email}
                          onChange={(e) => setCheckoutData(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="Enter your email"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                          type="tel"
                          value={checkoutData.phone}
                          onChange={(e) => setCheckoutData(prev => ({ ...prev, phone: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          placeholder="Enter your phone number"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
                        <textarea
                          value={checkoutData.address}
                          onChange={(e) => setCheckoutData(prev => ({ ...prev, address: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          rows="3"
                          placeholder="Enter your delivery address"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                        <select
                          value={checkoutData.paymentMethod}
                          onChange={(e) => setCheckoutData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        >
                          <option value="card">Credit/Debit Card</option>
                          <option value="transfer">Bank Transfer</option>
                          <option value="cash">Cash on Delivery</option>
                        </select>
                      </div>

                      <div className="flex space-x-4">
                        <button
                          type="button"
                          onClick={() => setShowCheckout(false)}
                          className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handlePlaceOrder}
                          disabled={!isCheckoutValid() || isProcessing}
                          className="flex-1 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                          {isProcessing ? 'Processing...' : 'Place Order'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Order Success Modal */}
        {orderPlaced && (
          <div className="fixed inset-0 z-[30] flex">
            <div 
              className="fixed inset-0 bg-black/20 backdrop-blur-sm" 
              onClick={() => setOrderPlaced(false)}
            ></div>
            <div className="ml-auto w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl transform transition-transform duration-300 ease-in-out relative z-[31]">
              <div className="p-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0L8.586 13H7a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8a1 1 0 00-.707.293l7-7a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Placed Successfully!</h2>
                  <p className="text-gray-600 mb-4">Thank you for your purchase. Your order has been confirmed and is being processed.</p>
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-500">Order ID:</span>
                      <span className="font-mono font-semibold text-emerald-600">{orderId}</span>
                    </div>
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-500">Total Amount:</span>
                      <span className="font-semibold text-gray-900">N{getTotalPrice().toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Payment Method:</span>
                      <span className="font-medium text-gray-900 capitalize">{checkoutData.paymentMethod}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={() => setOrderPlaced(false)}
                      className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 font-medium"
                    >
                      Continue Shopping
                    </button>
                    <button
                      onClick={() => {
                        // View order details (could navigate to order history page)
                        alert('Order history feature coming soon!');
                      }}
                      className="w-full border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 font-medium"
                    >
                      View Order Details
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

export default Marketplace;