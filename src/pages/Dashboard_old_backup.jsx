import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import SocialDashboard from '../components/SocialDashboard';
import DashboardContainer from '../features/dashboard/DashboardContainer';
import LeafCounter from '../components/LeafCounter';
import LiveStreaming from '../components/LiveStreaming';
import MapView from '../components/MapView';
import { useAuth } from '../context/AuthContext';
import { FaFileAlt, FaCamera, FaRobot, FaChartLine, FaMapMarkerAlt, FaBolt, FaCog, FaLeaf, FaTv, FaUsers, FaEye } from 'react-icons/fa';

/**
 * Dashboard Page - pure UI orchestrator
 * Delegates all logic to DashboardContainer
 */
function Dashboard({ user, onLogout, onNavigate, isCommandMode }) {
  const { user: currentUser } = useAuth(); // Get real-time user updates
  const dashboard = DashboardContainer({ user: currentUser || user, onLogout, onNavigate });
  const { PostComposer, FeedList, ImageUploader } = dashboard;
  
  // State for feed filtering
  const [activeFilter, setActiveFilter] = useState('trending');
  const [filteredFeed, setFilteredFeed] = useState(dashboard.feed || []);

  // Handle filter changes
  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    
    if (filter === 'trending') {
      // Sort by engagement (likes, comments, shares)
      const trending = [...(dashboard.feed || [])].sort((a, b) => {
        const aEngagement = (a.likes?.length || 0) + (a.comments?.length || 0) + (a.shares?.length || 0);
        const bEngagement = (b.likes?.length || 0) + (b.comments?.length || 0) + (b.shares?.length || 0);
        return bEngagement - aEngagement;
      });
      setFilteredFeed(trending);
    } else if (filter === 'nearby') {
      // Filter by user's location (Nigeria as default)
      const userLocation = user?.location || { city: 'Abuja', state: 'FCT', country: 'Nigeria' };
      const nearby = (dashboard.feed || []).filter(report => 
        report.location?.country === userLocation.country ||
        report.location?.state === userLocation.state ||
        report.location?.city === userLocation.city
      );
      setFilteredFeed(nearby);
    } else if (filter === 'recent') {
      // Sort by most recent
      const recent = [...(dashboard.feed || [])].sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      );
      setFilteredFeed(recent);
    }
  };

  // Initialize with trending data
  useEffect(() => {
    handleFilterChange('trending');
  }, [dashboard.feed]);

  return (
    <MainLayout user={user} onLogout={onLogout} onNavigate={onNavigate}>
      <SocialDashboard 
        user={currentUser || user} 
        reports={dashboard.feed || []}
        isCommandMode={isCommandMode}
      />
    </MainLayout>
  );
                          <span className="font-medium">Member since</span> 2024
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Enhanced Stats Grid */}
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="group relative bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 rounded-2xl p-6 text-center shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                      <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity duration-300"></div>
                      <div className="relative">
                        <div className="text-3xl font-bold text-white mb-2">{currentUser?.reputation?.trustScore || user?.reputation?.trustScore || 0}</div>
                        <div className="text-emerald-100 font-semibold text-sm uppercase tracking-wide">Trust Score</div>
                        <div className="mt-2 flex justify-center">
                          <svg className="w-4 h-4 text-emerald-200" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.299.749-.299.749 0 .449.225.675.299.749-.299H12.5c.449 0 .675.225.749.299.749 0 .449-.225.675-.299.749-.299z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    
                    <div className="group relative bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 rounded-2xl p-6 text-center shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                      <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity duration-300"></div>
                      <div className="relative">
                        <div className="text-3xl font-bold text-white mb-2">{user?.followers?.length || 0}</div>
                        <div className="text-blue-100 font-semibold text-sm uppercase tracking-wide">Followers</div>
                        <div className="mt-2 flex justify-center">
                          <svg className="w-4 h-4 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zm-1 2a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V9a1 1 0 00-1-1H8z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                    
                    <div className="group relative bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 rounded-2xl p-6 text-center shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                      <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity duration-300"></div>
                      <div className="relative">
                        <div className="text-3xl font-bold text-white mb-2">{currentUser?.reputation?.reportsVerified || user?.reputation?.reportsVerified || 0}</div>
                        <div className="text-purple-100 font-semibold text-sm uppercase tracking-wide">Reports</div>
                        <div className="mt-2 flex justify-center">
                          <svg className="w-4 h-4 text-purple-200" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                            <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 1 1 0 000 2H6a2 2 0 100 4h2a2 2 0 100-4h2a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V5z"/>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-3">
                    <button 
                      onClick={() => onNavigate('profile')}
                      className="flex-1 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 py-3 px-6 rounded-2xl font-semibold hover:from-gray-200 hover:to-gray-300 transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5"
                    >
                      Edit Profile
                    </button>
                    <button className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-3 px-6 rounded-2xl font-semibold hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                      Share Profile
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Quick Actions */}
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => onNavigate('submit-report')}
                  className="group relative bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl py-3 px-3 hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 font-medium flex flex-col items-center justify-center text-xs shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <FaFileAlt className="w-4 h-4 mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="font-semibold tracking-wide">Report</span>
                </button>
                <button 
                  onClick={() => {
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.onchange = (e) => {
                      if (e.target.files.length > 0) {
                        onNavigate('submit-report');
                        sessionStorage.setItem('pendingImage', JSON.stringify({
                          name: e.target.files[0].name,
                          size: e.target.files[0].size,
                          type: e.target.files[0].type
                        }));
                      }
                    };
                    fileInput.click();
                  }}
                  className="group relative bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl py-3 px-3 hover:from-blue-600 hover:to-blue-700 transition-all duration-200 font-medium flex flex-col items-center justify-center text-xs shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  <FaCamera className="w-4 h-4 mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="font-semibold tracking-wide">Photo</span>
                </button>
                  <button 
                    onClick={() => {
                      const fileInput = document.createElement('input');
                      fileInput.type = 'file';
                      fileInput.accept = 'image/*';
                      fileInput.onchange = (e) => {
                        if (e.target.files.length > 0) {
                          onNavigate('submit-report');
                          sessionStorage.setItem('pendingImage', JSON.stringify({
                            name: e.target.files[0].name,
                            size: e.target.files[0].size,
                            type: e.target.files[0].type
                          }));
                        }
                      };
                      fileInput.click();
                    }}
                    className="group relative bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl py-3 px-3 hover:from-blue-600 hover:to-blue-700 transition-all duration-200 font-medium flex flex-col items-center justify-center text-xs shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    <FaCamera className="w-4 h-4 mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="font-semibold tracking-wide">Upload</span>
                  </button>
                  <button 
                    onClick={() => {
                      const liloModal = document.getElementById('lilo-ai-modal');
                      if (liloModal) {
                        liloModal.style.display = 'block';
                      } else {
                        const liloWidget = document.querySelector('[data-lilo-widget]');
                        if (liloWidget) {
                          liloWidget.scrollIntoView({ behavior: 'smooth' });
                        }
                      }
                    }}
                    className="group relative bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl py-3 px-3 hover:from-purple-600 hover:to-purple-700 transition-all duration-200 font-medium flex flex-col items-center justify-center text-xs shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                  >
                    <FaRobot className="w-4 h-4 mb-1.5 group-hover:scale-110 transition-transform" />
                    <span className="font-semibold tracking-wide">AI</span>
                  </button>
                </div>
              </div>

              {/* Mobile Map */}
              <div className="bg-gradient-to-br from-white via-gray-50/30 to-white rounded-2xl shadow-lg border border-gray-200/50 p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900 text-lg">Environmental Map</h3>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-600 font-medium">Live</span>
                  </div>
                </div>
                <div className="h-64 rounded-xl overflow-hidden shadow-inner border border-gray-200/30">
                  <MapView reports={dashboard.feed} />
                </div>
              </div>
            </div>

            {/* Main Feed - Responsive */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                {/* Feed Header */}
                <div className="border-b border-gray-200 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <h2 className="text-lg font-semibold text-gray-900">Environmental Intelligence Feed</h2>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => handleFilterChange('trending')}
                        className={`px-3 py-1 text-sm rounded-full transition-colors flex items-center ${
                          activeFilter === 'trending' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <FaChartLine className="w-3 h-3 mr-1" />
                        <span className="hidden sm:inline">Trending</span>
                        <span className="sm:hidden">Trend</span>
                      </button>
                      <button 
                        onClick={() => handleFilterChange('nearby')}
                        className={`px-3 py-1 text-sm rounded-full transition-colors flex items-center ${
                          activeFilter === 'nearby' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <FaMapMarkerAlt className="w-3 h-3 mr-1" />
                        <span className="hidden sm:inline">Nearby</span>
                        <span className="sm:hidden">Local</span>
                      </button>
                      <button 
                        onClick={() => handleFilterChange('recent')}
                        className={`px-3 py-1 text-sm rounded-full transition-colors flex items-center ${
                          activeFilter === 'recent' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <FaBolt className="w-3 h-3 mr-1" />
                        <span className="hidden sm:inline">Recent</span>
                        <span className="sm:hidden">New</span>
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Feed Content */}
                <div className="p-4">
                  <FeedList 
                    reports={filteredFeed}
                    loading={dashboard.feedLoading}
                    error={dashboard.feedError}
                    onLike={dashboard.handleLike}
                    onComment={dashboard.handleComment}
                    onRefresh={dashboard.refreshFeed}
                  />
                </div>
              </div>
            </div>

            {/* Right Sidebar - Responsive */}
            <div className="lg:col-span-1 space-y-4 lg:space-y-6">
              {/* Post Composer */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Share Environmental Update</h3>
                <PostComposer />
              </div>

              {/* Live Streaming */}
              <LiveStreaming user={user} onNavigate={onNavigate} />

              
              {/* Leaf Counter */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">EcoCoin Balance</h3>
                <LeafCounter />
              </div>

              {/* Command Mode */}
              {isCommandMode && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Command Center</h3>
                  <div className="space-y-2">
                    <div className="p-3 bg-emerald-50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-emerald-700">Systems Online</span>
                      </div>
                    </div>
                    <button className="w-full bg-gray-900 text-white rounded-lg py-2 px-4 hover:bg-gray-800 transition-colors font-medium flex items-center justify-center">
                      <FaCog className="w-4 h-4 mr-2" />
                      Launch Command Mode
                    </button>
                  </div>
                </div>
              )}

              {/* Trending Topics */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">Trending Topics</h3>
                <div className="space-y-2">
                  {['#ClimateAction', '#FloodAlert', '#AirQuality', '#GreenTech', '#Sustainability'].map((tag, i) => (
                    <div key={i} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors">
                      <span className="text-sm font-medium text-emerald-600">{tag}</span>
                      <span className="text-xs text-gray-500">{Math.floor(Math.random() * 1000) + 100} posts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
  );
}

export default Dashboard;
