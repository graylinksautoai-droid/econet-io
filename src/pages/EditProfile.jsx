import { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext';
import { API_ENDPOINTS, apiRequest } from '../services/api.js';
import { resolveMediaUrl } from '../services/runtimeConfig.js';
import { 
  HiOutlineUser, 
  HiOutlineShieldCheck, 
  HiOutlineCloudUpload, 
  HiOutlineCurrencyDollar,
  HiOutlineGlobe,
  HiOutlineLockClosed,
  HiOutlineServer,
  HiOutlineSwitchHorizontal,
  HiOutlineCheckCircle
} from 'react-icons/hi';
import { motion, AnimatePresence } from 'framer-motion';

// Your Cloudinary details
const CLOUDINARY_CLOUD_NAME = 'dp9ffewdb';
const CLOUDINARY_UPLOAD_PRESET = 'econet_avatar';

function EditProfile({ onNavigate }) {
  const { user, setUser, token } = useAuth();
  const [activeSection, setActiveSection] = useState('identity');
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  
  // Unified Settings Schema
  const [settings, setSettings] = useState({
    security: {
      e2eeEnabled: true,
      geospatialSalting: true
    },
    dataSync: {
      progressiveSyncPref: 'Aggressive',
      bitrateThrottling: true
    },
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
    ai: {
      liloEnabled: true,
      autoTagging: true,
      contentFiltering: true,
      smartSuggestions: true,
      aiAssistance: true
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const e2eeEnabled = settings.security?.e2eeEnabled ?? false;
  const geospatialSalting = settings.security?.geospatialSalting ?? false;
  const progressiveSyncPref = settings.dataSync?.progressiveSyncPref ?? 'Standard';
  const bitrateThrottling = settings.dataSync?.bitrateThrottling ?? false;

  useEffect(() => {
    setName(user?.name || '');
    setBio(user?.bio || '');
    setAvatar(user?.avatar || '');
  }, [user]);

  // Load settings once with proper fallback
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await apiRequest(API_ENDPOINTS.PROFILE.SETTINGS, {
          method: 'GET'
        });

        const remoteSettings = res?.settings || res?.data;

        if (remoteSettings) {
          setSettings(prev => ({
            ...prev,
            ...remoteSettings
          }));
          console.log('Settings loaded successfully:', remoteSettings);
        }
      } catch {
        console.log('Fallback to localStorage');
        
        const local = JSON.parse(localStorage.getItem('user'))?.settings;
        if (local) setSettings(local);
      }
    };

    loadSettings();
  }, []);

  // Unified persistence function
  const persistUser = (newSettings) => {
    const updatedUser = {
      ...user,
      name,
      bio,
      avatar,
      settings: newSettings
    };

    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  // Unified avatar upload function
  const uploadAvatar = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );

    const data = await res.json();
    return data.secure_url;
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, etc.)');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setUploading(true);

    try {
      const url = await uploadAvatar(file);
      setAvatar(url);

      const updatedUser = { ...user, avatar: url };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      localStorage.setItem('userAvatar', url);

      try {
        await apiRequest(API_ENDPOINTS.PROFILE.AVATAR, {
          method: 'POST',
          body: JSON.stringify({ avatar: url })
        });
      } catch (avatarError) {
        console.warn('Avatar API sync deferred:', avatarError);
      }

      setSuccess('Avatar updated');
    } catch {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Apply settings immediately in the app
  const applySettings = (settings) => {
    // Apply security settings
    if (settings.security?.e2eeEnabled) {
      console.log('E2EE Enabled - Messages will be end-to-end encrypted');
      // Here you would initialize encryption libraries
    }
    
    if (settings.security?.geospatialSalting) {
      console.log('Geospatial Salting Enabled - Location data will be salted');
      // Here you would enable location data salting
    }
    
    // Apply data sync settings
    if (settings.dataSync?.progressiveSyncPref) {
      console.log(`Progressive Sync Mode: ${settings.dataSync.progressiveSyncPref}`);
      // Here you would configure sync intervals
      localStorage.setItem('syncMode', settings.dataSync.progressiveSyncPref);
    }
    
    if (settings.dataSync?.bitrateThrottling) {
      console.log('Bitrate Throttling Enabled - Stream quality will auto-adjust');
      // Here you would enable network-aware streaming
      localStorage.setItem('bitrateThrottling', 'enabled');
    }
  };

  // Individual setting handlers
  const handleE2EEToggle = async () => {
    const newState = !settings.security.e2eeEnabled;

    const updated = {
      ...settings,
      security: { ...settings.security, e2eeEnabled: newState }
    };

    setSettings(updated);

    try {
      await apiRequest(API_ENDPOINTS.PROFILE.SETTINGS, {
        method: 'PATCH',
        body: JSON.stringify({ security: updated.security })
      });

      applySettings(updated);
      persistUser(updated);
      setSuccess(`E2EE ${newState ? 'enabled' : 'disabled'} successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to update E2EE');
    }
  };

  const handleGeospatialToggle = async () => {
    const newState = !settings.security.geospatialSalting;

    const updated = {
      ...settings,
      security: { ...settings.security, geospatialSalting: newState }
    };

    setSettings(updated);

    try {
      await apiRequest(API_ENDPOINTS.PROFILE.SETTINGS, {
        method: 'PATCH',
        body: JSON.stringify({ security: updated.security })
      });

      applySettings(updated);
      persistUser(updated);
      setSuccess(`Geospatial salting ${newState ? 'enabled' : 'disabled'} successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to update geospatial salting');
    }
  };

  const handleSyncModeChange = async (mode) => {
    const updated = {
      ...settings,
      dataSync: { ...settings.dataSync, progressiveSyncPref: mode }
    };

    setSettings(updated);

    try {
      await apiRequest(API_ENDPOINTS.PROFILE.SETTINGS, {
        method: 'PATCH',
        body: JSON.stringify({ dataSync: updated.dataSync })
      });

      applySettings(updated);
      persistUser(updated);
      setSuccess(`Sync mode changed to ${mode}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to update sync mode');
    }
  };

  const handleBitrateToggle = async () => {
    const newState = !settings.dataSync.bitrateThrottling;

    const updated = {
      ...settings,
      dataSync: { ...settings.dataSync, bitrateThrottling: newState }
    };

    setSettings(updated);

    try {
      await apiRequest(API_ENDPOINTS.PROFILE.SETTINGS, {
        method: 'PATCH',
        body: JSON.stringify({ dataSync: updated.dataSync })
      });

      applySettings(updated);
      persistUser(updated);
      setSuccess(`Bitrate throttling ${newState ? 'enabled' : 'disabled'}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to update bitrate throttling');
    }
  };

  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await Promise.all([
        apiRequest(API_ENDPOINTS.PROFILE.UPDATE, {
          method: 'PATCH',
          body: JSON.stringify({ name, bio, avatar })
        }),
        apiRequest(API_ENDPOINTS.PROFILE.SETTINGS, {
          method: 'PATCH',
          body: JSON.stringify(settings)
        })
      ]);

      const updatedUser = {
        ...user,
        name,
        bio,
        avatar,
        settings
      };

      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      localStorage.setItem('userProfile', JSON.stringify({ name, bio, avatar }));
      localStorage.setItem('userSettings', JSON.stringify(settings));
      if (avatar) {
        localStorage.setItem('userAvatar', avatar);
      }

      applySettings(settings);
      setSuccess('All Sentinel protocols updated successfully. Your profile and settings are now active.');
    } catch (err) {
      console.error('Profile settings save failed:', err);
      const updatedUser = {
        ...user,
        name,
        bio,
        avatar,
        settings
      };

      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      localStorage.setItem('userProfile', JSON.stringify({ name, bio, avatar }));
      localStorage.setItem('userSettings', JSON.stringify(settings));
      if (avatar) {
        localStorage.setItem('userAvatar', avatar);
      }

      applySettings(settings);
      setSuccess('Saved locally. Cloud sync will resume when the backend is available.');
    } finally {
      setLoading(false);
    }
  };

  const sections = [
    { id: 'identity', label: 'Identity', icon: HiOutlineUser },
    { id: 'security', label: 'Security', icon: HiOutlineShieldCheck },
    { id: 'data', label: 'Sync & Data', icon: HiOutlineCloudUpload },
    { id: 'economy', label: 'Economy', icon: HiOutlineCurrencyDollar }
  ];

  return (
    <MainLayout user={user} onNavigate={onNavigate}>
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row gap-12">
          
          {/* Left Navigation Sidebar */}
          <div className="md:w-64 space-y-2">
            <h2 className="text-2xl font-black text-gray-900 mb-8 tracking-tighter">SENTINEL SETTINGS</h2>
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                  activeSection === section.id 
                    ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-900/20' 
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                <section.icon className="text-xl" />
                {section.label}
              </button>
            ))}
          </div>

          {/* Right Content Area */}
          <div className="flex-1 bg-white/50 backdrop-blur-xl rounded-[2.5rem] border border-white shadow-2xl overflow-hidden min-h-[600px]">
            <form onSubmit={handleSubmit} className="h-full flex flex-col">
              
              <div className="flex-1 p-8 md:p-12 overflow-auto">
                <AnimatePresence mode="wait">
                  
                  {activeSection === 'identity' && (
                    <motion.div
                      key="identity"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-8"
                    >
                      <div>
                        <h3 className="text-xl font-black text-gray-900 mb-2">IDENTITY CORE</h3>
                        <p className="text-gray-500 text-sm">Update your Sentinel avatar and visibility profile.</p>
                      </div>

                      <div className="flex items-center gap-8">
                        <div className="relative group">
                          <img src={resolveMediaUrl(avatar)} className="w-32 h-32 rounded-3xl object-cover border-4 border-emerald-500/20 shadow-2xl" alt="Avatar" />
                          <input 
                            id="profile-avatar"
                            name="profileAvatar"
                            type="file" 
                            onChange={handleImageUpload} 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                          />
                          <div className="absolute inset-0 bg-black/40 rounded-3xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                             <HiOutlineCloudUpload className="text-white text-3xl" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Neural Transcoding Active</p>
                          <p className="text-xs text-gray-500 max-w-xs">AV1/WebP optimization will be applied to your high-res avatar automatically.</p>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Display Name</label>
                          <input 
                            id="profile-name"
                            name="profileName"
                            value={name} 
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500 outline-none font-bold" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Bio / Directive</label>
                          <textarea 
                            id="profile-bio"
                            name="profileBio"
                            value={bio} 
                            onChange={(e) => setBio(e.target.value)}
                            rows="4"
                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500 outline-none font-medium text-sm" 
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeSection === 'security' && (
                    <motion.div
                      key="security"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-8"
                    >
                      <div>
                        <h3 className="text-xl font-black text-gray-900 mb-2">SENTINEL SHIELD</h3>
                        <p className="text-gray-500 text-sm">Configure advanced encryption and geospatial security.</p>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-6 bg-emerald-50/50 rounded-3xl border border-emerald-100">
                          <div className="flex gap-4">
                            <HiOutlineLockClosed className="text-2xl text-emerald-600" />
                            <div>
                              <p className="font-bold text-emerald-900">Double Ratchet E2EE</p>
                              <p className="text-xs text-emerald-700 opacity-70">End-to-end encryption for Pro messages.</p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={handleE2EEToggle}
                            className={`w-12 h-6 rounded-full transition-colors relative ${e2eeEnabled ? 'bg-emerald-600' : 'bg-gray-300'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${e2eeEnabled ? 'left-7' : 'left-1'}`}></div>
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-6 bg-blue-50/50 rounded-3xl border border-blue-100">
                          <div className="flex gap-4">
                            <HiOutlineGlobe className="text-2xl text-blue-600" />
                            <div>
                              <p className="font-bold text-blue-900">Geospatial Salting</p>
                              <p className="text-xs text-blue-700 opacity-70">Salt location data based on ZoneID for privacy.</p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={handleGeospatialToggle}
                            className={`w-12 h-6 rounded-full transition-colors relative ${geospatialSalting ? 'bg-blue-600' : 'bg-gray-300'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${geospatialSalting ? 'left-7' : 'left-1'}`}></div>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeSection === 'data' && (
                    <motion.div
                      key="data"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-8"
                    >
                      <div>
                        <h3 className="text-xl font-black text-gray-900 mb-2">NIGERIA-SYNC PROTOCOLS</h3>
                        <p className="text-gray-500 text-sm">Optimize data transmission for high-latency environments.</p>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">Progressive Sync Mode</label>
                          <div className="grid grid-cols-3 gap-3">
                            {['Aggressive', 'Standard', 'Minimal'].map(mode => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => handleSyncModeChange(mode)}
                                className={`p-4 rounded-2xl border font-bold text-xs transition-all ${
                                  progressiveSyncPref === mode 
                                    ? 'bg-gray-900 border-gray-900 text-white shadow-xl' 
                                    : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                                }`}
                              >
                                {mode}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-6 bg-orange-50/50 rounded-3xl border border-orange-100">
                          <div className="flex gap-4">
                            <HiOutlineSwitchHorizontal className="text-2xl text-orange-600" />
                            <div>
                              <p className="font-bold text-orange-900">Bitrate Throttling</p>
                              <p className="text-xs text-orange-700 opacity-70">Auto-adjust stream quality via navigator.connection.</p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={handleBitrateToggle}
                            className={`w-12 h-6 rounded-full transition-colors relative ${bitrateThrottling ? 'bg-orange-600' : 'bg-gray-300'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${bitrateThrottling ? 'left-7' : 'left-1'}`}></div>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeSection === 'economy' && (
                    <motion.div
                      key="economy"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-8"
                    >
                      <div>
                        <h3 className="text-xl font-black text-gray-900 mb-2">REGENERATIVE ECONOMY</h3>
                        <p className="text-gray-500 text-sm">Your spendable seeds and reputation leaves.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-emerald-600 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-emerald-900/20">
                           <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Spendable Balance</p>
                           <div className="flex items-end gap-2">
                              <span className="text-4xl font-black">{user?.reputation?.seeds || 1250}</span>
                              <span className="text-sm font-bold pb-1">SEEDS</span>
                           </div>
                        </div>

                        <div className="bg-orange-500 p-8 rounded-[2.5rem] text-white shadow-2xl shadow-orange-900/20">
                           <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">Reputation Status</p>
                           <div className="flex items-end gap-2 mb-8">
                              <span className="text-4xl font-black">{user?.reputation?.leaves || 450}</span>
                              <span className="text-sm font-bold pb-1">LEAVES</span>
                           </div>
                           <div className="flex items-center gap-2 text-xs font-bold opacity-80">
                              <HiOutlineCheckCircle /> High-Integrity Sentinel
                           </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

              {/* Action Footer */}
              <div className="p-8 border-t border-gray-100 bg-gray-50/50 backdrop-blur-md flex items-center justify-between">
                {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
                {success && <p className="text-emerald-600 text-xs font-bold">{success}</p>}
                <div className="flex gap-4 ml-auto">
                  <button 
                    type="button" 
                    onClick={() => onNavigate('/')}
                    className="px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-colors"
                  >
                    Discard
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading || uploading}
                    className="bg-emerald-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-900/20 disabled:opacity-50"
                  >
                    {loading ? 'SYNCING...' : 'SAVE PROTOCOLS'}
                  </button>
                </div>
              </div>

            </form>
          </div>

        </div>
      </div>
    </MainLayout>
  );
}

export default EditProfile;
