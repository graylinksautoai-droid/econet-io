// Full API integration test
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'drive_econetio_authority';

// Generate a valid test token
const generateTestToken = () => {
  const testUser = {
    id: '507f1f77d86f7d01234567890ab',
    email: 'test@example.com'
  };
  
  return jwt.sign(testUser, JWT_SECRET, { expiresIn: '1h' });
};

const testCheckout = async () => {
  try {
    const token = generateTestToken();
    
    const response = await fetch('http://localhost:5000/api/marketplace/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        phone: '1234567890',
        address: '123 Test St',
        paymentMethod: 'card',
        items: [{ id: 1, name: 'Test Product', price: 2500 }],
        total: 2500
      })
    });

    const result = await response.json();
    console.log('✅ Checkout Response:', result);
    
    if (result.success) {
      console.log('🎉 Order ID:', result.data.orderId);
      console.log('📦 Status:', result.data.status);
    }
    
  } catch (error) {
    console.error('❌ Checkout Error:', error);
  }
};

const testProfile = async () => {
  try {
    const token = generateTestToken();
    
    const response = await fetch('http://localhost:5000/api/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();
    console.log('✅ Profile Response:', result);
    
  } catch (error) {
    console.error('❌ Profile Error:', error);
  }
};

const runTests = async () => {
  console.log('🚀 Starting API Integration Tests...\n');
  
  await testProfile();
  await testCheckout();
  
  console.log('\n✅ All tests completed!');
};

runTests();
