import React, { useState } from 'react';
import { FaRobot, FaMicrophone, FaMicrophoneSlash, FaVolumeUp, FaVolumeMute } from 'react-icons/fa';
import { useLiloCore } from '../lilo/core/useLiloCore';
import { useVoiceInterface } from '../hooks/useVoiceInterface';

/**
 * LILO AI Assistant Component - Clean UI, no chaos
 * Uses unified LILO Core system
 */
const LiloAI = ({ position = 'bottom-right', size = 'small' }) => {
  // 1. State
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  
  // 2. Hooks (single declaration, no duplicates)
  const { process, voiceEnabled, toggleVoice, isProcessing } = useLiloCore();
  
  const { 
    isListening, 
    isSpeaking,
    startListening, 
    stopListening, 
    transcript,
    voiceSupported 
  } = useVoiceInterface();
  
  // 3. Functions
  const handleSend = async () => {
    if (!inputMessage.trim() || isProcessing) return;
    
    const userMessage = inputMessage.trim();
    setInputMessage('');
    
    // Add user message
    setMessages(prev => [...prev, { 
      type: 'user', 
      text: userMessage, 
      timestamp: new Date() 
    }]);
    
    // Process through LILO Core
    const response = await process(userMessage);
    
    if (response) {
      // Add LILO response
      setMessages(prev => [...prev, { 
        type: 'lilo', 
        text: response.text, 
        mode: response.mode,
        tone: response.tone,
        timestamp: response.timestamp 
      }]);
    }
  };
  
  // 4. Effects
  React.useEffect(() => {
    if (transcript && !isListening) {
      setInputMessage(transcript);
      if (transcript.trim()) {
        setTimeout(() => handleSend(), 500);
      }
    }
  }, [transcript, isListening]);
  
  // 5. Return JSX
  return (
    <div className={`fixed ${position === 'bottom-right' ? 'bottom-4 right-4' : 'bottom-4 left-4'} z-50`}>
      {/* LILO Button */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-full shadow-lg transition-all duration-200 transform hover:scale-105"
      >
        <FaRobot className="w-6 h-6" />
      </button>
      
      {/* Chat Window */}
      {showChat && (
        <div className="absolute bottom-16 right-0 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col max-h-96">
          {/* Header */}
          <div className="bg-emerald-600 text-white p-3 rounded-t-lg flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <FaRobot className="w-4 h-4" />
              <span className="font-medium">LILO AI</span>
            </div>
            <button
              onClick={() => setShowChat(false)}
              className="text-white/80 hover:text-white"
            >
              ×
            </button>
          </div>
          
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-64">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`p-2 rounded-lg ${
                  msg.type === 'user' 
                    ? 'bg-blue-100 ml-8' 
                    : 'bg-gray-100 mr-8'
                }`}
              >
                <div className="text-sm">{msg.text}</div>
                {msg.mode && (
                  <div className="text-xs text-gray-500 mt-1">
                    Mode: {msg.mode}
                  </div>
                )}
              </div>
            ))}
            
            {isProcessing && (
              <div className="bg-gray-100 p-2 rounded-lg mr-8">
                <div className="text-sm text-gray-500">Processing...</div>
              </div>
            )}
          </div>
          
          {/* Input */}
          <div className="p-3 border-t border-gray-200">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder={isListening ? "Listening..." : "Ask LILO..."}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                disabled={isListening || isProcessing}
              />
              
              {/* Voice Controls */}
              {voiceSupported && (
                <div className="flex space-x-1">
                  <button
                    onClick={isListening ? stopListening : startListening}
                    className={`p-2 rounded-lg transition-all ${
                      isListening 
                        ? 'bg-red-600 text-white animate-pulse' 
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                    title={isListening ? 'Stop listening' : 'Start voice input'}
                  >
                    {isListening ? <FaMicrophoneSlash className="w-4 h-4" /> : <FaMicrophone className="w-4 h-4" />}
                  </button>
                  
                  {/* Voice Toggle */}
                  <button
                    onClick={toggleVoice}
                    className={`p-2 rounded-lg transition-all ${
                      voiceEnabled 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                    title={voiceEnabled ? 'Voice ON' : 'Voice OFF'}
                  >
                    {voiceEnabled ? <FaVolumeUp className="w-4 h-4" /> : <FaVolumeMute className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
            
            {/* Status */}
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-yellow-500 animate-pulse' : voiceEnabled ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                <span>
                  {isProcessing ? 'Processing...' : voiceEnabled ? 'Voice Ready' : 'Voice Off'}
                </span>
              </div>
              {isSpeaking && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span>Speaking...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiloAI;
