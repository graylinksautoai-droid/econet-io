import React, { useState } from 'react';
import { HiPlus, HiOutlineVideoCamera, HiOutlineLocationMarker } from 'react-icons/hi';
import { motion, AnimatePresence } from 'framer-motion';

const UnifiedButton = ({ onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [intent, setIntent] = useState("");

  const handleIntentChange = (e) => {
    const value = e.target.value;
    setIntent(value);
    
    // AI-Intent Classification Mock
    const lowValue = value.toLowerCase();
    if (lowValue.includes("live") || lowValue.includes("stream") || lowValue.includes("show")) {
      // Social/Stream intent
      console.log("AI Classified: Stream");
    } else if (lowValue.includes("report") || lowValue.includes("flood") || lowValue.includes("map")) {
      // Data/Radar intent
      console.log("AI Classified: Radar");
    }
  };

  const handleAction = (type) => {
    if (type === 'radar') {
      onNavigate('/command');
    } else {
      onNavigate('/live'); // We'll need this route
    }
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            className="absolute bottom-20 right-0 bg-white/80 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-white/20 w-72"
          >
            <input
              id="unified-input"
              name="unifiedInput"
              autoFocus
              type="text"
              placeholder="What's happening? (e.g., 'Flood report')"
              className="w-full bg-gray-100/50 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-emerald-500 mb-4"
              value={intent}
              onChange={handleIntentChange}
            />
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleAction('radar')}
                className="flex flex-col items-center justify-center p-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors group"
              >
                <HiOutlineLocationMarker className="text-2xl text-emerald-600 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-semibold text-emerald-700">Radar (Data)</span>
              </button>
              
              <button
                onClick={() => handleAction('stream')}
                className="flex flex-col items-center justify-center p-4 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors group"
              >
                <HiOutlineVideoCamera className="text-2xl text-blue-600 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-semibold text-blue-700">Stream (Social)</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-colors ${
          isOpen ? 'bg-gray-800 text-white' : 'bg-emerald-600 text-white'
        }`}
      >
        <HiPlus className={`text-3xl transition-transform ${isOpen ? 'rotate-45' : ''}`} />
      </motion.button>
    </div>
  );
};

export default UnifiedButton;
