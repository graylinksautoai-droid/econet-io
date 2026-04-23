import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  description: {
    type: String,
    required: true
  },
  location: {
    text: String,
    city: String,
    state: String,
    country: { type: String, default: 'Nigeria' },
    lat: Number,
    lon: Number
  },
  category: {
    type: String,
    enum: ['Flood', 'Drought', 'Fire', 'Pollution', 'Storm', 'Other'],
    required: true
  },
  severity: {
    type: String,
    enum: ['Low', 'Moderate', 'Critical'],
    required: true
  },
  urgency: {
    type: String,
    enum: ['Low', 'Medium', 'Immediate', 'Observation', 'TemporaryRelief'],
    required: true
  },
  postStatus: {
    type: String,
    enum: ['regular', 'observe', 'critical'],
    default: 'regular',
    index: true
  },
  signalSource: {
    type: String,
    enum: ['social', 'report', 'command'],
    default: 'social'
  },
  confidence: Number,
  summary: String,
  images: [String],
  media: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio'],
      required: true
    },
    url: { type: String, required: true },
    name: String,
    mimeType: String,
    duration: Number
  }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  agenciesNotified: [{
    agencyName: String,
    email: String,
    notifiedAt: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['pending', 'verified', 'resolved'],
    default: 'pending'
  },
  upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sharesCount: { type: Number, default: 0 },
  giftsCount: { type: Number, default: 0 },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'disputed'],
    default: 'pending'
  },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
  aiVerification: {
    score: { type: Number, min: 0, max: 100 },
    reasoning: String,
    flags: [String],
    weatherData: mongoose.Schema.Types.Mixed,
    satelliteData: mongoose.Schema.Types.Mixed,
    newsArticles: [mongoose.Schema.Types.Mixed]
  },
  liloClassification: {
    isClimateRelated: { type: Boolean, default: false, index: true },
    confidence: { type: Number, min: 0, max: 100, default: 0 },
    summary: String,
    matchedSignals: [String],
    routedToCommand: { type: Boolean, default: false }
  },
  aiScore: { 
    type: Number, 
    min: 0, 
    max: 100, 
    default: 50,
    index: true 
  },
  isLive: { type: Boolean, default: false },
  trustScoreBoost: { type: Number, default: 0 },
  proofOfPresence: { type: Boolean, default: false },
  liveSessionId: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for faster queries
reportSchema.index({ 'location.city': 1, 'location.state': 1 });
reportSchema.index({ category: 1, severity: 1 });
reportSchema.index({ createdAt: -1 });
reportSchema.index({ user: 1 });
reportSchema.index({ 'location': '2dsphere' }); // geospatial index
reportSchema.index({ postStatus: 1, createdAt: -1 });
reportSchema.index({ 'liloClassification.isClimateRelated': 1, createdAt: -1 });

// Performance optimization indexes
reportSchema.index({ aiScore: -1 }); // For feed ranking
reportSchema.index({ category: 1, createdAt: -1 }); // For category feeds
reportSchema.index({ severity: 1, createdAt: -1 }); // For severity-based filtering
reportSchema.index({ user: 1, createdAt: -1 }); // For user post history
reportSchema.index({ isLive: 1, createdAt: -1 }); // For live stream filtering
reportSchema.index({ 'aiVerification.score': -1 }); // For AI-scored content
reportSchema.index({ upvotes: -1, createdAt: -1 }); // For popular content

const Report = mongoose.model('Report', reportSchema);
export default Report;
