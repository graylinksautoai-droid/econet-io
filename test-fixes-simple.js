// Simple test script to verify all fixes
import fs from 'fs';
import path from 'path';
import http from 'http';

const BASE_URL = 'http://localhost:5000';
const FRONTEND_URL = 'http://localhost:5173';

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });

    req.on('error', reject);
    req.end();
  });
}

async function testBackendHealth() {
  console.log('Testing Backend Health...');
  try {
    const result = await makeRequest(`${BASE_URL}/`);
    console.log('Backend Status:', result.status);
    console.log('Backend Response:', result.data.substring(0, 100) + '...');
    return result.status === 200;
  } catch (error) {
    console.error('Backend Health Test Failed:', error.message);
    return false;
  }
}

async function testUploadsDirectory() {
  console.log('\nTesting Uploads Directory...');
  try {
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
    const result = await makeRequest(`${FRONTEND_URL}/`);
    console.log('Frontend Status:', result.status);
    return result.status === 200;
  } catch (error) {
    console.error('Frontend Health Test Failed:', error.message);
    return false;
  }
}

async function testMapEndpoint() {
  console.log('\nTesting Map Endpoint...');
  try {
    const result = await makeRequest(`${BASE_URL}/api/map/reports`);
    console.log('Map Endpoint Status:', result.status);
    try {
      const data = JSON.parse(result.data);
      console.log('Map Reports Count:', Array.isArray(data) ? data.length : 'Not an array');
    } catch (e) {
      console.log('Map Response:', result.data.substring(0, 100) + '...');
    }
    return result.status === 200;
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
    uploads: await testUploadsDirectory(),
    map: await testMapEndpoint()
  };
  
  console.log('\n=== TEST RESULTS ===');
  console.log('Backend Health:', results.backend ? 'PASS' : 'FAIL');
  console.log('Frontend Health:', results.frontend ? 'PASS' : 'FAIL');
  console.log('Uploads Directory:', results.uploads ? 'PASS' : 'FAIL');
  console.log('Map Endpoint:', results.map ? 'PASS' : 'FAIL');
  
  const allPassed = Object.values(results).every(result => result);
  console.log('\n=== OVERALL STATUS ===');
  console.log(allPassed ? 'ALL TESTS PASSED! All fixes verified.' : 'SOME TESTS FAILED. Check logs above.');
  
  return allPassed;
}

runAllTests().catch(console.error);
