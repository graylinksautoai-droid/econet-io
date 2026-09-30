import express from 'express';
import multer from 'multer';
import path from 'path';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

const router = express.Router();

function isMongoReady() { return mongoose.connection.readyState === 1; }
function dbUnavailable(res) {
  return res.status(503).json({ error: 'Service temporarily unavailable — database not connected.', code: 'DATABASE_UNAVAILABLE' });
}

// Get user profile
router.get('/', protect, async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        bio: user.bio || '',
        location: user.location || '',
        website: user.website || '',
        phone: user.phone || '',
        avatar: user.avatar || '',
        reputation: user.reputation || { trustScore: 85, reportsVerified: 12, communityScore: 92 }
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// Update user profile — accepts both PUT (canonical) and PATCH (frontend convention)
router.put('/', protect, async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    const { name, email, bio, location, website, phone, avatar } = req.body;

    const updateData = { name, email, bio, location, website, phone, avatar, updatedAt: new Date() };

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        name: updatedUser.name,
        email: updatedUser.email,
        bio: updatedUser.bio,
        location: updatedUser.location,
        website: updatedUser.website,
        phone: updatedUser.phone,
        avatar: updatedUser.avatar
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});
// PATCH alias — frontend Profile.jsx and EditProfile.jsx both use PATCH
router.patch('/', protect, async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    const { name, email, bio, location, website, phone, avatar } = req.body;

    // Build update from only the fields that were provided (partial update)
    const updateData = { updatedAt: new Date() };
    if (name     !== undefined) updateData.name     = name;
    if (email    !== undefined) updateData.email    = email;
    if (bio      !== undefined) updateData.bio      = bio;
    if (location !== undefined) updateData.location = location;
    if (website  !== undefined) updateData.website  = website;
    if (phone    !== undefined) updateData.phone    = phone;
    if (avatar   !== undefined) updateData.avatar   = avatar;

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        name:     updatedUser.name,
        email:    updatedUser.email,
        bio:      updatedUser.bio,
        location: updatedUser.location,
        website:  updatedUser.website,
        phone:    updatedUser.phone,
        avatar:   updatedUser.avatar
      }
    });
  } catch (error) {
    console.error('Error updating profile (PATCH):', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// Update avatar URL — accepts JSON { avatar: url }
router.post('/avatar', protect, async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    // JSON body: { avatar: 'https://...' or '/uploads/...' }
    const { avatar } = req.body;

    if (!avatar || typeof avatar !== 'string' || avatar.trim() === '') {
      return res.status(400).json({ success: false, message: 'avatar URL is required' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: avatar.trim(), updatedAt: new Date() },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Avatar updated successfully',
      data: { avatar: updatedUser.avatar }
    });
  } catch (error) {
    console.error('Error updating avatar:', error);
    res.status(500).json({ success: false, message: 'Failed to update avatar' });
  }
});

// Direct file-upload variant
router.post('/avatar/upload', protect, upload.single('avatar'), async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: avatarUrl, updatedAt: new Date() },
      { new: true }
    ).select('-password');

    res.json({
      success: true,
      message: 'Avatar updated successfully',
      data: { avatar: avatarUrl }
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ success: false, message: 'Failed to upload avatar' });
  }
});

// Update user settings — PUT (full replace) and PATCH (partial)
router.put('/settings', protect, async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    const { category, settings } = req.body;

    const updateData = { [`settings.${category}`]: settings, updatedAt: new Date() };

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true }
    ).select('-password');

    res.json({ success: true, message: 'Settings updated successfully', data: { category, settings } });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

// PATCH /settings — frontend EditProfile sends partial category updates
router.patch('/settings', protect, async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    const body = req.body;

    // Support two calling conventions:
    //  { category: 'security', settings: { e2eeEnabled: true } }  — EditProfile individual toggles
    //  { security: {...}, notifications: {...} }                   — full settings object
    let updateData = { updatedAt: new Date() };

    if (body.category && body.settings) {
      // Single-category patch from EditProfile toggles
      updateData[`settings.${body.category}`] = body.settings;
    } else {
      // Flat map of top-level setting categories
      const knownCategories = ['security', 'dataSync', 'notifications', 'privacy', 'appearance', 'ai'];
      for (const cat of knownCategories) {
        if (body[cat]) {
          updateData[`settings.${cat}`] = body[cat];
        }
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Settings updated',
      data: updatedUser.settings || {}
    });
  } catch (error) {
    console.error('Error patching settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

// Get user settings
router.get('/settings', protect, async (req, res) => {
  if (!isMongoReady()) return dbUnavailable(res);
  try {
    const user = await User.findById(req.user.id).select('settings');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user.settings || {}
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
});

export default router;
