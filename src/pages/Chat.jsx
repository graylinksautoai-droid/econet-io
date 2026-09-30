/**
 * Chat — persistent direct messaging between EcoNet users.
 *
 * Architecture:
 * - Conversation list on the left (desktop) / first screen (mobile).
 * - Message thread on the right (desktop) / second screen (mobile).
 * - Real-time delivery via Socket.io (chat:message event).
 * - Persistence via MongoDB through /api/chat routes.
 * - Works with DEV_AUTH and MongoDB users identically.
 *
 * Users are identified by their auth ID. The conversation partner is shown by
 * name if available in localStorage — otherwise by their ID (honest fallback).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { io as socketIo } from 'socket.io-client';
import { FaArrowLeft, FaPaperPlane, FaUser, FaComment } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { API_ENDPOINTS, apiRequest } from '../services/api.js';
import { getApiBaseUrl } from '../services/runtimeConfig.js';

const SOCKET_URL = getApiBaseUrl().replace('/api', '');

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

function AvatarPlaceholder({ name, size = 'md' }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={`${cls} rounded-full bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-400 flex-shrink-0`}>
      {initials}
    </div>
  );
}

export default function Chat({ onNavigate }) {
  const { user, token } = useAuth();
  const me = user ? String(user._id || user.id || '') : '';

  const [conversations, setConversations] = useState([]);
  const [convLoading, setConvLoading] = useState(true);
  const [activeConv, setActiveConv] = useState(null); // { conversationId, otherUserId }
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [newChatId, setNewChatId] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);

  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // ── Socket.io connection ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const socket = socketIo(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true
    });
    socketRef.current = socket;
    socket.on('chat:message', (msg) => {
      // Append incoming real-time message if it belongs to the active conversation
      setMessages(prev => {
        if (activeConv && msg.conversationId === activeConv.conversationId) {
          // Avoid duplicates (our own sent message arrives back too)
          if (prev.some(m => String(m._id) === String(msg._id))) return prev;
          return [...prev, msg];
        }
        return prev;
      });
      // Update conversation list last message
      setConversations(prev => prev.map(c =>
        c.conversationId === msg.conversationId
          ? { ...c, lastMessage: { text: msg.text, sender: msg.sender, createdAt: msg.createdAt }, unread: msg.sender !== me }
          : c
      ));
    });
    return () => { socket.disconnect(); socketRef.current = null; };
  }, [token]);

  // Re-subscribe when active conversation changes
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeConv) return;
    socket.emit('chat:join', activeConv.conversationId);
    return () => { socket.emit('chat:leave', activeConv.conversationId); };
  }, [activeConv?.conversationId]);

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Load conversation list ────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    setConvLoading(true);
    try {
      const res = await apiRequest(API_ENDPOINTS.CHAT.CONVERSATIONS, { method: 'GET' });
      if (res.success) setConversations(res.data || []);
    } catch { /* non-fatal */ }
    setConvLoading(false);
  }, []);

  useEffect(() => { if (token) loadConversations(); }, [token, loadConversations]);

  // ── Open a conversation ────────────────────────────────────────────────────
  const openConversation = async (conv) => {
    setActiveConv(conv);
    setMsgLoading(true);
    setMessages([]);
    try {
      const res = await apiRequest(API_ENDPOINTS.CHAT.MESSAGES(conv.conversationId), { method: 'GET' });
      if (res.success) setMessages(res.data || []);
    } catch (err) {
      setError('Could not load messages.');
    }
    setMsgLoading(false);
    inputRef.current?.focus();
  };

  // ── Start new conversation ────────────────────────────────────────────────
  const startNewChat = async () => {
    const otherId = newChatId.trim();
    if (!otherId) return;
    try {
      const res = await apiRequest(API_ENDPOINTS.CHAT.START, {
        method: 'POST',
        body: JSON.stringify({ otherUserId: otherId })
      });
      if (!res.success) throw new Error(res.message);
      const conv = { conversationId: res.data.conversationId, otherUserId: otherId, lastMessage: null, unread: false };
      setConversations(prev => {
        const existing = prev.find(c => c.conversationId === conv.conversationId);
        if (existing) return prev;
        return [conv, ...prev];
      });
      setShowNewChat(false);
      setNewChatId('');
      openConversation(conv);
    } catch (err) {
      setError(err.message || 'Could not start conversation.');
    }
  };

  // ── Send a message ────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!inputText.trim() || !activeConv || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      const res = await apiRequest(API_ENDPOINTS.CHAT.MESSAGES(activeConv.conversationId), {
        method: 'POST',
        body: JSON.stringify({ text })
      });
      if (!res.success) throw new Error(res.message);
      // Append optimistically (Socket.io will also push it — dedup is handled in the listener)
      setMessages(prev => {
        if (prev.some(m => String(m._id) === String(res.data._id))) return prev;
        return [...prev, res.data];
      });
    } catch (err) {
      setError(err.message || 'Failed to send message.');
    }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const otherLabel = (conv) => conv.otherUserId || 'Unknown';

  // ── Render: conversation list ─────────────────────────────────────────────
  const renderConversationList = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        <h2 className="text-base font-semibold text-white">Messages</h2>
        <button
          onClick={() => setShowNewChat(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-600/40 transition-colors"
        >
          + New chat
        </button>
      </div>

      {showNewChat && (
        <div className="px-4 py-3 bg-[#0d1f2d]/80 border-b border-white/10">
          <p className="text-xs text-gray-400 mb-2">Enter the EcoNet user ID to message</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newChatId}
              onChange={(e) => setNewChatId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startNewChat()}
              placeholder="User ID"
              className="eco-input flex-1 text-sm"
            />
            <button onClick={startNewChat} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500">
              Start
            </button>
            <button onClick={() => setShowNewChat(false)} className="px-3 py-1.5 bg-white/5 text-gray-400 rounded-lg text-sm hover:bg-white/10">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {convLoading ? (
          <p className="text-gray-400 text-sm text-center py-8">Loading…</p>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FaComment className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No conversations yet.</p>
            <p className="text-gray-500 text-xs mt-1">Start a new chat to message another EcoNet member.</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.conversationId}
              onClick={() => openConversation(conv)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 border-b border-white/5 text-left hover:bg-white/5 transition-colors ${activeConv?.conversationId === conv.conversationId ? 'bg-emerald-600/10 border-l-2 border-l-emerald-500' : ''}`}
            >
              <AvatarPlaceholder name={otherLabel(conv)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-white truncate">{otherLabel(conv)}</span>
                  {conv.lastMessage?.createdAt && (
                    <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{formatTime(conv.lastMessage.createdAt)}</span>
                  )}
                </div>
                {conv.lastMessage ? (
                  <p className={`text-xs truncate ${conv.unread ? 'text-white font-medium' : 'text-gray-400'}`}>
                    {conv.lastMessage.sender === me ? 'You: ' : ''}{conv.lastMessage.text}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 italic">No messages yet</p>
                )}
              </div>
              {conv.unread && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );

  // ── Render: message thread ────────────────────────────────────────────────
  const renderThread = () => (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <button
          onClick={() => setActiveConv(null)}
          className="lg:hidden p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
        >
          <FaArrowLeft className="w-4 h-4" />
        </button>
        <AvatarPlaceholder name={otherLabel(activeConv)} />
        <div>
          <p className="text-sm font-semibold text-white">{otherLabel(activeConv)}</p>
          <p className="text-xs text-gray-500">EcoNet member</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {msgLoading ? (
          <p className="text-gray-400 text-sm text-center py-8">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">No messages yet. Say hello!</p>
        ) : (
          messages.map((msg) => {
            const isMine = msg.sender === me;
            return (
              <div key={msg._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                {!isMine && (
                  <AvatarPlaceholder name={otherLabel(activeConv)} size="sm" />
                )}
                <div className={`max-w-[70%] ${!isMine ? 'ml-2' : ''}`}>
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm ${
                    isMine
                      ? 'bg-emerald-600 text-white rounded-br-sm'
                      : 'bg-[#1a2a3a] text-gray-200 border border-white/10 rounded-bl-sm'
                  }`}>
                    {msg.text}
                  </div>
                  <p className={`text-xs mt-0.5 text-gray-500 ${isMine ? 'text-right' : ''}`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/10">
        {error && (
          <p className="text-red-400 text-xs mb-2">{error}</p>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Type a message… (Enter to send)"
            className="eco-input flex-1 resize-none min-h-[38px] max-h-32"
            style={{ height: Math.min(32 + inputText.split('\n').length * 20, 128) }}
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || sending}
            className="p-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <FaPaperPlane className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-1">Shift+Enter for a new line</p>
      </div>
    </div>
  );

  // ── Page layout ────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="eco-page flex items-center justify-center">
        <p className="text-gray-400">Sign in to use chat.</p>
      </div>
    );
  }

  return (
    <div className="eco-page eco-fade-up">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-4 sm:py-8 h-[calc(100vh-8rem)]">
        <div className="eco-card-full h-full flex overflow-hidden">
          {/* Conversation list — always visible on desktop, shown on mobile when no active conv */}
          <div className={`${activeConv ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-80 border-r border-white/10 flex-shrink-0`}>
            {renderConversationList()}
          </div>

          {/* Thread — shown on desktop always; on mobile only when a conv is active */}
          <div className={`${activeConv ? 'flex' : 'hidden lg:flex'} flex-col flex-1 min-w-0`}>
            {activeConv ? renderThread() : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                <FaUser className="w-12 h-12 text-gray-600 mb-4" />
                <p className="text-gray-400 text-sm">Select a conversation to start messaging</p>
                <p className="text-gray-600 text-xs mt-1">or click "New chat" to message an EcoNet member</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
