import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { calculateUserStanding } from '../services/reputationService.js';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  phone: String,
  avatar: { type: String, default: "https://res.cloudinary.com/dp9ffewdb/image/upload/v1772255683/headshotmaster_image_1752773041882_klupxt.png" },
  bio: { type: String, default: "AI Engineer • Founder EcoNet IO 🌍 | Climate Tech" },
  location: { city: String, state: String, country: { type: String, default: 'Nigeria' } },
  isVerified: { type: Boolean, default: false },
  verificationToken: String,
  reputation: {
    totalReports: { type: Number, default: 0 },
    verifiedReports: { type: Number, default: 0 },
    trustScore: { type: Number, default: 0 },
    seeds: { type: Number, default: 0 }, // Spendable
    leaves: { type: Number, default: 0 }, // Reputation
    ecoCoins: { type: Number, default: 0 },
    visibilityVelocity: { type: Number, default: 0 },
    lastActivity: { type: Date, default: Date.now }
  },
  degree: { type: Number, enum: [1, 2, 3], default: 1 },
  isPro: { type: Boolean, default: false },
  goldBadge: { type: Boolean, default: false },
  verifiedReporter: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'reporter', 'authority', 'admin'], default: 'user' },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  settings: {
    security: {
      e2eeEnabled: { type: Boolean, default: false },
      geospatialSalting: { type: Boolean, default: false }
    },
    dataSync: {
      progressiveSyncPref: { type: String, enum: ['Aggressive', 'Standard', 'Minimal'], default: 'Standard' },
      bitrateThrottling: { type: Boolean, default: false }
    }
  },
  createdAt: { type: Date, default: Date.now }
});

// Virtuals
userSchema.virtual('followerCount').get(function() { return this.followers.length; });
userSchema.virtual('followingCount').get(function() { return this.following.length; });

// ✅ Pre‑save hook – promise‑based, no `next` parameter
userSchema.pre('save', async function() {
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update trust score
userSchema.methods.updateTrustScore = async function() {
  const Report = mongoose.model('Report');
  const reports = await Report.find({ user: this._id }).lean();
  if (reports.length === 0) {
    this.reputation.trustScore = 0;
    this.reputation.leaves = 0;
    this.reputation.ecoCoins = 0;
    this.reputation.seeds = 0;
    this.verifiedReporter = false;
    await this.save();
    return;
  }
  const standing = calculateUserStanding(reports, this.reputation.verifiedReports || 0);
  this.reputation.trustScore = standing.trustScore;
  this.reputation.leaves = standing.leaves;
  this.reputation.ecoCoins = standing.ecoCoins;
  this.reputation.seeds = standing.ecoCoins;
  this.verifiedReporter = standing.verifiedSentinel;
  await this.save();
};

// Performance optimization indexes
userSchema.index({ ecoCoins: -1 }); // For leaderboards
userSchema.index({ followers: -1 }); // For influencer rankings
userSchema.index({ accountType: 1, followers: -1 }); // For account type filtering
userSchema.index({ userLevel: -1, ecoCoins: -1 }); // For level-based queries
userSchema.index({ 'reputation.trustScore': -1 }); // For trusted reporters
userSchema.index({ verifiedReporter: 1, createdAt: -1 }); // For verified user filtering

const User = mongoose.model('User', userSchema);
export default User;
