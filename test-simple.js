// Simple API test without external dependencies
const testCheckout = async () => {
  try {
    // First test without auth to see the error
    const response1 = await fetch('http://localhost:5000/api/marketplace/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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

    const result1 = await response1.json();
    console.log('Without auth:', result1);
    
    // Test with invalid token
    const response2 = await fetch('http://localhost:5000/api/marketplace/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token'
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

    const result2 = await response2.json();
    console.log('With invalid token:', result2);
    
  } catch (error) {
    console.error('Checkout Error:', error);
  }
};

const testProducts = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/marketplace/products');
    const result = await response.json();
    console.log('Products API:', result);
  } catch (error) {
    console.error('Products Error:', error);
  }
};

const runTests = async () => {
  console.log('Testing API endpoints...\n');
  
  await testProducts();
  await testCheckout();
};

runTests();
