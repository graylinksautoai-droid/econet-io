import React, { useState } from "react";
import { useVoiceInterface } from "../hooks/useVoiceInterface";

const LiloAI = () => {
  const { messages, sendMessage, isListening, isSpeaking } = useVoiceInterface();
  const [input, setInput] = useState("");

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white shadow-lg rounded-lg border border-gray-200">
      <div className="p-3 bg-gray-800 text-white rounded-t-lg">
        LILO Assistant
      </div>

      <div className="p-3 h-60 overflow-y-auto bg-gray-50">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-2 p-2 rounded max-w-[85%] ${
              m.from === "lilo" 
                ? "bg-blue-100 text-blue-800" 
                : "bg-gray-100 text-gray-800 ml-auto"
            }`}
          >
            <div className="text-sm">{m.text}</div>
            <div className="text-xs opacity-70 mt-1">
              {new Date(m.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>

      <div className="flex p-3 border-t border-gray-200">
        <input
          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder={isListening ? "Listening..." : "Type your message..."}
          disabled={isListening}
        />
        <button
          onClick={handleSend}
          className="ml-2 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          disabled={!input.trim() || isListening}
        >
          Send
        </button>
      </div>
      
      {isListening && (
        <div className="px-3 pb-2 text-xs text-red-600 flex items-center">
          <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse mr-2"></div>
          Listening...
        </div>
      )}
    </div>
  );

  function handleSend() {
    if (!input.trim()) return;
    
    sendMessage(input);
    setInput("");
  }
};
            <div className="flex items-center space-x-2">
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
