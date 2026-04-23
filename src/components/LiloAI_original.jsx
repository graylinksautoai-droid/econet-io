import React, { useState } from 'react';
import { FaRobot, FaMicrophone, FaMicrophoneSlash } from 'react-icons/fa';
import { useLiloCore } from '../lilo/core/useLiloCore';
import { useVoiceInterface } from '../hooks/useVoiceInterface';

/**
 * LILO AI Assistant Component - Original Minimal UI
 * Clean, professional design for environmental monitoring
 */
const LiloAI = ({ position = 'bottom-right' }) => {
  // State
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  
  // Hooks
  const { process, voiceEnabled, toggleVoice, isProcessing } = useLiloCore();
  
  const { 
    isListening, 
    isSpeaking,
    startListening, 
    stopListening, 
    transcript,
    voiceSupported 
  } = useVoiceInterface();
  
  // Functions
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
  
  // Effects
  React.useEffect(() => {
    if (transcript && !isListening) {
      setInputMessage(transcript);
      if (transcript.trim()) {
        setTimeout(() => handleSend(), 500);
      }
    }
  }, [transcript, isListening]);
  
  return (
    <div className={`fixed ${position === 'bottom-right' ? 'bottom-4 right-4' : 'bottom-4 left-4'} z-50`}>
      {/* LILO Button - Minimal Design */}
      <button
        onClick={() => setShowChat(!showChat)}
        className="bg-gray-800 hover:bg-gray-900 text-white p-3 rounded-lg shadow-lg transition-all duration-200"
      >
        <FaRobot className="w-5 h-5" />
      </button>
      
      {/* Chat Window - Clean Professional */}
      {showChat && (
        <div className="absolute bottom-16 right-0 w-80 bg-white border border-gray-300 rounded-lg shadow-xl flex flex-col max-h-96">
          {/* Header - Simple Gray */}
          <div className="bg-gray-800 text-white p-3 rounded-t-lg flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <FaRobot className="w-4 h-4" />
              <span className="font-medium text-sm">LILO Assistant</span>
            </div>
            <button
              onClick={() => setShowChat(false)}
              className="text-gray-300 hover:text-white text-lg"
            >
              ×
            </button>
          </div>
          
          {/* Messages - Clean Layout */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-64 bg-gray-50">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`p-2 rounded max-w-[85%] ${
                  msg.type === 'user' 
                    ? 'bg-blue-600 text-white ml-auto' 
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                <div className="text-sm">{msg.text}</div>
                <div className="text-xs opacity-70 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
            
            {isProcessing && (
              <div className="bg-white border border-gray-200 p-2 rounded max-w-[85%]">
                <div className="text-sm text-gray-500">Thinking...</div>
              </div>
            )}
          </div>
          
          {/* Input - Minimal */}
          <div className="p-3 border-t border-gray-200 bg-white rounded-b-lg">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder={isListening ? "Listening..." : "Type your message..."}
                className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500 text-sm"
                disabled={isListening || isProcessing}
              />
              
              {/* Voice Button - Simple */}
              {voiceSupported && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`p-2 rounded transition-all ${
                    isListening 
                      ? 'bg-red-600 text-white' 
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}
                  title={isListening ? 'Stop listening' : 'Start voice input'}
                >
                  {isListening ? <FaMicrophoneSlash className="w-4 h-4" /> : <FaMicrophone className="w-4 h-4" />}
                </button>
              )}
            </div>
            
            {/* Voice Status Indicator */}
            {isListening && (
              <div className="mt-2 text-xs text-red-600 flex items-center">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse mr-2"></div>
                Listening...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiloAI;
