import express from 'express';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Get all marketplace products
router.get('/products', async (req, res) => {
  try {
    // Mock product data - replace with database queries
    const products = [
      {
        id: 1,
        name: "Mixed Fruits",
        price: "N2,500",
        seller: "Mama Put Farms",
        category: "produce",
        image: "https://res.cloudinary.com/dp9ffewdb/image/upload/v1772254703/fruit-market_1_nbn4jw.jpg"
      },
      {
        id: 2,
        name: "Solar Panel Kit 300W",
        price: "85,000",
        seller: "EcoSolar NG",
        category: "renewable",
        image: "https://res.cloudinary.com/dp9ffewdb/image/upload/v1772254703/solar-panel_nbn4jw.jpg"
      }
    ];
    
    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
});

// Get user's cart
router.get('/cart', protect, async (req, res) => {
  try {
    // Mock cart data - replace with database query
    const cart = [];
    
    res.json({
      success: true,
      data: cart
    });
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cart'
    });
  }
});

// Add item to cart
router.post('/cart', protect, async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    
    // Mock cart addition - replace with database operation
    const cartItem = {
      id: itemId,
      quantity: quantity || 1,
      addedAt: new Date()
    };
    
    res.json({
      success: true,
      message: 'Item added to cart',
      data: cartItem
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add item to cart'
    });
  }
});

// Process checkout
router.post('/checkout', protect, async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      paymentMethod,
      items,
      total
    } = req.body;

    // Generate order ID
    const orderId = 'ECO' + Date.now().toString(36).toUpperCase().substr(2, 9);
    
    // Mock order processing - replace with database operations
    const order = {
      id: orderId,
      customer: {
        name,
        email,
        phone,
        address
      },
      items,
      total,
      paymentMethod,
      status: 'confirmed',
      timestamp: new Date().toISOString()
    };

    // Save order to database (mock)
    console.log('Order created:', order);

    res.json({
      success: true,
      message: 'Order placed successfully',
      data: {
        orderId,
        status: 'confirmed'
      }
    });
  } catch (error) {
    console.error('Error processing checkout:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process checkout'
    });
  }
});

// Get order history
router.get('/orders', protect, async (req, res) => {
  try {
    // Mock order history - replace with database query
    const orders = [];
    
    res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
});

export default router;
