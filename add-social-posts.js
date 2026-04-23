import axios from 'axios';

async function addSocialPosts() {
  try {
    // First login to get token
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'demo@econet.com',
      password: 'demo123'
    });
    
    const token = loginResponse.data.token;
    console.log('Login successful, token obtained');
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // Add social posts with valid enum values
    const socialPosts = [
      {
        description: "Join us for our monthly environmental meeting this Thursday at 6pm. We'll discuss community initiatives and upcoming projects.",
        category: "Other",
        severity: "Low",
        urgency: "Low",
        confidence: 0.8,
        summary: "Community environmental meeting announcement",
        location: {
          text: "Abuja, Nigeria",
          city: "Abuja",
          state: "FCT",
          country: "Nigeria"
        }
      },
      {
        description: "Announcing our new environmental awareness campaign! 'Green Tomorrow' starts next month. Sign up for volunteer opportunities.",
        category: "Other",
        severity: "Low",
        urgency: "Low",
        confidence: 0.7,
        summary: "Environmental awareness campaign announcement",
        location: {
          text: "Lagos, Nigeria",
          city: "Lagos",
          state: "Lagos",
          country: "Nigeria"
        }
      },
      {
        description: "Monitoring air quality near industrial zone. Noticing unusual patterns in particulate matter levels. Continuing observation.",
        category: "Pollution",
        severity: "Moderate",
        urgency: "Observation",
        confidence: 0.9,
        summary: "Air quality monitoring observation",
        location: {
          text: "Port Harcourt, Nigeria",
          city: "Port Harcourt",
          state: "Rivers",
          country: "Nigeria"
        }
      }
    ];
    
    for (const post of socialPosts) {
      try {
        const response = await axios.post('http://localhost:5000/api/reports', post, { headers });
        console.log('Social post created successfully:', response.data.message);
      } catch (error) {
        console.error('Error creating social post:', error.response?.data || error.message);
      }
    }
    
    console.log('All social posts added successfully!');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

addSocialPosts();
