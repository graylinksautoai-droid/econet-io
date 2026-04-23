import React, { useState, useEffect, useRef } from 'react';
import { FaTv, FaUsers, FaEye, FaCoins, FaHeart, FaComment, FaShare, FaStop, FaPlay, FaVideo, FaVideoSlash } from 'react-icons/fa';
import { motion } from 'framer-motion';

const LiveStreaming = ({ user, onNavigate }) => {
  const [isLive, setIsLive] = useState(false);
  const [liveTime, setLiveTime] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [engagement, setEngagement] = useState({ likes: 0, comments: 0, shares: 0 });
  const [ecoCoinsEarned, setEcoCoinsEarned] = useState(0);
  const [streamActive, setStreamActive] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Live streaming rewards logic
  useEffect(() => {
    if (isLive) {
      intervalRef.current = setInterval(() => {
        setLiveTime(prev => prev + 1);
        
        // Simulate viewer count changes
        setViewers(prev => {
          const change = Math.floor(Math.random() * 10) - 5;
          return Math.max(0, prev + change);
        });
        
        // Simulate engagement
        setEngagement(prev => ({
          likes: prev.likes + Math.floor(Math.random() * 3),
          comments: prev.comments + Math.floor(Math.random() * 2),
          shares: prev.shares + Math.floor(Math.random() * 1)
        }));
        
        // Calculate EcoCoins earned
        setEcoCoinsEarned(prev => {
          const timeBonus = 0.01; // 0.01 EcoCoins per second
          const viewerBonus = viewers * 0.001; // Bonus per viewer
          const engagementBonus = (engagement.likes + engagement.comments * 2 + engagement.shares * 3) * 0.0001;
          return prev + timeBonus + viewerBonus + engagementBonus;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isLive, viewers, engagement]);

  const startLive = async () => {
    try {
      setError('');
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: true 
      });
      
      // Store stream reference
      streamRef.current = stream;
      
      // Set video source
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Start live state
      setIsLive(true);
      setStreamActive(true);
      setLiveTime(0);
      setViewers(Math.floor(Math.random() * 50) + 10);
      setEngagement({ likes: 0, comments: 0, shares: 0 });
      setEcoCoinsEarned(0);
      
      console.log('Live stream started successfully!');
      
    } catch (err) {
      console.error('Error starting live stream:', err);
      setError('Camera access denied. Please allow camera permissions to start live streaming.');
      
      // Fallback to simulation mode
      setIsLive(true);
      setStreamActive(false);
      setLiveTime(0);
      setViewers(Math.floor(Math.random() * 50) + 10);
      setEngagement({ likes: 0, comments: 0, shares: 0 });
      setEcoCoinsEarned(0);
    }
  };

  const stopLive = () => {
    // Stop camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Clear video source
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsLive(false);
    setStreamActive(false);
    
    // Award EcoCoins to user
    if (ecoCoinsEarned > 0) {
      alert(`Live session ended! You earned ${ecoCoinsEarned.toFixed(4)} EcoCoins!`);
      // Here you would typically update the user's EcoCoin balance in the backend
    }
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <FaTv className="text-red-500" />
          Live Streaming
        </h3>
        
        {isLive ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-bold text-red-500">LIVE</span>
            <span className="text-xs text-gray-500">{formatTime(liveTime)}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-500">OFFLINE</span>
        )}
      </div>

      {/* Live Video Stream */}
      {isLive && (
        <div className="mb-4">
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ paddingBottom: '56.25%' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute top-0 left-0 w-full h-full object-cover"
            />
            {!streamActive && (
              <div className="absolute top-0 left-0 w-full h-full bg-gray-900 flex items-center justify-center">
                <div className="text-center text-white">
                  <FaVideo className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm opacity-75">Simulation Mode</p>
                  <p className="text-xs opacity-50">Camera not available</p>
                </div>
              </div>
            )}
            {/* Live overlay */}
            <div className="absolute top-2 left-2 bg-red-600 text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
              LIVE
            </div>
          </div>
        </div>
      )}

      {/* Live Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-gray-600">
            <FaUsers className="w-4 h-4" />
            <span className="text-lg font-bold">{viewers}</span>
          </div>
          <p className="text-xs text-gray-500">Viewers</p>
        </div>
        
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 text-emerald-600">
            <FaCoins className="w-4 h-4" />
            <span className="text-lg font-bold">{ecoCoinsEarned.toFixed(3)}</span>
          </div>
          <p className="text-xs text-gray-500">EcoCoins Earned</p>
        </div>
      </div>

      {/* Engagement Stats */}
      <div className="flex justify-around mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-red-500">
            <FaHeart className="w-3 h-3" />
            <span className="text-sm font-bold">{engagement.likes}</span>
          </div>
          <p className="text-xs text-gray-500">Likes</p>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-blue-500">
            <FaComment className="w-3 h-3" />
            <span className="text-sm font-bold">{engagement.comments}</span>
          </div>
          <p className="text-xs text-gray-500">Comments</p>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-green-500">
            <FaShare className="w-3 h-3" />
            <span className="text-sm font-bold">{engagement.shares}</span>
          </div>
          <p className="text-xs text-gray-500">Shares</p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Control Buttons */}
      <div className="flex gap-2">
        {!isLive ? (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={startLive}
            className="flex-1 bg-red-500 text-white py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-red-600 transition-colors"
          >
            <FaVideo className="w-4 h-4" />
            Start Live Stream
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={stopLive}
            className="flex-1 bg-gray-800 text-white py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-gray-900 transition-colors"
          >
            <FaVideoSlash className="w-4 h-4" />
            End Stream
          </motion.button>
        )}
      </div>

      {/* Reward Info */}
      {isLive && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg"
        >
          <p className="text-xs text-emerald-700 font-medium">
            Earning EcoCoins based on: Time live (0.01/s) + Viewers (0.001/viewer) + Engagement (bonus)
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default LiveStreaming;
