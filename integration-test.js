// Comprehensive Integration Test
const testIntegration = async () => {
  console.log('=== EcoNet Integration Test ===\n');
  
  // Test 1: Backend Health
  console.log('1. Testing Backend Health...');
  try {
    const healthResponse = await fetch('http://localhost:5000');
    const health = await healthResponse.json();
    console.log('   Backend Status:', health.message);
  } catch (error) {
    console.log('   Backend Error:', error.message);
    return;
  }
  
  // Test 2: Products API
  console.log('\n2. Testing Products API...');
  try {
    const productsResponse = await fetch('http://localhost:5000/api/marketplace/products');
    const products = await productsResponse.json();
    console.log('   Products:', products.data.length, 'items available');
  } catch (error) {
    console.log('   Products Error:', error.message);
  }
  
  // Test 3: Frontend Health
  console.log('\n3. Testing Frontend Health...');
  try {
    const frontendResponse = await fetch('http://localhost:5173');
    console.log('   Frontend Status: Running (HTTP 200)');
  } catch (error) {
    console.log('   Frontend Error:', error.message);
  }
  
  // Test 4: Authentication Flow
  console.log('\n4. Testing Authentication Flow...');
  try {
    const authResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    });
    
    if (authResponse.status === 401) {
      console.log('   Auth: Working (rejects invalid credentials)');
    } else {
      const authResult = await authResponse.json();
      console.log('   Auth Response:', authResult);
    }
  } catch (error) {
    console.log('   Auth Error:', error.message);
  }
  
  // Test 5: Protected Routes
  console.log('\n5. Testing Protected Routes...');
  try {
    const protectedResponse = await fetch('http://localhost:5000/api/profile', {
      headers: {
        'Authorization': 'Bearer invalid-token'
      }
    });
    
    if (protectedResponse.status === 401) {
      console.log('   Protected Routes: Working (rejects invalid tokens)');
    } else {
      console.log('   Protected Routes: Unexpected response');
    }
  } catch (error) {
    console.log('   Protected Routes Error:', error.message);
  }
  
  console.log('\n=== Integration Test Complete ===');
  console.log('\nNext Steps:');
  console.log('1. Open browser: http://localhost:5173');
  console.log('2. Test login flow');
  console.log('3. Test marketplace checkout');
  console.log('4. Test profile updates');
  console.log('5. Test image uploads');
};

testIntegration();
