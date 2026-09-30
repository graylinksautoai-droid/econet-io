import { useState, useEffect, useRef } from 'react';
import {
  FaUser, FaBell, FaLock, FaCamera, FaSave, FaCog, FaShieldAlt,
  FaMoon, FaSignOutAlt, FaEdit, FaCheck, FaTimes, FaUpload
} from 'react-icons/fa';
import CameraCapture from '../components/CameraCapture.jsx';
import { useAuth } from '../context/AuthContext';
import { API_ENDPOINTS, apiRequest } from '../services/api.js';
import { useTheme } from '../context/ThemeContext';
import { resolveMediaUrl } from '../services/runtimeConfig.js';

/**
 * Profile — EcoNet dark design system.
 *
 * Avatar upload is always visible (not gated behind "Edit Profile" mode).
 * All upload logic is preserved unchanged from the prior implementation.
 * White/light Tailwind tokens replaced with EcoNet dark tokens.
 */
function Profile({ onLogout, onNavigate }) {
  const { user, token, setUser } = useAuth();
  const { theme, setThemeMode } = useTheme();
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const savedProfile = localStorage.getItem('userProfile');
  const savedAvatar  = localStorage.getItem('userAvatar');

  const [profileData, setProfileData] = useState({
    name:       user?.name       || '',
    email:      user?.email      || '',
    bio:        user?.bio        || '',
    location:   user?.location   || '',
    website:    user?.website    || '',
    phone:      user?.phone      || '',
    avatar:     savedAvatar || user?.avatar || '',
    reputation: user?.reputation || { trustScore: 85, reportsVerified: 12, communityScore: 92 },
    ...(savedProfile ? JSON.parse(savedProfile) : {})
  });

  useEffect(() => {
    if (!user) return;
    try {
      const sp = localStorage.getItem('userProfile');
      const sa = localStorage.getItem('userAvatar');
      if (sp) {
        const parsed = JSON.parse(sp);
        setProfileData(prev => ({ ...prev, ...parsed, avatar: sa || parsed.avatar || user.avatar }));
      } else {
        setProfileData(prev => ({
          ...prev,
          name:   user.name  || '',
          email:  user.email || '',
          avatar: user.avatar || '',
          reputation: user.reputation || { trustScore: 0 }
        }));
      }
    } catch (e) { console.error('profile load:', e); }
  }, [user]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const response = await apiRequest(API_ENDPOINTS.PROFILE.GET, { method: 'GET' });
        const remoteUser = response?.data || response?.user || response;
        if (!remoteUser) return;
        setProfileData(prev => ({ ...prev, ...remoteUser, avatar: remoteUser.avatar || prev.avatar }));
        const merged = { ...user, ...remoteUser };
        setUser(merged);
        localStorage.setItem('user', JSON.stringify(merged));
        localStorage.setItem('userProfile', JSON.stringify({ ...profileData, ...remoteUser }));
        if (remoteUser.avatar) localStorage.setItem('userAvatar', remoteUser.avatar);
      } catch { /* non-fatal */ }
    })();
  }, [token]);

  const savedSettings = localStorage.getItem('userSettings');
  const [settings, setSettings] = useState({
    notifications: { email: true, push: true, sms: false, reports: true, comments: true, mentions: true },
    privacy: { profileVisibility: 'public', showLocation: true, showEmail: false, showPhone: false, dataSharing: 'limited' },
    appearance: { theme: 'dark', language: 'en', fontSize: 'medium', highContrast: false, animations: true },
    security: { twoFactorAuth: false, loginAlerts: true, sessionTimeout: '24h', dataEncryption: true, secureUploads: true },
    ai: { liloEnabled: true, autoTagging: true, contentFiltering: true, smartSuggestions: true, aiAssistance: true },
    ...(savedSettings ? JSON.parse(savedSettings) : {})
  });

  useEffect(() => {
    if (settings?.appearance?.theme) setThemeMode(settings.appearance.theme);
  }, [settings?.appearance?.theme, setThemeMode]);

  // ── Profile save ─────────────────────────────────────────────────────────
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    try {
      await apiRequest(API_ENDPOINTS.PROFILE.UPDATE, {
        method: 'PATCH',
        body: JSON.stringify(profileData)
      });
    } catch { /* fallback to local save */ }
    const merged = { ...user, ...profileData };
    setUser(merged);
    localStorage.setItem('userProfile', JSON.stringify(profileData));
    localStorage.setItem('user', JSON.stringify(merged));
    if (profileData.avatar) localStorage.setItem('userAvatar', profileData.avatar);
    setIsEditing(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleSettingsUpdate = async (category, newSettings) => {
    try {
      const res = await apiRequest(API_ENDPOINTS.PROFILE.SETTINGS, {
        method: 'PUT',
        body: JSON.stringify({ category, settings: newSettings })
      });
      if (!res.success) throw new Error();
    } catch { /* fallback */ }
    setSettings(prev => ({ ...prev, [category]: newSettings }));
    if (category === 'appearance' && newSettings.theme) setThemeMode(newSettings.theme);
    localStorage.setItem('userSettings', JSON.stringify({ ...settings, [category]: newSettings }));
  };

  // ── Avatar upload (unchanged logic, kept from prior implementation) ───────
  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Avatar must be under 5 MB.'); return; }
    if (!file.type.startsWith('image/')) { setError('Only image files are accepted.'); return; }
    const previewUrl = URL.createObjectURL(file);
    setProfileData(prev => ({ ...prev, avatar: previewUrl }));
    setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const uploadRes = await fetch(API_ENDPOINTS.UPLOAD.IMAGE, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) throw new Error(uploadData.message || 'Upload failed');
      const serverUrl = uploadData.data.url;
      URL.revokeObjectURL(previewUrl);
      setProfileData(prev => ({ ...prev, avatar: serverUrl }));
      const merged = { ...user, avatar: serverUrl };
      setUser(merged);
      localStorage.setItem('user', JSON.stringify(merged));
      localStorage.setItem('userAvatar', serverUrl);
      localStorage.setItem('userProfile', JSON.stringify({ ...profileData, avatar: serverUrl }));
      apiRequest(API_ENDPOINTS.PROFILE.AVATAR, {
        method: 'POST', body: JSON.stringify({ avatar: serverUrl })
      }).catch(() => {});
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setProfileData(prev => ({ ...prev, avatar: user?.avatar || '' }));
      setError(`Upload failed: ${err.message}`);
    }
    // Reset file input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCameraCapture = async (imageData) => {
    setProfileData(prev => ({ ...prev, avatar: imageData }));
    setError('');
    try {
      const blob = await (await fetch(imageData)).blob();
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
      const formData = new FormData();
      formData.append('image', file);
      const uploadRes = await fetch(API_ENDPOINTS.UPLOAD.IMAGE, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) throw new Error(uploadData.message || 'Upload failed');
      const serverUrl = uploadData.data.url;
      setProfileData(prev => ({ ...prev, avatar: serverUrl }));
      const merged = { ...user, avatar: serverUrl };
      setUser(merged);
      localStorage.setItem('user', JSON.stringify(merged));
      localStorage.setItem('userAvatar', serverUrl);
      apiRequest(API_ENDPOINTS.PROFILE.AVATAR, {
        method: 'POST', body: JSON.stringify({ avatar: serverUrl })
      }).catch(() => {});
    } catch (err) {
      setProfileData(prev => ({ ...prev, avatar: user?.avatar || '' }));
      setError(`Camera upload failed: ${err.message}`);
    }
    setShowCamera(false);
  };

  // ── Tab: Profile ──────────────────────────────────────────────────────────
  const renderProfileTab = () => (
    <div className="space-y-6">
      {/* Avatar card */}
      <div className="eco-card-full p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar + always-visible change controls */}
          <div className="flex-shrink-0 flex flex-col items-center gap-3">
            <div className="relative">
              <img
                src={resolveMediaUrl(profileData.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(profileData.name || 'U')}&background=10b981&color=fff&size=128`}
                alt="Profile avatar"
                className="w-28 h-28 rounded-full object-cover border-4 border-emerald-500/60 shadow-lg"
              />
              {/* Green ring pulse on hover */}
              <div className="absolute inset-0 rounded-full ring-2 ring-emerald-500/20 hover:ring-emerald-500/60 transition-all" />
            </div>
            {/* Avatar upload controls — always visible, not gated on edit mode */}
            <div className="flex gap-2">
              <label
                htmlFor="avatar-upload"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 rounded-lg text-xs font-medium cursor-pointer hover:bg-emerald-600/40 transition-colors"
                title="Upload photo"
              >
                <FaUpload className="w-3 h-3" />
                Upload
                <input
                  ref={fileInputRef}
                  id="avatar-upload"
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                />
              </label>
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a2a3a]/60 border border-white/10 text-gray-400 rounded-lg text-xs font-medium hover:bg-[#1a2a3a] hover:text-white transition-colors"
                title="Take photo"
              >
                <FaCamera className="w-3 h-3" />
                Camera
              </button>
            </div>
            {error && <p className="text-red-400 text-xs text-center max-w-[160px]">{error}</p>}
          </div>

          {/* Identity summary */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-white truncate">{profileData.name || 'EcoNet Member'}</h2>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  isEditing
                    ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30'
                    : 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/40'
                }`}
              >
                {isEditing ? <><FaTimes className="w-3 h-3" />Cancel</> : <><FaEdit className="w-3 h-3" />Edit</>}
              </button>
            </div>
            <p className="text-gray-400 text-sm mb-3">{profileData.email}</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Trust {profileData.reputation?.trustScore ?? 0}%
              </span>
              {typeof profileData.reputation?.reportsVerified === 'number' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 border border-blue-500/30 text-blue-400">
                  {profileData.reputation.reportsVerified} verified reports
                </span>
              )}
              {typeof profileData.reputation?.ecoCoins === 'number' && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  {profileData.reputation.ecoCoins} EcoCoins
                </span>
              )}
              {user?.role && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 border border-purple-500/30 text-purple-400 capitalize">
                  {user.role}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile form */}
      <div className="eco-card-full p-6">
        <h3 className="text-base font-semibold text-white mb-5">Profile information</h3>
        {saveSuccess && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
            <FaCheck className="w-3.5 h-3.5" /> Profile saved successfully.
          </div>
        )}
        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Full Name</label>
              <input
                type="text"
                value={profileData.name}
                onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                disabled={!isEditing}
                className="eco-input w-full disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
              <input
                type="email"
                value={profileData.email}
                onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                disabled={!isEditing}
                className="eco-input w-full disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Location</label>
              <input
                type="text"
                value={profileData.location}
                onChange={(e) => setProfileData(prev => ({ ...prev, location: e.target.value }))}
                disabled={!isEditing}
                className="eco-input w-full disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="City, Country"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Phone</label>
              <input
                type="tel"
                value={profileData.phone}
                onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                disabled={!isEditing}
                className="eco-input w-full disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Website</label>
              <input
                type="url"
                value={profileData.website}
                onChange={(e) => setProfileData(prev => ({ ...prev, website: e.target.value }))}
                disabled={!isEditing}
                className="eco-input w-full disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="https://"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Bio</label>
              <textarea
                value={profileData.bio}
                onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                disabled={!isEditing}
                rows={3}
                className="eco-input w-full disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                placeholder="Tell your story…"
              />
            </div>
          </div>

          {isEditing && (
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <FaSave className="w-3.5 h-3.5" /> Save changes
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-5 py-2 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Logout */}
      {onLogout && (
        <div className="eco-card-full p-4 flex justify-end">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            <FaSignOutAlt className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  );

  // ── Tab: Settings ─────────────────────────────────────────────────────────
  const SectionCard = ({ icon: Icon, title, children }) => (
    <div className="eco-card-full p-6">
      <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
        <Icon className="w-4 h-4 text-emerald-400" /> {title}
      </h3>
      {children}
    </div>
  );

  const Toggle = ({ checked, onChange }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        checked ? 'bg-emerald-500' : 'bg-white/10'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );

  const renderSettingsTab = () => (
    <div className="space-y-6">
      {/* Notifications */}
      <SectionCard icon={FaBell} title="Notifications">
        <div className="space-y-4">
          {Object.entries(settings.notifications).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <label className="text-sm text-gray-300 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</label>
              <Toggle
                checked={value}
                onChange={(v) => handleSettingsUpdate('notifications', { ...settings.notifications, [key]: v })}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Privacy */}
      <SectionCard icon={FaShieldAlt} title="Privacy">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Profile visibility</label>
            <select
              value={settings.privacy.profileVisibility}
              onChange={(e) => handleSettingsUpdate('privacy', { ...settings.privacy, profileVisibility: e.target.value })}
              className="eco-input w-full"
            >
              <option value="public">Public</option>
              <option value="friends">Friends only</option>
              <option value="private">Private</option>
            </select>
          </div>
          {Object.entries(settings.privacy)
            .filter(([key]) => key !== 'profileVisibility' && typeof settings.privacy[key] === 'boolean')
            .map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <label className="text-sm text-gray-300 capitalize">Show {key.replace(/([A-Z])/g, ' $1').trim()}</label>
                <Toggle
                  checked={value}
                  onChange={(v) => handleSettingsUpdate('privacy', { ...settings.privacy, [key]: v })}
                />
              </div>
            ))}
        </div>
      </SectionCard>

      {/* Appearance */}
      <SectionCard icon={FaMoon} title="Appearance">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Theme</label>
            <select
              value={settings.appearance.theme}
              onChange={(e) => handleSettingsUpdate('appearance', { ...settings.appearance, theme: e.target.value })}
              className="eco-input w-full"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="auto">System</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Language</label>
            <select
              value={settings.appearance.language}
              onChange={(e) => handleSettingsUpdate('appearance', { ...settings.appearance, language: e.target.value })}
              className="eco-input w-full"
            >
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="de">German</option>
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Security */}
      <SectionCard icon={FaLock} title="Security">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-300">Two-Factor Authentication</p>
              <p className="text-xs text-gray-500 mt-0.5">Add an extra layer of security</p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('/setup-2fa')}
              className="px-4 py-1.5 bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-600/40 transition-colors"
            >
              {settings.security.twoFactorAuth ? 'Manage' : 'Enable'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-300">Change Password</p>
              <p className="text-xs text-gray-500 mt-0.5">Update your password regularly</p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('/change-password')}
              className="px-4 py-1.5 bg-white/5 border border-white/10 text-gray-400 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
            >
              Change
            </button>
          </div>
        </div>
      </SectionCard>

      {/* LILO AI */}
      <SectionCard icon={FaCog} title="Lilo AI settings">
        <div className="space-y-4">
          {Object.entries(settings.ai).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-300 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</label>
                <p className="text-xs text-gray-500 mt-0.5">
                  {key === 'liloEnabled'       && 'Enable Lilo across the platform'}
                  {key === 'autoTagging'        && 'Auto-tag your reports'}
                  {key === 'contentFiltering'   && 'AI content moderation'}
                  {key === 'smartSuggestions'   && 'Smart suggestions in reports'}
                  {key === 'aiAssistance'       && 'AI-powered guidance'}
                </p>
              </div>
              <Toggle
                checked={value}
                onChange={(v) => handleSettingsUpdate('ai', { ...settings.ai, [key]: v })}
              />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="eco-page eco-fade-up">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Your profile</h1>
            <p className="text-gray-400 text-sm mt-1">Manage your identity, preferences, and security settings</p>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 mb-8 p-1 bg-white/5 rounded-xl border border-white/10">
            {[
              { id: 'profile',  label: 'Profile',  icon: FaUser },
              { id: 'settings', label: 'Settings', icon: FaCog }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'profile'  && renderProfileTab()}
          {activeTab === 'settings' && renderSettingsTab()}
        </div>
      </div>

      {showCamera && (
        <CameraCapture
          onImageCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </>
  );
}

export default Profile;
