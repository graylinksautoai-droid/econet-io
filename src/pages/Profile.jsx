import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import { FaUser, FaBell, FaLock, FaCamera, FaEdit, FaSave, FaCog, FaShieldAlt, FaMoon } from "react-icons/fa";
import CameraCapture from '../components/CameraCapture.jsx';
import { useAuth } from '../context/AuthContext';
import { API_ENDPOINTS, apiRequest } from '../services/api.js';
import { useTheme } from '../context/ThemeContext';
import { resolveMediaUrl } from '../services/runtimeConfig.js';

/**
 * Advanced Profile Page with comprehensive settings
 */
function Profile({ onLogout, onNavigate }) {
  const { user, token, setUser } = useAuth();
  const { theme, setThemeMode } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState('');
  
  // Load profile data from localStorage or user context
  const savedProfile = localStorage.getItem('userProfile');
  const savedAvatar = localStorage.getItem('userAvatar');
  
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    bio: user?.bio || '',
    location: user?.location || '',
    website: user?.website || '',
    phone: user?.phone || '',
    avatar: savedAvatar || user?.avatar || '',
    reputation: user?.reputation || { trustScore: 85, reportsVerified: 12, communityScore: 92 },
    ...(savedProfile ? JSON.parse(savedProfile) : {})
  });

  // Load profile from localStorage (fallback mode since backend may not be available)
  useEffect(() => {
    if (user) {
      try {
        // Try to load from localStorage first
        const savedProfile = localStorage.getItem('userProfile');
        const savedAvatar = localStorage.getItem('userAvatar');
        
        if (savedProfile) {
          const profileData = JSON.parse(savedProfile);
          setProfileData(prev => ({
            ...prev,
            ...profileData,
            avatar: savedAvatar || profileData.avatar || user.avatar
          }));
        } else {
          // Fallback to user context data
          setProfileData(prev => ({
            ...prev,
            name: user.name || '',
            email: user.email || '',
            avatar: user.avatar || 'https://via.placeholder.com/150',
            reputation: user.reputation || { trustScore: 0 },
            verifiedReporter: user.verifiedReporter || false
          }));
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    }
  }, [user]);

  useEffect(() => {
    const loadRemoteProfile = async () => {
      if (!token) return;

      try {
        const response = await apiRequest(API_ENDPOINTS.PROFILE.GET, { method: 'GET' });
        const remoteUser = response?.data || response?.user || response;
        if (!remoteUser) return;

        setProfileData(prev => ({
          ...prev,
          ...remoteUser,
          avatar: remoteUser.avatar || prev.avatar
        }));

        const mergedUser = { ...user, ...remoteUser };
        setUser(mergedUser);
        localStorage.setItem('user', JSON.stringify(mergedUser));
        localStorage.setItem('userProfile', JSON.stringify({ ...profileData, ...remoteUser }));
        if (remoteUser.avatar) {
          localStorage.setItem('userAvatar', remoteUser.avatar);
        }
      } catch (remoteError) {
        console.warn('Remote profile load skipped:', remoteError);
      }
    };

    loadRemoteProfile();
  }, [token]);

  // Load settings from localStorage
  const savedSettings = localStorage.getItem('userSettings');
  
  const [settings, setSettings] = useState({
    notifications: {
      email: true,
      push: true,
      sms: false,
      reports: true,
      comments: true,
      mentions: true
    },
    privacy: {
      profileVisibility: 'public',
      showLocation: true,
      showEmail: false,
      showPhone: false,
      dataSharing: 'limited'
    },
    appearance: {
      theme: 'dark',
      language: 'en',
      fontSize: 'medium',
      highContrast: false,
      animations: true
    },
    security: {
      twoFactorAuth: false,
      loginAlerts: true,
      sessionTimeout: '24h',
      dataEncryption: true,
      secureUploads: true
    },
    ai: {
      liloEnabled: true,
      autoTagging: true,
      contentFiltering: true,
      smartSuggestions: true,
      aiAssistance: true
    },
    ...(savedSettings ? JSON.parse(savedSettings) : {})
  });

  useEffect(() => {
    if (settings?.appearance?.theme) {
      setThemeMode(settings.appearance.theme);
    }
  }, [settings?.appearance?.theme, setThemeMode]);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    
    try {
      const mergedUser = { ...user, ...profileData };
      await apiRequest(API_ENDPOINTS.PROFILE.UPDATE, {
        method: 'PATCH',
        body: JSON.stringify(profileData)
      });

      setUser(mergedUser);
      
      localStorage.setItem('userProfile', JSON.stringify(profileData));
      localStorage.setItem('user', JSON.stringify(mergedUser));
      if (profileData.avatar) {
        localStorage.setItem('userAvatar', profileData.avatar);
      }
      
      // Show success feedback
      const successMessage = document.createElement('div');
      successMessage.className = 'fixed top-4 right-4 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
      successMessage.textContent = 'Profile updated successfully!';
      document.body.appendChild(successMessage);
      
      setTimeout(() => {
        document.body.removeChild(successMessage);
      }, 3000);
      
      setIsEditing(false);
    } catch (error) {
      console.error('Profile update failed:', error);
      const mergedUser = { ...user, ...profileData };
      setUser(mergedUser);
      localStorage.setItem('userProfile', JSON.stringify(profileData));
      localStorage.setItem('user', JSON.stringify(mergedUser));
      if (profileData.avatar) {
        localStorage.setItem('userAvatar', profileData.avatar);
      }
      setIsEditing(false);
    }
  };

  const handleSettingsUpdate = async (category, newSettings) => {
    try {
      const response = await apiRequest(API_ENDPOINTS.PROFILE.SETTINGS, {
        method: 'PUT',
        body: JSON.stringify({ category, settings: newSettings })
      });
      
      if (response.success) {
        setSettings(prev => ({ ...prev, [category]: newSettings }));
        if (category === 'appearance' && newSettings.theme) {
          setThemeMode(newSettings.theme);
        }
        // Save to localStorage for persistence
        localStorage.setItem('userSettings', JSON.stringify({ ...settings, [category]: newSettings }));
        
        // Show success feedback
        const successMessage = document.createElement('div');
        successMessage.className = 'fixed top-4 right-4 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        successMessage.textContent = 'Settings updated successfully!';
        document.body.appendChild(successMessage);
        
        setTimeout(() => {
          document.body.removeChild(successMessage);
        }, 3000);
      }
    } catch (error) {
      console.error('Settings update failed:', error);
      // Fallback to localStorage
      localStorage.setItem('userSettings', JSON.stringify({ ...settings, [category]: newSettings }));
      setSettings(prev => ({ ...prev, [category]: newSettings }));
      if (category === 'appearance' && newSettings.theme) {
        setThemeMode(newSettings.theme);
      }
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Create preview URL for immediate display
      const previewUrl = URL.createObjectURL(file);
      
      try {
        // Convert to base64 for local storage
        const reader = new FileReader();
        reader.onload = (e) => {
          const avatarUrl = e.target.result;
          
          // Update profile data
          setProfileData(prev => ({ ...prev, avatar: avatarUrl }));
          
          // Update user context
          const mergedUser = { ...user, avatar: avatarUrl };
          setUser(mergedUser);
          
          // Save to localStorage
          localStorage.setItem('userProfile', JSON.stringify({ ...profileData, avatar: avatarUrl }));
          localStorage.setItem('user', JSON.stringify(mergedUser));
          localStorage.setItem('userAvatar', avatarUrl);

          apiRequest(API_ENDPOINTS.PROFILE.AVATAR, {
            method: 'POST',
            body: JSON.stringify({ avatar: avatarUrl })
          }).catch((avatarError) => {
            console.warn('Avatar API sync deferred:', avatarError);
          });
          
          // Show success feedback
          const successMessage = document.createElement('div');
          successMessage.className = 'fixed top-4 right-4 bg-emerald-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
          successMessage.textContent = 'Avatar updated successfully!';
          document.body.appendChild(successMessage);
          
          setTimeout(() => {
            document.body.removeChild(successMessage);
          }, 3000);
        };
        
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Avatar upload failed:', error);
        setError('Failed to upload avatar');
        setProfileData(prev => ({ ...prev, avatar: previewUrl }));
        localStorage.setItem('userAvatar', previewUrl);
      }
    }
  };

  const handleCameraCapture = (imageData) => {
    setProfileData(prev => ({ ...prev, avatar: imageData }));
    localStorage.setItem('userAvatar', imageData);
    setUser(prev => ({ ...prev, avatar: imageData }));
    apiRequest(API_ENDPOINTS.PROFILE.AVATAR, {
      method: 'POST',
      body: JSON.stringify({ avatar: imageData })
    }).catch((avatarError) => {
      console.warn('Camera avatar API sync deferred:', avatarError);
    });
  };

  const openCamera = () => {
    setShowCamera(true);
  };

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Profile Information</h2>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </button>
        </div>

        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div className="flex items-center space-x-6 mb-6">
            <div className="relative">
              <img
                src={resolveMediaUrl(profileData.avatar) || 'https://via.placeholder.com/150'}
                alt="Profile Avatar"
                className="w-32 h-32 rounded-full object-cover border-4 border-emerald-500"
              />
              {isEditing && (
                <div className="absolute bottom-0 right-0 flex space-x-2">
                  <label htmlFor="avatar-upload" className="bg-emerald-600 text-white p-2 rounded-full cursor-pointer hover:bg-emerald-700 transition-colors">
                    <FaCamera className="w-4 h-4" />
                    <input 
                      id="avatar-upload" 
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleAvatarUpload} 
                    />
                  </label>
                  <button
                    type="button"
                    onClick={openCamera}
                    className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 transition-colors"
                    title="Open Camera"
                  >
                    <FaCamera className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900">{profileData.name}</h3>
              <p className="text-gray-600">{profileData.email}</p>
              <div className="flex items-center space-x-4 mt-2">
                <span className="text-sm bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full">
                  Trust Score: {profileData.reputation.trustScore}%
                </span>
                <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                  {profileData.reputation.reportsVerified} Reports Verified
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input
                type="text"
                value={profileData.name}
                onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={profileData.email}
                onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={profileData.location}
                onChange={(e) => setProfileData(prev => ({ ...prev, location: e.target.value }))}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input
                type="url"
                value={profileData.website}
                onChange={(e) => setProfileData(prev => ({ ...prev, website: e.target.value }))}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
            <textarea
              value={profileData.bio}
              onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
              disabled={!isEditing}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-gray-100"
            />
          </div>

          {isEditing && (
            <button
              type="submit"
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Save Changes
            </button>
          )}
        </form>
      </div>
    </div>
  );

  const renderSettingsTab = () => (
    <div className="space-y-6">
      {/* Notifications */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FaBell className="mr-2" /> Notifications
        </h3>
        <div className="space-y-3">
          {Object.entries(settings.notifications).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </label>
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => {
                  const newNotifications = { ...settings.notifications, [key]: e.target.checked };
                  handleSettingsUpdate('notifications', newNotifications);
                }}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Privacy */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FaShieldAlt className="mr-2" /> Privacy
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profile Visibility</label>
            <select
              value={settings.privacy.profileVisibility}
              onChange={(e) => {
                const newPrivacy = { ...settings.privacy, profileVisibility: e.target.value };
                handleSettingsUpdate('privacy', newPrivacy);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            >
              <option value="public">Public</option>
              <option value="friends">Friends Only</option>
              <option value="private">Private</option>
            </select>
          </div>
          {Object.entries(settings.privacy).filter(([key]) => key !== 'profileVisibility').map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 capitalize">
                Show {key.replace(/([A-Z])/g, ' $1').trim()}
              </label>
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => {
                  const newPrivacy = { ...settings.privacy, [key]: e.target.checked };
                  handleSettingsUpdate('privacy', newPrivacy);
                }}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FaMoon className="mr-2" /> Appearance
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
            <select
              value={settings.appearance.theme}
              onChange={(e) => {
                const newAppearance = { ...settings.appearance, theme: e.target.value };
                handleSettingsUpdate('appearance', newAppearance);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">Auto</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select
              value={settings.appearance.language}
              onChange={(e) => {
                const newAppearance = { ...settings.appearance, language: e.target.value };
                handleSettingsUpdate('appearance', newAppearance);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FaLock className="mr-2" /> Security
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Two-Factor Authentication</p>
              <p className="text-sm text-gray-600">Add an extra layer of security to your account</p>
            </div>
            <button
              onClick={() => onNavigate('/setup-2fa')}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              {settings.security.twoFactorAuth ? 'Manage' : 'Enable'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Change Password</p>
              <p className="text-sm text-gray-600">Update your password regularly</p>
            </div>
            <button
              onClick={() => onNavigate('/change-password')}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Change
            </button>
          </div>
        </div>
      </div>

      {/* LILO AI Settings */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FaCog className="mr-2" /> LILO AI Assistant
        </h3>
        <div className="space-y-3">
          {Object.entries(settings.ai).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <p className="text-xs text-gray-500">
                  {key === 'liloEnabled' && 'Enable LILO AI assistant throughout the app'}
                  {key === 'autoTagging' && 'Automatically tag your environmental reports'}
                  {key === 'contentFiltering' && 'AI-powered content filtering and moderation'}
                  {key === 'smartSuggestions' && 'Get intelligent suggestions for your reports'}
                  {key === 'aiAssistance' && 'AI-powered help and guidance'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={value}
                onChange={(e) => {
                  const newAi = { ...settings.ai, [key]: e.target.checked };
                  handleSettingsUpdate('ai', newAi);
                }}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <MainLayout user={user} onLogout={onLogout} onNavigate={onNavigate}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
            <p className="text-gray-600 mt-2">Manage your profile, preferences, and security settings</p>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-8">
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('profile')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'profile'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FaUser className="inline mr-2" />
                Profile
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'settings'
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FaCog className="inline mr-2" />
                Settings
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'profile' && renderProfileTab()}
          {activeTab === 'settings' && renderSettingsTab()}
        </div>
      </div>

      {/* Camera Modal */}
      {showCamera && (
        <CameraCapture
          onImageCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </MainLayout>
  );
}

export default Profile;
