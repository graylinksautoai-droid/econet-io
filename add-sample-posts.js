// Add sample posts to localStorage for testing
const samplePosts = [
  {
    _id: 'sample-social-1',
    content: 'Great news! Our community garden project is thriving. Thanks to everyone who volunteered last weekend! Together we\'re making our neighborhood greener. #Community #Environment',
    category: 'Other',
    severity: 'Low',
    urgency: 'Low',
    location: { type: 'Point', coordinates: [3.3792, 6.5244] },
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    author: {
      name: 'Community Garden',
      reputation: { trustScore: 78 },
      verifiedReporter: false,
      avatar: 'https://via.placeholder.com/150'
    },
    aiVerification: { score: 8, risk: 'Low' },
    likes: 15,
    liked: false,
    comments: [],
    images: [],
    trustScore: 78
  },
  {
    _id: 'sample-social-2',
    content: 'Reminder: Tomorrow is our monthly river cleanup event. Meet at the main bridge at 8 AM. Bring gloves and reusable bags! Let\'s keep our waterways clean. #Volunteer #CleanEnvironment',
    category: 'Other',
    severity: 'Low',
    urgency: 'Low',
    location: { type: 'Point', coordinates: [4.8156, 7.0498] },
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    author: {
      name: 'Environmental Warriors',
      reputation: { trustScore: 82 },
      verifiedReporter: true,
      avatar: 'https://via.placeholder.com/150'
    },
    aiVerification: { score: 12, risk: 'Low' },
    likes: 23,
    liked: false,
    comments: [],
    images: [],
    trustScore: 82
  },
  {
    _id: 'sample-social-3',
    content: 'Just spotted a family of otters playing near the old mill! Amazing to see wildlife thriving in our area. Nature is recovering! #Wildlife #NatureConservation',
    category: 'Other',
    severity: 'Low',
    urgency: 'Observation',
    location: { type: 'Point', coordinates: [5.2033, 7.3792] },
    createdAt: new Date(Date.now() - 5400000).toISOString(),
    author: {
      name: 'Nature Enthusiast',
      reputation: { trustScore: 71 },
      verifiedReporter: false,
      avatar: 'https://via.placeholder.com/150'
    },
    aiVerification: { score: 18, risk: 'Low' },
    likes: 31,
    liked: false,
    comments: [],
    images: ['https://via.placeholder.com/400x300'],
    trustScore: 71
  }
];

// Store in localStorage
const existingPosts = JSON.parse(localStorage.getItem('userCreatedPosts') || '[]');
const allSamplePosts = [...samplePosts, ...existingPosts];
localStorage.setItem('userCreatedPosts', JSON.stringify(allSamplePosts));

console.log('Added sample social posts to feed!');
console.log('Total user posts:', allSamplePosts.length);
