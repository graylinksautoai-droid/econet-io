import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  HiOutlineLocationMarker, 
  HiOutlineBell, 
  HiOutlineHeart,
  HiOutlineChat,
  HiOutlineShare,
  HiOutlineRefresh,
  HiOutlineBadgeCheck,
  HiOutlineSparkles,
  HiOutlineLightningBolt,
  HiOutlineX,
  HiOutlineArrowUp,
  HiOutlineArrowDown,
  HiOutlineClipboardList
} from "react-icons/hi";
import { FiCamera } from "react-icons/fi";
import { BsThreeDots } from "react-icons/bs";
import SentinelShield from '../components/SentinelShield';
import Leaderboard from '../components/Leaderboard';
import NotificationSettings from '../components/NotificationSettings';
import { progressiveSync } from "../services/progressiveSync";
import MainLayout from '../layouts/MainLayout';

// FIXED: Destructured isCommandMode so it does not leak into MainLayout's DOM elements via ...otherProps
function Dashboard({ user, onLogout, onNavigate, isCommandMode, ...otherProps }) {
  const [activeTab, setActiveTab] = useState("feed");
  const [feedFilter, setFeedFilter] = useState("for-you");
  const [selectedHashtag, setSelectedHashtag] = useState(null);
  const [followedAccounts, setFollowedAccounts] = useState([]);
  const [theme, setTheme] = useState("light");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  
  const [userReports, setUserReports] = useState([]);
  const [userReportsLoading, setUserReportsLoading] = useState(false);
  const [userReportsError, setUserReportsError] = useState("");

  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Comments state
  const [comments, setComments] = useState({});
  const [commentText, setCommentText] = useState({});
  const [commentsVisible, setCommentsVisible] = useState({});
  const [commentLoading, setCommentLoading] = useState({});
  const [postText, setPostText] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [posting, setPosting] = useState(false);

  const heroMessages = [
    { headline: "Report Climate Events in Real-Time", subtext: "Be eyes on ground - every report helps save communities" },
    { headline: "Connect with Eco-Warriors Worldwide", subtext: "Join 50,000+ members sharing climate solutions" },
    { headline: "Fresh Produce Direct from Farmers", subtext: "Support local agriculture, reduce carbon footprint" },
    { headline: "Your Voice Triggers Action", subtext: "Reports automatically sent to the right authorities" },
    { headline: "Track Environmental Impact", subtext: "See how your community is making a difference" },
    { headline: "AI-Powered Climate Intelligence", subtext: "Get instant severity analysis on every report" },
  ];

  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % heroMessages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [heroMessages.length]);

  const themes = {
    light: {
      bg: "bg-white",
      cardBg: "bg-white",
      text: "text-gray-900",
      textSecondary: "text-gray-600",
      accent: "text-emerald-600",
      accentBg: "bg-emerald-600",
      accentHover: "hover:bg-emerald-700",
      border: "border-gray-200",
      hover: "hover:bg-gray-50",
      secondaryBg: "bg-gray-50",
      headerBg: "bg-white/95 backdrop-blur-sm border-b border-gray-200"
    },
    dark: {
      bg: "bg-gray-900",
      cardBg: "bg-gray-800",
      text: "text-white",
      textSecondary: "text-gray-300",
      accent: "text-emerald-400",
      accentBg: "bg-emerald-500",
      accentHover: "hover:bg-emerald-600",
      border: "border-gray-700",
      hover: "hover:bg-gray-700",
      secondaryBg: "bg-gray-800",
      headerBg: "bg-gray-800/95 backdrop-blur-sm border-b border-gray-700"
    },
    green: {
      bg: "bg-emerald-900",
      cardBg: "bg-emerald-800",
      text: "text-white",
      textSecondary: "text-emerald-100",
      accent: "text-emerald-300",
      accentBg: "bg-emerald-600",
      accentHover: "hover:bg-emerald-700",
      border: "border-emerald-700",
      hover: "hover:bg-emerald-700",
      secondaryBg: "bg-emerald-800",
      headerBg: "bg-emerald-800/95 backdrop-blur-sm border-b border-emerald-700"
    }
  };

  const profileImage = user?.avatar || "https://res.cloudinary.com/dp9ffewdb/image/upload/v1772255683/headshotmaster_image_1752773041882_klupxt.png";
  const currentTheme = themes[theme] || themes.light;

  useEffect(() => {
    const fetchFeed = async () => {
      setFeedLoading(true);
      setFeedError("");
      try {
        let url = 'http://localhost:5000/api/reports/feed';
        if (feedFilter === "following") url = 'http://localhost:5000/api/reports/feed/following';
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const options = {};
        if (feedFilter === "following") {
          if (!token) {
            setFeedError("You must be logged in to see followed posts.");
            setFeedLoading(false);
            return;
          }
          options.headers = { 'Authorization': `Bearer ${token}` };
        }
        const response = await fetch(url, options);
        if (!response.ok) throw new Error('Failed to fetch feed');
        const data = await response.json();
        setReports(data);
      } catch (err) {
        setFeedError('Searching for Satellite Link... ');
      } finally {
        setFeedLoading(false);
      }
    };
    fetchFeed();
  }, [feedFilter]);

  const trendingHashtags = [
    { tag: "#ClimateAction", posts: "12.5K", category: "climate", color: "bg-red-100 text-red-700 border-red-200" },
    { tag: "#LagosFloods", posts: "8.2K", category: "emergency", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    { tag: "#RenewableEnergy", posts: "6.9K", category: "energy", color: "bg-green-100 text-green-700 border-green-200" },
    { tag: "#EcoFriendly", posts: "5.4K", category: "lifestyle", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  ];

  const handleImageUpload = async (event) => {
    console.log('=== LAYER 1: UI Event Triggered ===');
    const file = event.target.files[0];
    
    // UI Layer debug
    console.log('INPUT FILE:', file);
    console.log('INPUT TYPE:', file?.type);
    console.log('INPUT SIZE:', file?.size);
    console.log('INPUT NAME:', file?.name);
    
    if (file) {
      if (file.type.startsWith('image/')) {
        try {
          console.log('=== LAYER 2: Client Processing ===');
          console.log('Starting image processing...');
          
          // Dependency validation
          if (!progressiveSync || !progressiveSync.transcode) {
            console.warn('progressiveSync dependency missing, using original file');
            const uploadFile = file;
            setSelectedImage(uploadFile);
            // Preview generation
            const reader = new FileReader();
            reader.onloadend = () => setImagePreview(reader.result);
            reader.readAsDataURL(file);
            return;
          }
          
          // Neural Transcoding Preview (Simulated) with timeout
          const transcodedFile = await Promise.race([
            progressiveSync.transcode(file),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Transcode timeout')), 10000)
            )
          ]);
          
          // Processing Layer debug
          console.log('TRANSCODED:', transcodedFile);
          console.log('TRANSCODED TYPE:', transcodedFile?.type);
          console.log('TRANSCODED SIZE:', transcodedFile?.size);
          console.log('TRANSCODED NAME:', transcodedFile?.name);
          
          // COMPREHENSIVE FALLBACK: Validate transcoded file thoroughly
          let uploadFile = file; // Default to original file
          
          if (transcodedFile && 
              transcodedFile.type.includes('image') && 
              transcodedFile.size > 0 &&
              transcodedFile.size < 10 * 1024 * 1024) { // Max 10MB
            
            // Check if backend accepts this format (avoid WebP for compatibility)
            if (transcodedFile.type === 'image/jpeg' || 
                transcodedFile.type === 'image/png' || 
                transcodedFile.type === 'image/gif') {
              console.log('Using transcoded file (compatible format)');
              uploadFile = transcodedFile;
            } else {
              console.warn(`Transcoded to unsupported format: ${transcodedFile.type}, using original`);
            }
          } else {
            console.warn('Transcoding failed or produced invalid file, using original');
          }
          
          // State Layer debug
          console.log('=== LAYER 3: State Management ===');
          console.log('FINAL UPLOAD FILE:', uploadFile);
          console.log('FINAL UPLOAD TYPE:', uploadFile?.type);
          console.log('FINAL UPLOAD SIZE:', uploadFile?.size);
          
          setSelectedImage(uploadFile);
          
          // Verify state was set
          setTimeout(() => {
            console.log('STATE selectedImage:', uploadFile);
          }, 100);
          
          const reader = new FileReader();
          reader.onloadend = () => {
            console.log('FileReader completed');
            setImagePreview(reader.result);
          };
          reader.onerror = (error) => {
            console.error('FileReader failed:', error);
            alert('Failed to preview image. The upload will still work.');
          };
          
          console.log('PREVIEW SOURCE FILE:', file);
          reader.readAsDataURL(file);
        } catch (error) {
          console.error('Image processing failed:', error);
          alert('Failed to process image. Please try again.');
        }
      } else {
        console.log('Invalid file type');
        alert('Please select an image file');
      }
    } else {
      console.log('No file selected');
    }
  };

  const handlePostSubmit = async () => {
    if (!postText.trim() && !selectedImage) {
      alert('Please add some text or an image to post');
      return;
    }

    setPosting(true);
    try {
      console.log('=== LAYER 4: Network Request ===');
      console.log('Starting post submission...');
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      console.log('REQUEST HEADERS:', token ? 'AUTH PRESENT' : 'NO AUTH');
      
      const formData = new FormData();
      formData.append('content', postText);
      formData.append('category', 'social');
      formData.append('severity', 'low');
      
      // Network Layer debug
      console.log('UPLOADING FILE:', selectedImage);
      console.log('UPLOAD TYPE:', selectedImage?.type);
      console.log('UPLOAD SIZE:', selectedImage?.size);
      
      if (selectedImage) {
        formData.append('image', selectedImage);
        console.log('Image added to FormData');
      }

      // Detailed FormData inspection
      console.log('FORMDATA ENTRIES:');
      for (let pair of formData.entries()) {
        console.log('FORMDATA:', pair[0], pair[1] instanceof File ? `FILE: ${pair[1].name} (${pair[1].type})` : pair[1]);
      }
      
      console.log('API CONTRACT: POST http://localhost:5000/api/reports');
      console.log('EXPECTED FIELD: "image"');

      const response = await fetch('http://localhost:5000/api/reports', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });

      // Response Layer debug
      console.log('=== LAYER 5: Backend Response ===');
      console.log('RESPONSE STATUS:', response.status);
      console.log('RESPONSE OK:', response.ok);
      console.log('RESPONSE HEADERS:', Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        setPostText('');
        setSelectedImage(null);
        setImagePreview(null);
        
        // Refresh feed
        const feedResponse = await fetch('http://localhost:5000/api/reports/feed');
        if (feedResponse.ok) {
          const data = await feedResponse.json();
          setReports(data);
        }
      } else {
        throw new Error('Failed to post');
      }
    } catch (error) {
      console.error('Post failed:', error);
      alert('Failed to post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <MainLayout user={user} onLogout={onLogout} onNavigate={onNavigate}>
      <div className={`min-h-screen ${currentTheme.bg} ${currentTheme.text} transition-colors duration-300`}>
        <div className={`${currentTheme.headerBg} sticky top-0 z-50 backdrop-blur-sm`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex-shrink-0 cursor-pointer" onClick={() => onNavigate('/')}>
              <h1 className="text-xl sm:text-2xl font-bold text-emerald-600">ESC.IO</h1>
              <div className="text-[10px] sm:text-xs tracking-wider text-emerald-500 font-medium -mt-1 uppercase">Ecological Society Connect</div>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <button className={`p-2 ${currentTheme.hover} rounded-full`}><HiOutlineBell className="w-5 h-5 sm:w-6 sm:h-6" /></button>
              <img src={profileImage} alt="Profile" className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border-2 border-emerald-500" />
            </div>
          </div>
        </div>
        {!isCommandMode && (
          <div className="relative h-[300px] sm:h-[350px] lg:h-[400px] overflow-hidden">
            <video autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover">
              <source src="https://res.cloudinary.com/dp9ffewdb/video/upload/v1772122848/SAVE_PLANET_Global_Warming_-_Climate_Change_-_Utku_Demircan_1080p_h264_youtube_egx85a.mp4" type="video/mp4" />
            </video>
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent"></div>
            <div className="absolute bottom-6 sm:bottom-8 lg:bottom-12 left-4 sm:left-8 lg:left-12 right-4 text-white">
              <span className="text-emerald-400 font-medium tracking-wider text-xs sm:text-sm mb-2 block uppercase">EcoNet  Climate Action</span>
              <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold mb-2">{heroMessages[currentMessageIndex].headline}</h2>
              <p className="text-sm sm:text-base lg:text-xl text-gray-200 max-w-2xl mb-4">{heroMessages[currentMessageIndex].subtext}</p>
              <button onClick={() => onNavigate('/submit')} className="px-6 py-2 sm:py-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-medium shadow-lg transition-all">Submit Report </button>
            </div>
          </div>
        )}
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-7xl mx-auto">
            <div className={`grid grid-cols-1 ${isCommandMode ? 'lg:grid-cols-1' : 'lg:grid-cols-4'} gap-8`}>
              <div className={`${isCommandMode ? 'hidden' : 'lg:col-span-1'} space-y-6`}>
                <div className={`${currentTheme.cardBg} rounded-[2rem] border ${currentTheme.border} p-6 shadow-2xl relative overflow-hidden group`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                      <div className="relative">
                        <img src={profileImage} alt="Profile" className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500 shadow-lg" />
                        <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-1 shadow-md">
                          <div className="bg-emerald-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">PRO</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => onNavigate('/command')} 
                          className="p-2 bg-slate-900 rounded-xl hover:bg-blue-600 text-blue-400 hover:text-white transition-all border border-slate-800 shadow-sm group/btn"
                          title="Switch to Command Mode"
                        >
                          <HiOutlineLightningBolt className="w-5 h-5 group-hover/btn:animate-pulse" />
                        </button>
                        <button onClick={() => onNavigate('/edit-profile')} className="p-2 bg-gray-50 rounded-xl hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 border border-gray-100 transition-all">
                          <HiOutlineRefresh className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className={`text-xl font-black tracking-tight ${currentTheme.text}`}>{user?.name || "George U. Nnabuife"}</h2>
                        <div className="flex items-center gap-1">
                          <SentinelShield size="sm" />
                          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 5 }} className="text-amber-400">
                            <HiOutlineBadgeCheck className="w-5 h-5" />
                          </motion.div>
                        </div>
                      </div>
                      <p className={`${currentTheme.textSecondary} text-[10px] font-bold uppercase tracking-widest opacity-60`}>Level {user?.degree || 3} AI Engineer</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100/50">
                        <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Seeds</p>
                        <p className="text-lg font-black text-emerald-900">{user?.reputation?.seeds || 1250}</p>
                      </div>
                      <div className="bg-orange-50/50 p-3 rounded-2xl border border-orange-100/50">
                        <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Leaves</p>
                        <p className="text-lg font-black text-orange-900">{user?.reputation?.leaves || 450}</p>
                      </div>
                    </div>
                    <div className="space-y-4 pt-4 border-t border-gray-100">
                      <div className="flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <span>Sentinel Trust Score</span>
                        <span className="text-emerald-600 text-xs">{user?.reputation?.trustScore || 85}%</span>
                      </div>
                      <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full w-[85%] rounded-full"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className={`${currentTheme.cardBg} rounded-xl border ${currentTheme.border} p-6 shadow-lg`}>
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2"> Trending</h3>
                  <div className="space-y-3">
                    {trendingHashtags.map((trend) => (
                      <button key={trend.tag} className={`w-full text-left p-3 rounded-lg border ${trend.color} transition-all hover:shadow-md`}>
                        <span className="font-bold block">{trend.tag}</span>
                        <span className="text-xs">{trend.posts} posts</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className={`${isCommandMode ? 'lg:col-span-1' : 'lg:col-span-3'} space-y-6`}>
                {!isCommandMode && (
                  <div className={`${currentTheme.cardBg} rounded-xl border ${currentTheme.border} p-4 sm:p-6 shadow-lg`}>
                    <div className="flex gap-4">
                      <img src={profileImage} alt="You" className="w-12 h-12 rounded-full object-cover" />
                      <div className="flex-1">
                        <textarea 
                          id="post-content"
                          name="postContent"
                          value={postText}
                          onChange={(e) => setPostText(e.target.value)}
                          placeholder="What's happening in your environment?" 
                          className={`w-full p-3 border ${currentTheme.border} rounded-lg focus:outline-none focus:border-emerald-500 resize-none h-24 ${currentTheme.bg} ${currentTheme.text}`} 
                        />
                        {imagePreview && (
                          <div className="mt-3 relative">
                            <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                            <button
                              onClick={() => {
                                setSelectedImage(null);
                                setImagePreview(null);
                              }}
                              className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
                            >
                              <HiOutlineX className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center justify-between mt-4">
                          <div className="flex gap-4 text-emerald-600">
                            <label className="cursor-pointer">
                              <input
                                id="post-image"
                                name="postImage"
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="hidden"
                              />
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            </label>
                            <HiOutlineLocationMarker className="w-6 h-6 cursor-pointer" />
                          </div>
                          <button 
                            onClick={handlePostSubmit}
                            disabled={posting}
                            className={`px-6 py-2 rounded-full font-semibold transition-colors ${
                              posting 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            {posting ? 'Posting...' : 'Post'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  {feedLoading && <p className="text-center animate-pulse py-10">Establishing Satellite Link...</p>}
                  {feedError && <p className="text-center text-emerald-600 font-medium py-10">{feedError}</p>}
                  {!feedLoading && !feedError && reports.length > 0 && (
                    reports.map((report) => (
                      <div key={report._id} className={`${currentTheme.cardBg} rounded-xl border ${currentTheme.border} p-6 shadow-lg`}>
                        <div className="flex gap-4">
                          <img 
                            src={report.user?.avatar || profileImage} 
                            alt={report.user?.name || "User"} 
                            className="w-12 h-12 rounded-full object-cover" 
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-bold text-lg">
                                {report.user?.name || "Anonymous User"}
                              </h4>
                              <span className="text-xs text-gray-500">
                                {new Date(report.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-gray-700 mb-3">{report.content}</p>
                            {report.image && (
                              <img 
                                src={report.image} 
                                alt="Report image" 
                                className="w-full h-48 object-cover rounded-lg mb-3" 
                              />
                            )}
                            <div className="flex items-center justify-between text-sm text-gray-500">
                              <div className="flex gap-4">
                                <button className="flex items-center gap-1 hover:text-red-500">
                                  <HiOutlineHeart className="w-4 h-4" />
                                  <span>{report.likes || 0}</span>
                                </button>
                                <button className="flex items-center gap-1 hover:text-blue-500">
                                  <HiOutlineChat className="w-4 h-4" />
                                  <span>{report.comments || 0}</span>
                                </button>
                                <button className="flex items-center gap-1 hover:text-green-500">
                                  <HiOutlineShare className="w-4 h-4" />
                                </button>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                report.severity === 'high' ? 'bg-red-100 text-red-700' :
                                report.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {report.severity || 'low'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {!feedLoading && !feedError && reports.length === 0 && (
                    <div className="text-center py-10">
                      <p className="text-gray-500">No environmental reports yet.</p>
                      <p className="text-sm text-gray-400 mt-2">Be the first to report something in your area!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default Dashboard;
