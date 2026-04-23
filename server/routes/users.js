import express from 'express';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/users/leaderboard - Top users by trust score
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find({ 'reputation.trustScore': { $gt: 0 } })
      .sort({ 'reputation.trustScore': -1 })
      .limit(20)
      .select('name email avatar reputation.trustScore reputation.verifiedReports verifiedReporter')
      .lean();
    res.json(users);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /api/users/suggestions
router.get('/suggestions', protect, async (req, res) => {
  try {
    const suggestions = await User.find({ _id: { $ne: req.user._id, $nin: req.user.following } })
      .select('name email avatar reputation')
      .limit(10);
    res.json(suggestions);
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name email bio avatar reputation followers following createdAt')
      .populate('followers', 'name email avatar')
      .populate('following', 'name email avatar');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      bio: user.bio,
      avatar: user.avatar,
      reputation: user.reputation,
      followers: user.followers,
      following: user.following,
      followerCount: user.followers.length,
      followingCount: user.following.length,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/users/profile (protected)
router.patch('/profile', protect, async (req, res) => {
  try {
    const { name, bio, avatar } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (bio !== undefined) updates.bio = bio;
    if (avatar) updates.avatar = avatar;

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select('-password');
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        reputation: user.reputation,
        verifiedReporter: user.verifiedReporter,
        followerCount: user.followers.length,
        followingCount: user.following.length
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/users/:id/follow
router.post('/:id/follow', protect, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.user.following.includes(targetUser._id)) {
      return res.status(400).json({ error: 'Already following this user' });
    }

    req.user.following.push(targetUser._id);
    await req.user.save();

    targetUser.followers.push(req.user._id);
    await targetUser.save();

    res.json({ message: 'Followed successfully' });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users/:id/unfollow
router.post('/:id/unfollow', protect, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot unfollow yourself' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!req.user.following.includes(targetUser._id)) {
      return res.status(400).json({ error: 'Not following this user' });
    }

    req.user.following = req.user.following.filter(
      id => id.toString() !== targetUser._id.toString()
    );
    await req.user.save();

    targetUser.followers = targetUser.followers.filter(
      id => id.toString() !== req.user._id.toString()
    );
    await targetUser.save();

    res.json({ message: 'Unfollowed successfully' });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/users/settings (protected) - Comprehensive settings update
router.patch('/settings', protect, async (req, res) => {
  try {
    const { name, bio, avatar, security, dataSync } = req.body;
    const updates = {};
    
    // Identity updates
    if (name) updates.name = name;
    if (bio !== undefined) updates.bio = bio;
    if (avatar) updates.avatar = avatar;
    
    // Settings updates
    if (security) {
      updates['settings.security'] = security;
    }
    if (dataSync) {
      updates['settings.dataSync'] = dataSync;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select('-password');
    
    res.json({
      message: 'All settings updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar,
        settings: user.settings,
        reputation: user.reputation,
        verifiedReporter: user.verifiedReporter
      }
    });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// PATCH /api/users/settings/security (protected) - Security settings only
router.patch('/settings/security', protect, async (req, res) => {
  try {
    const { e2eeEnabled, geospatialSalting } = req.body;
    const updates = {};
    
    if (e2eeEnabled !== undefined) {
      updates['settings.security.e2eeEnabled'] = e2eeEnabled;
    }
    if (geospatialSalting !== undefined) {
      updates['settings.security.geospatialSalting'] = geospatialSalting;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id, 
      { $set: updates }, 
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Security settings updated successfully',
      settings: user.settings?.security || {}
    });
  } catch (error) {
    console.error('Security settings error:', error);
    res.status(500).json({ error: 'Failed to update security settings' });
  }
});

// PATCH /api/users/settings/dataSync (protected) - Data sync settings only
router.patch('/settings/dataSync', protect, async (req, res) => {
  try {
    const { progressiveSyncPref, bitrateThrottling } = req.body;
    const updates = {};
    
    if (progressiveSyncPref) {
      updates['settings.dataSync.progressiveSyncPref'] = progressiveSyncPref;
    }
    if (bitrateThrottling !== undefined) {
      updates['settings.dataSync.bitrateThrottling'] = bitrateThrottling;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id, 
      { $set: updates }, 
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'Data sync settings updated successfully',
      settings: user.settings?.dataSync || {}
    });
  } catch (error) {
    console.error('Data sync settings error:', error);
    res.status(500).json({ error: 'Failed to update data sync settings' });
  }
});

// GET /api/users/settings (protected) - Get all user settings
router.get('/settings', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('settings');
    res.json({
      settings: user.settings || {
        security: {
          e2eeEnabled: false,
          geospatialSalting: false
        },
        dataSync: {
          progressiveSyncPref: 'Standard',
          bitrateThrottling: false
        }
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

export default router;