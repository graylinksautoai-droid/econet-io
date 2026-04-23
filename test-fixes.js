// Test script to verify all fixes
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';
const FRONTEND_URL = 'http://localhost:5173';

async function testBackendHealth() {
  console.log('Testing Backend Health...');
  try {
    const response = await fetch(`${BASE_URL}/`);
    const data = await response.json();
    console.log('Backend Status:', response.status);
    console.log('Backend Response:', data);
    return true;
  } catch (error) {
    console.error('Backend Health Test Failed:', error.message);
    return false;
  }
}

async function testAvatarEndpoint() {
  console.log('\nTesting Avatar Endpoint...');
  try {
    // Test without auth (should fail)
    const response = await fetch(`${BASE_URL}/api/profile/avatar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const data = await response.text();
    console.log('Avatar Endpoint Status:', response.status);
    console.log('Avatar Endpoint Response:', data);
    return response.status === 401; // Should be unauthorized
  } catch (error) {
    console.error('Avatar Endpoint Test Failed:', error.message);
    return false;
  }
}

async function testUploadsDirectory() {
  console.log('\nTesting Uploads Directory...');
  try {
    const fs = await import('fs');
    const path = await import('path');
    const uploadsDir = path.join(process.cwd(), 'server', 'uploads');
    const exists = fs.existsSync(uploadsDir);
    console.log('Uploads Directory Exists:', exists);
    return exists;
  } catch (error) {
    console.error('Uploads Directory Test Failed:', error.message);
    return false;
  }
}

async function testFrontendHealth() {
  console.log('\nTesting Frontend Health...');
  try {
    const response = await fetch(`${FRONTEND_URL}/`);
    console.log('Frontend Status:', response.status);
    return response.status === 200;
  } catch (error) {
    console.error('Frontend Health Test Failed:', error.message);
    return false;
  }
}

async function testMapEndpoint() {
  console.log('\nTesting Map Endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/api/map/reports`);
    const data = await response.json();
    console.log('Map Endpoint Status:', response.status);
    console.log('Map Reports Count:', Array.isArray(data) ? data.length : 'Not an array');
    return response.status === 200;
  } catch (error) {
    console.error('Map Endpoint Test Failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('=== ECONET FIXES VERIFICATION ===\n');
  
  const results = {
    backend: await testBackendHealth(),
    frontend: await testFrontendHealth(),
    avatar: await testAvatarEndpoint(),
    uploads: await testUploadsDirectory(),
    map: await testMapEndpoint()
  };
  
  console.log('\n=== TEST RESULTS ===');
  console.log('Backend Health:', results.backend ? 'PASS' : 'FAIL');
  console.log('Frontend Health:', results.frontend ? 'PASS' : 'FAIL');
  console.log('Avatar Endpoint:', results.avatar ? 'PASS' : 'FAIL');
  console.log('Uploads Directory:', results.uploads ? 'PASS' : 'FAIL');
  console.log('Map Endpoint:', results.map ? 'PASS' : 'FAIL');
  
  const allPassed = Object.values(results).every(result => result);
  console.log('\n=== OVERALL STATUS ===');
  console.log(allPassed ? 'ALL TESTS PASSED! All fixes verified.' : 'SOME TESTS FAILED. Check logs above.');
  
  return allPassed;
}

runAllTests().catch(console.error);
