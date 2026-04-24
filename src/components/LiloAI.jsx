import React, { useState } from "react";
import useLilo from "../hooks/useLilo";
import { useVoiceInterface } from "../hooks/useVoiceInterface";
import { useLiloContext } from "../hooks/useLiloContext";
import { useTheme } from "../context/ThemeContext";

const LiloAI = () => {
  const { messages, send, clear, activate, deactivate, isActive, mood } = useLilo();
  const { isListening } = useVoiceInterface();
  const context = useLiloContext();
  const { theme } = useTheme();
  const [input, setInput] = useState("");
  const [showChat, setShowChat] = useState(false);

  function handleSend() {
    if (!input.trim() || !isActive) return;
    send(input);
    setInput("");
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all ${
            isActive ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-600 text-white hover:bg-gray-700'
          }`}
          title={`LILO ${isActive ? 'Active' : 'Inactive'} - ${mood}`}
        >
          <div className={`h-3 w-3 rounded-full ${isActive ? 'bg-white animate-pulse' : 'bg-gray-300'}`}></div>
        </button>
      )}

      {showChat && (
        <div className="mb-2 w-[min(92vw,24rem)] rounded-2xl border border-theme bg-theme-card shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between rounded-t-2xl border-b border-theme bg-theme-muted p-3 text-theme-primary">
            <div className="flex items-center space-x-2">
              <img src="/econet-logo.jpeg" alt="EcoNet logo" className="h-8 w-8 rounded-xl object-cover" />
              <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="text-sm font-medium">LILO Assistant</span>
              <span className="text-xs opacity-70">({mood})</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={isActive ? deactivate : activate}
                className={`rounded px-2 py-1 text-xs ${isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {isActive ? 'OFF' : 'ON'}
              </button>
              <button onClick={() => setShowChat(false)} className="text-lg text-theme-secondary hover:text-theme-primary">
                ×
              </button>
            </div>
          </div>

          <div className="border-b border-theme bg-theme-card px-3 py-2 text-xs text-theme-secondary">
            <div>Page: <span className="font-semibold capitalize text-theme-primary">{context.currentPage}</span></div>
            {context.regionalAlerts[0] && (
              <div className="mt-1">Regional alert: <span className="font-semibold text-theme-primary">{context.regionalAlerts[0].message}</span></div>
            )}
            <div className="mt-1">Theme: <span className="font-semibold capitalize text-theme-primary">{theme}</span></div>
          </div>

          <div className="h-60 overflow-y-auto bg-theme-card p-3">
            {messages.length === 0 && (
              <div className="py-8 text-center text-sm text-theme-secondary">
                {isActive ? 'LILO is active. Start naturally and I will stay practical.' : 'Click ON to activate LILO'}
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`mb-2 max-w-[85%] rounded p-2 ${
                  message.role === 'assistant'
                    ? 'border border-emerald-500/20 bg-emerald-500/10 text-theme-primary'
                    : message.role === 'system'
                      ? 'border border-amber-500/20 bg-amber-500/10 text-theme-primary text-xs'
                      : 'ml-auto bg-theme-muted text-theme-primary'
                }`}
              >
                <div className="text-sm">{message.content}</div>
                <div className="mt-1 text-xs opacity-70">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>

          <div className="flex border-t border-theme p-3">
            <input
              id="lilo-input"
              name="lilo-input"
              className="flex-1 rounded border border-theme bg-theme-card px-2 py-1 text-sm text-theme-primary focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleSend()}
              placeholder={isListening ? "Listening..." : "Type your message..."}
              disabled={isListening || !isActive}
            />
            <button
              onClick={handleSend}
              className="ml-2 rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={!input.trim() || isListening || !isActive}
            >
              Send
            </button>
          </div>

          <div className="flex items-center justify-between px-3 pb-2">
            {isListening && (
              <div className="flex items-center text-xs text-red-500">
                <div className="mr-2 h-2 w-2 animate-pulse rounded-full bg-red-600"></div>
                Listening...
              </div>
            )}
            {messages.length > 0 && (
              <button onClick={clear} className="text-xs text-theme-secondary hover:text-theme-primary">
                Clear chat
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiloAI;
