import React, { useState, useRef, useEffect } from 'react';
import { HiOutlineX, HiOutlineMicrophone, HiOutlineSpeakerWave, HiOutlineSparkles, HiOutlinePaperAirplane } from 'react-icons/hi';
import LiloVoiceSelector from './LiloVoiceSelector';

/**
 * LILO Modal - Expanded interaction panel
 * Full conversation interface with voice controls
 */
export default function LiloModal({ 
  isExpanded, 
  messages, 
  isSpeaking, 
  isProcessing,
  currentVoice,
  alerts,
  onToggleExpanded,
  onSendMessage,
  onClearMessages,
  onChangeVoice,
  className = ''
}) {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isExpanded]);

  const handleSendMessage = () => {
    if (inputText.trim() && !isProcessing) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleVoiceToggle = () => {
    setIsRecording(!isRecording);
    // In production, this would start/stop voice recording
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getMessageBubbleClass = (sender) => {
    return sender === 'user' 
      ? 'bg-emerald-600 text-white ml-auto max-w-[70%]' 
      : 'bg-gray-100 text-gray-900 mr-auto max-w-[70%]';
  };

  const getAlertBadge = (alert) => {
    const colors = {
      critical: 'bg-red-500',
      high: 'bg-orange-500',
      medium: 'bg-yellow-500',
      low: 'bg-blue-500'
    };

    return colors[alert.priority] || colors.low;
  };

  if (!isExpanded) return null;

  return (
    <div className={`
      fixed bottom-24 right-6 z-50
      w-96 h-[600px] bg-white rounded-lg shadow-2xl
      flex flex-col border border-gray-200
      ${className}
    `}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-emerald-600 text-white rounded-t-lg">
        <div className="flex items-center space-x-3">
          <HiOutlineSparkles className="w-6 h-6" />
          <div>
            <div className="font-semibold">LILO</div>
            <div className="text-xs opacity-90">
              {isSpeaking ? 'Speaking...' : 
               isProcessing ? 'Processing...' : 
               'Ready'}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Voice button */}
          <button
            onClick={() => setShowVoiceSelector(!showVoiceSelector)}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
            title="Change voice"
          >
            <HiOutlineSpeakerWave className="w-5 h-5" />
          </button>
          
          {/* Close button */}
          <button
            onClick={onToggleExpanded}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
            title="Minimize LILO"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Voice Selector */}
      {showVoiceSelector && (
        <LiloVoiceSelector
          currentVoice={currentVoice}
          onChangeVoice={onChangeVoice}
          onClose={() => setShowVoiceSelector(false)}
        />
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="p-3 bg-red-50 border-b border-red-200">
          <div className="text-sm font-medium text-red-800 mb-2">
            🚨 Active Alerts ({alerts.length})
          </div>
          <div className="space-y-1">
            {alerts.slice(0, 2).map((alert, index) => (
              <div key={index} className="flex items-center space-x-2 text-xs">
                <div className={`w-2 h-2 rounded-full ${getAlertBadge(alert)}`} />
                <span className="text-red-700">{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <HiOutlineSparkles className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <div className="font-medium">Hello! I'm LILO</div>
            <div className="text-sm mt-1">How can I help you today?</div>
            <div className="text-xs mt-3 text-gray-400">
              • Upload images for environmental analysis<br/>
              • Ask about climate conditions<br/>
              • Get safety guidance
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={message.id} className="flex flex-col space-y-1">
              <div className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`rounded-lg px-4 py-2 ${getMessageBubbleClass(message.sender)}`}>
                  <div className="text-sm">{message.text}</div>
                </div>
              </div>
              <div className={`text-xs text-gray-400 ${message.sender === 'user' ? 'text-right' : 'text-left'}`}>
                {formatTimestamp(message.timestamp)}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-2">
          {/* Voice input */}
          <button
            onClick={handleVoiceToggle}
            className={`p-2 rounded-full transition-colors ${
              isRecording 
                ? 'bg-red-500 text-white animate-pulse' 
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title={isRecording ? 'Stop recording' : 'Start voice input'}
          >
            <HiOutlineMicrophone className="w-5 h-5" />
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={isRecording ? 'Listening...' : 'Ask LILO anything...'}
            disabled={isProcessing || isRecording}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:border-emerald-500 text-sm"
          />

          {/* Send button */}
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isProcessing || isRecording}
            className="p-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send message"
          >
            <HiOutlinePaperAirplane className="w-5 h-5" />
          </button>
        </div>

        {/* Clear messages */}
        {messages.length > 0 && (
          <button
            onClick={onClearMessages}
            className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear conversation
          </button>
        )}
      </div>
    </div>
  );
}
