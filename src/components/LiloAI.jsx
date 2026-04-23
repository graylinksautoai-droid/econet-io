import React, { useState } from "react";
import useLilo from "../hooks/useLilo";
import { useVoiceInterface } from "../hooks/useVoiceInterface";

const LiloAI = () => {
  const { messages, send, clear, activate, deactivate, isActive, mood } = useLilo();
  const { isListening, isSpeaking } = useVoiceInterface();
  const [input, setInput] = useState("");
  const [showChat, setShowChat] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* LILO Toggle Button */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
            isActive 
              ? 'bg-green-600 hover:bg-green-700 text-white' 
              : 'bg-gray-600 hover:bg-gray-700 text-white'
          }`}
          title={`LILO ${isActive ? 'Active' : 'Inactive'} - ${mood}`}
        >
          <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-white animate-pulse' : 'bg-gray-300'}`}></div>
        </button>
      )}

      {/* Chat Window */}
      {showChat && (
        <div className="w-80 bg-white shadow-lg rounded-lg border border-gray-200 mb-2">
          {/* Header */}
          <div className="p-3 bg-gray-800 text-white rounded-t-lg flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="font-medium text-sm">LILO Assistant</span>
              <span className="text-xs opacity-70">({mood})</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={isActive ? deactivate : activate}
                className={`px-2 py-1 rounded text-xs ${
                  isActive 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isActive ? 'OFF' : 'ON'}
              </button>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-300 hover:text-white text-lg"
              >
                ×
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="p-3 h-60 overflow-y-auto bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-sm py-8">
                {isActive ? 'LILO is active. Say hello!' : 'Click ON to activate LILO'}
              </div>
            )}
            
            {messages.map((m, i) => (
              <div
                key={i}
                className={`mb-2 p-2 rounded max-w-[85%] ${
                  m.role === 'assistant' 
                    ? 'bg-blue-100 text-blue-800' 
                    : m.role === 'system'
                    ? 'bg-yellow-100 text-yellow-800 text-xs'
                    : 'bg-gray-100 text-gray-800 ml-auto'
                }`}
              >
                <div className="text-sm">{m.content}</div>
                <div className="text-xs opacity-70 mt-1">
                  {new Date(m.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="flex p-3 border-t border-gray-200">
            <input
              id="lilo-input"
              name="lilo-input"
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isListening ? "Listening..." : "Type your message..."}
              disabled={isListening || !isActive}
            />
            <button
              onClick={handleSend}
              className="ml-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              disabled={!input.trim() || isListening || !isActive}
            >
              Send
            </button>
          </div>
          
          {/* Status */}
          <div className="px-3 pb-2 flex justify-between items-center">
            {isListening && (
              <div className="text-xs text-red-600 flex items-center">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse mr-2"></div>
                Listening...
              </div>
            )}
            {messages.length > 0 && (
              <button
                onClick={clear}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear chat
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function handleSend() {
    if (!input.trim() || !isActive) return;
    
    send(input);
    setInput("");
  }
};

export default LiloAI;
