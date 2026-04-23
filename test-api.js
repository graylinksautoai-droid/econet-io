// Simple API test
const testCheckout = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/marketplace/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-token-for-testing'
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
    console.log('Checkout Response:', result);
  } catch (error) {
    console.error('Checkout Error:', error);
  }
};

testCheckout();
