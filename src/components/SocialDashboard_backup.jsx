import React, { useState, useEffect } from 'react';
import { FaTwitter, FaLinkedin, FaHashtag, FaFire, FaUsers, FaComments, FaHeart, FaShare, FaGlobe, FaShieldAlt, FaExclamationTriangle, FaRobot, FaTerminal, FaUserFriends } from 'react-icons/fa';
import { useLiloCore } from '../lilo/core/useLiloCore';
import { useVoiceInterface } from '../hooks/useVoiceInterface';
import LiloAI from './LiloAI';
import CommandCenter from './CommandCenter';

/**
 * Social Dashboard - Twitter/LinkedIn Style Interface
 * Features trending topics, hashtags, command/social modes, responsive design
 */
const SocialDashboard = ({ user, reports = [] }) => {
  // State Management
  const [mode, setMode] = useState('social'); // 'social' or 'command'
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState('');
  const [trending, setTrending] = useState([]);
  const [activeTab, setActiveTab] = useState('feed');
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // LILO Integration
  const { process, voiceEnabled, toggleVoice, isProcessing } = useLiloCore();
  const { isListening, isSpeaking, startListening, stopListening, transcript, voiceSupported } = useVoiceInterface();

  // Responsive Detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize Data
  useEffect(() => {
    // Transform reports into social posts
    const socialPosts = reports.map(report => ({
      id: report.id,
      author: user?.name || 'Anonymous User',
      avatar: user?.avatar || 'https://via.placeholder.com/40x40',
      content: report.description || 'Environmental report',
      timestamp: report.timestamp || new Date(),
      likes: Math.floor(Math.random() * 50),
      comments: Math.floor(Math.random() * 20),
      shares: Math.floor(Math.random() * 10),
      tags: ['#environment', '#climate', report.type ? `#${report.type}` : '#report'],
      verified: Math.random() > 0.7,
      urgency: report.urgency || 'medium'
    }));

    setPosts(socialPosts);

    // Generate trending topics
    const trendingTopics = [
      { tag: '#ClimateAction', count: 15420, trend: 'up' },
      { tag: '#EcoNet', count: 12350, trend: 'up' },
      { tag: '#GreenEnergy', count: 8920, trend: 'down' },
      { tag: '#Sustainability', count: 7680, trend: 'up' },
      { tag: '#CarbonNeutral', count: 5430, trend: 'stable' },
      { tag: '#Renewable', count: 4210, trend: 'up' },
      { tag: '#ClimateCrisis', count: 3890, trend: 'up' },
      { tag: '#NetZero', count: 3200, trend: 'down' }
    ];

    setTrending(trendingTopics);
  }, [reports, user]);

  // Handle Post Creation
  const createPost = () => {
    if (!newPost.trim() || isProcessing) return;
    
    setIsProcessing(true);
    
    // Add post to feed
    const post = {
      id: Date.now().toString(),
      author: user?.name || 'Anonymous',
      avatar: user?.avatar || 'https://via.placeholder.com/48x48/4a5568/ffffff?text=User',
      content: newPost,
      timestamp: new Date(),
      likes: 0,
      comments: 0,
      shares: 0,
      verified: user?.verified || false,
      urgency: mode === 'command' ? 'high' : 'medium',
      type: mode === 'command' ? 'command' : 'social',
      upvotes: 0,
      validated: false,
      ai_confidence: (post.type?.includes('climate') || post.type?.includes('flood') || post.type?.includes('pollution')) ? Math.floor(Math.random() * 30 + 70) : 0
    };
    
    setPosts(prev => [post, ...prev]);
    setNewPost('');
    
    // Process with LILO if in command mode
    if (mode === 'command' && process) {
      process(newPost);
    }
    
    setIsProcessing(false);
  };

  // Extract hashtags from text
  const extractHashtags = (text) => {
    const hashtags = text.match(/#\w+/g) || [];
    return hashtags.length > 0 ? hashtags : ['#general'];
  };

  // Handle Voice Input
  useEffect(() => {
    if (transcript && !isListening && mode === 'command') {
      setNewPost(transcript);
    }
  }, [transcript, isListening, mode]);

  // Format timestamp
  const formatTime = (timestamp) => {
    const now = new Date();
    const postTime = new Date(timestamp);
    const diff = Math.floor((now - postTime) / 1000);

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div>
      {mode === 'command' ? (
        <CommandCenter reports={reports} user={user} />
      ) : (
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Title */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-green-600 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                  EN
                </div>
                <span className="text-xl font-bold text-gray-900">EcoNet IO</span>
              </div>
              
              {/* Live Button */}
              <button className="flex items-center space-x-2 px-3 py-1 bg-red-600 text-white rounded-full text-sm font-medium hover:bg-red-700 transition-colors">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span>LIVE</span>
              </button>
            </div>
              <div className="hidden md:flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setMode('social')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    mode === 'social' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FaUserFriends className="inline mr-2" />
                  Social
                </button>
                <button
                  onClick={() => setMode('command')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    mode === 'command' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FaTerminal className="inline mr-2" />
                  Command
                </button>
              </div>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              <FaGlobe className="w-5 h-5" />
            </button>

            {/* User Actions */}
            <div className="hidden md:flex items-center space-x-4">
              {voiceSupported && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`p-2 rounded-lg transition-colors ${
                    isListening 
                      ? 'bg-red-100 text-red-600 animate-pulse' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {isListening ? <FaRobot className="w-4 h-4" /> : <FaRobot className="w-4 h-4" />}
                </button>
              )}
              <div className="flex items-center space-x-2">
                <img 
                  src={user?.avatar || 'https://via.placeholder.com/32x32'} 
                  alt={user?.name}
                  className="w-8 h-8 rounded-full" 
                />
                <span className="text-sm font-medium text-gray-900">{user?.name}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Main Content */}
          <main className={`flex-1 ${sidebarOpen ? 'hidden md:block' : ''}`}>
            {/* Create Post */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex space-x-3">
                <img 
                  src={user?.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face'} 
                  alt={user?.name}
                  className="w-10 h-10 rounded-full object-cover" 
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/40x40/4a5568/ffffff?text=User';
                  }}
                />
                <div className="flex-1">
                  <textarea
                    value={newPost}
                    onChange={(e) => setNewPost(e.target.value)}
                    placeholder={mode === 'command' ? "Enter command..." : "What's happening?"}
                    className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    rows={3}
                  />
                  <div className="flex justify-between items-center mt-3">
                    <div className="flex space-x-2">
                      <span className="text-xs text-gray-500">
                        {mode === 'command' ? (
                          <><FaTerminal className="inline mr-1" />Command Mode Active</>
                        ) : (
                          <><FaUserFriends className="inline mr-1" />Social Mode</>
                        )}
                      </span>
                    </div>
                    <div className="flex space-x-3">
                      <button
                        onClick={() => setNewPost('')}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={createPost}
                        disabled={!newPost.trim() || isProcessing}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        {isProcessing ? 'Processing...' : mode === 'command' ? 'Execute' : 'Post'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Feed */}
            <div className="space-y-4">
              {posts.map(post => (
                <article key={post.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow relative">
                  {/* LED Status Bar for Post */}
                  <div className={`absolute top-0 left-0 right-0 h-1 rounded-t-lg ${
                    post.urgency === 'critical' ? 'bg-red-600' :
                    post.urgency === 'high' ? 'bg-orange-600' :
                    post.urgency === 'medium' ? 'bg-yellow-600' :
                    post.type?.includes('climate') || post.type?.includes('flood') || post.type?.includes('pollution') ? 'bg-blue-600' :
                    'bg-gray-400'
                  } shadow-lg animate-pulse`}></div>
                  <div className="flex space-x-3">
                    <img 
                      src={post.avatar} 
                      alt={post.author}
                      className="w-12 h-12 rounded-full object-cover"
                      onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/48x48/4a5568/ffffff?text=User';
                      }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-medium text-gray-900">{post.author}</h3>
                        {post.verified && (
                          <FaShieldAlt className="w-4 h-4 text-blue-500" title="Verified Account" />
                        )}
                        {post.urgency === 'critical' && (
                          <FaExclamationTriangle className="w-4 h-4 text-red-500" title="Critical Urgency" />
                        )}
                        <span className="text-gray-500 text-sm">·</span>
                        <time className="text-gray-500 text-sm">{formatTime(post.timestamp)}</time>
                      </div>
                      
                      <div className="mt-2 text-gray-900">
                        {post.content}
                      </div>

                      {/* AI Confidence Score for Climate Posts */}
                      {post.ai_confidence > 0 && (
                        <div className="mt-2 flex items-center space-x-2 text-xs">
                          <span className="text-gray-500">AI Confidence:</span>
                          <span className={`font-bold ${
                            post.ai_confidence >= 90 ? 'text-green-600' :
                            post.ai_confidence >= 80 ? 'text-blue-600' :
                            post.ai_confidence >= 70 ? 'text-yellow-600' :
                            'text-orange-600'
                          }`}>
                            {post.ai_confidence}%
                          </span>
                          <span className="text-gray-400">• Verified Climate Occurrence</span>
                        </div>
                      )}

                      {/* Tags */}
                      {post.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {post.tags.map((tag, index) => (
                            <span 
                              key={index}
                              className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full hover:bg-green-200 cursor-pointer"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-gray-500">
                          {/* Upvote/Validate Button for Climate Posts */}
                          {(post.type?.includes('climate') || post.type?.includes('flood') || post.type?.includes('pollution')) && (
                            <button 
                              onClick={() => {
                                setPosts(prev => prev.map(p => 
                                  p.id === post.id ? { ...p, upvotes: (p.upvotes || 0) + 1, validated: true } : p
                                ))
                              }}
                              className="flex items-center space-x-1 text-gray-400 hover:text-green-600 transition-colors"
                              title="Validate this climate occurrence"
                            >
                              <span className="text-xs font-bold">↑</span>
                              <span className="text-sm">{post.upvotes || 0}</span>
                            </button>
                          )}
                          
                          <button className="flex items-center space-x-1 text-gray-400 hover:text-red-600 transition-colors">
                            <FaHeart className="w-4 h-4" />
                            <span className="text-sm">{post.likes || 0}</span>
                          </button>
                          <button className="flex items-center space-x-1 text-gray-400 hover:text-blue-600 transition-colors">
                            <FaComments className="w-4 h-4" />
                            <span className="text-sm">{post.comments || 0}</span>
                          </button>
                          <button className="flex items-center space-x-1 text-gray-400 hover:text-green-600 transition-colors">
                            <FaShare className="w-4 h-4" />
                            <span className="text-sm">{post.shares || 0}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </main>

          {/* Sidebar - Trending */}
          <aside className={`${sidebarOpen ? 'block' : 'hidden'} md:block w-80 flex-shrink-0`}>
            {/* Trending Topics */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  <FaFire className="inline mr-2 text-orange-500" />
                  Trending
                </h2>
                <button className="text-sm text-green-600 hover:text-green-700">
                  Refresh
                </button>
              </div>
              
              <div className="space-y-3">
                {trending.map((topic, index) => (
                  <div key={topic.tag} className="cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500 text-sm font-medium">#{index + 1}</span>
                          <h3 className="font-medium text-gray-900 hover:underline">{topic.tag}</h3>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {topic.count.toLocaleString()} posts
                        </p>
                      </div>
                      {topic.trend === 'up' && (
                        <span className="text-green-500 text-sm">+</span>
                      )}
                      {topic.trend === 'down' && (
                        <span className="text-red-500 text-sm">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="space-y-2">
                <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">
                  <FaHashtag className="inline mr-2 text-gray-400" />
                  Explore Topics
                </button>
                <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">
                  <FaUsers className="inline mr-2 text-gray-400" />
                  Find People
                </button>
                <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">
                  <FaGlobe className="inline mr-2 text-gray-400" />
                  Eco Resources
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && isMobile && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* LILO AI Assistant */}
      <LiloAI position="bottom-right" />
      </div>
      )}
    </div>
  );
};

export default SocialDashboard;
