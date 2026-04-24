import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FaArrowDown,
  FaArrowUp,
  FaBroadcastTower,
  FaComments,
  FaExpand,
  FaFire,
  FaGift,
  FaGlobe,
  FaHashtag,
  FaHeart,
  FaLeaf,
  FaPlay,
  FaRobot,
  FaShare,
  FaTerminal,
  FaTimes,
  FaUserFriends,
  FaUsers,
  FaVolumeUp
} from 'react-icons/fa';
import { useVoiceInterface } from '../hooks/useVoiceInterface';
import { useAuth } from '../context/AuthContext';
import LiloAI from './LiloAI';
import CommandCenter from './CommandCenter';
import SentinelBadge from './SentinelBadge';
import SentinelLive from './SentinelLive';
import { feedService } from '../features/dashboard/services/feedService';
import { getLedBarClass, getPostStatus, isClimateSignal, isCommandEligible, isSentinelVerified } from '../services/postSignal';
import { useTheme } from '../context/ThemeContext';
import { classifyClientPost } from '../services/postClassification';
import { applyRewardToReputation, claimDailyHarvest, readHarvestState, REWARD_RULES } from '../services/economy';
import { resolveMediaUrl } from '../services/runtimeConfig';

const DEFAULT_TRENDING = [
  { tag: '#ClimateAction', count: 12500, trend: 'up' },
  { tag: '#FloodWarning', count: 8900, trend: 'up' },
  { tag: '#AirQuality', count: 6700, trend: 'down' },
  { tag: '#CarbonNeutral', count: 5430, trend: 'stable' },
  { tag: '#Renewable', count: 4210, trend: 'up' }
];

const LOCAL_POSTS_KEY = 'econet-local-posts';

const GIFT_OPTIONS = [
  { key: 'giftLeaf', label: 'Leaf', icon: FaLeaf, accent: 'text-emerald-500' },
  { key: 'giftSolar', label: 'Solar', icon: FaFire, accent: 'text-amber-500' },
  { key: 'giftTree', label: 'Tree', icon: FaGift, accent: 'text-green-700' }
];

function extractHashtags(text) {
  const hashtags = text.match(/#\w+/g) || [];
  return hashtags.length > 0 ? hashtags : ['#general'];
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function hasMapCoordinates(post) {
  if (post?.location?.lat != null && post?.location?.lon != null) return true;
  return Array.isArray(post?.location?.coordinates?.coordinates);
}

function readLocalPosts() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_POSTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalPosts(posts) {
  localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getCurrentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 60000
      }
    );
  });
}

function getMediaType(file) {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'image';
}

function postSupportsFullView(post) {
  return (post.media?.length || 0) > 0 || (post.images?.length || 0) > 0;
}

function buildFallbackMedia(images = []) {
  return images.map((url, index) => ({
    type: 'image',
    url,
    name: `Image ${index + 1}`
  }));
}

const SocialDashboard = ({ user, reports = [] }) => {
  const { user: authUser, setUser, token } = useAuth();
  const activeUser = authUser || user;
  const { isListening, startListening, stopListening, transcript, voiceSupported } = useVoiceInterface();
  const { theme } = useTheme();

  const [mode, setMode] = useState('social');
  const [posts, setPosts] = useState([]);
  const [localPosts, setLocalPosts] = useState(() => readLocalPosts());
  const [newPost, setNewPost] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState([]);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [floatingEffects, setFloatingEffects] = useState([]);
  const [burstPostIds, setBurstPostIds] = useState([]);
  const [showLive, setShowLive] = useState(false);
  const [liveSession, setLiveSession] = useState(null);
  const [harvestState, setHarvestState] = useState(() => readHarvestState());
  const [bloomMeter, setBloomMeter] = useState(0);
  const [doubleRewardsUntil, setDoubleRewardsUntil] = useState(null);

  const normalizePost = (report) => {
    const reportUser = report.user || {};
    const isCurrentUserPost =
      reportUser.id === activeUser?._id ||
      reportUser._id === activeUser?._id ||
      reportUser.email === activeUser?.email;

    const media = report.media?.length ? report.media : buildFallbackMedia(report.images || []);

    return {
      id: report.id || report._id || Date.now().toString(),
      author: reportUser.name || report.authorName || activeUser?.name || 'Anonymous User',
      avatar: resolveMediaUrl(
        isCurrentUserPost
          ? activeUser?.avatar || reportUser.avatar || report.avatar || 'https://picsum.photos/seed/avatar40/40/40.jpg'
          : reportUser.avatar || report.avatar || 'https://picsum.photos/seed/avatar40/40/40.jpg'
      ),
      content: report.content || report.description || 'Community post',
      timestamp: report.timestamp || report.createdAt || new Date().toISOString(),
      likes: report.likes || 0,
      likedByViewer: Boolean(report.likedByViewer),
      comments: Array.isArray(report.comments) ? report.comments.length : report.comments || 0,
      shares: report.shares || 0,
      verifiedReporter: reportUser.verifiedReporter || report.verifiedReporter || false,
      trustScore: reportUser.trustScore || report.trustScore || 0,
      urgency: report.urgency || 'Low',
      severity: report.severity || 'Low',
      category: report.category || 'Other',
      type: report.signalSource || 'social',
      tags: report.tags || extractHashtags(report.description || report.content || ''),
      upvotes: report.upvotes || 0,
      downvotes: report.downvotes || 0,
      validated: report.verificationStatus === 'verified',
      validatedByViewer: Boolean(report.validatedByViewer),
      downvotedByViewer: Boolean(report.downvotedByViewer),
      ai_confidence: report.liloClassification?.confidence || report.ai_confidence || report.aiScore || 0,
      postStatus: report.postStatus || 'regular',
      liloClassification: report.liloClassification || {
        isClimateRelated: false,
        confidence: 0,
        summary: '',
        matchedSignals: [],
        routedToCommand: false
      },
      images: report.images || [],
      media,
      location: report.location || null,
      isLocalOnly: Boolean(report.isLocalOnly),
      isLive: Boolean(report.isLive),
      proofOfPresence: Boolean(report.proofOfPresence)
    };
  };

  const mergePosts = useMemo(() => {
    const remotePosts = reports.map(normalizePost);
    const persistedLocalPosts = localPosts.map(normalizePost);
    const merged = [...persistedLocalPosts, ...remotePosts];
    const seen = new Set();

    return merged
      .filter((post) => {
        if (seen.has(post.id)) return false;
        seen.add(post.id);
        return true;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [reports, localPosts, activeUser?.avatar, activeUser?.name, activeUser?._id, activeUser?.email]);

  useEffect(() => {
    setPosts(mergePosts);
  }, [mergePosts]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) setSidebarOpen(false);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (transcript && transcript.trim()) {
      setNewPost(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    if (!doubleRewardsUntil) return undefined;

    const timer = window.setInterval(() => {
      if (Date.now() > doubleRewardsUntil) {
        setDoubleRewardsUntil(null);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [doubleRewardsUntil]);

  const syncUserReputation = (reward) => {
    if (!reward) return;
    const multiplier = doubleRewardsUntil && Date.now() < doubleRewardsUntil ? 2 : 1;
    const effectiveReward = {
      leaves: (reward.leaves || 0) * multiplier,
      ecoCoins: (reward.ecoCoins || 0) * multiplier
    };

    setUser((prev) => ({
      ...prev,
      reputation: applyRewardToReputation(prev?.reputation || {}, effectiveReward)
    }));

    const bloomGain = (reward.bloom || 0) * multiplier;
    setBloomMeter((prev) => {
      const next = prev + bloomGain;
      if (next >= 100) {
        setDoubleRewardsUntil(Date.now() + 30000);
        return next - 100;
      }
      return next;
    });
  };

  const persistLocalPost = (post) => {
    setLocalPosts((prev) => {
      const next = [post, ...prev.filter((entry) => entry.id !== post.id)];
      writeLocalPosts(next);
      return next;
    });
  };

  const removeLocalPost = (postId) => {
    setLocalPosts((prev) => {
      const next = prev.filter((entry) => entry.id !== postId);
      writeLocalPosts(next);
      return next;
    });
  };

  const updatePostById = (postId, updater) => {
    setPosts((prev) => prev.map((entry) => (entry.id === postId ? updater(entry) : entry)));
    setLocalPosts((prev) => {
      const next = prev.map((entry) => (entry.id === postId ? updater(normalizePost(entry)) : entry));
      writeLocalPosts(next);
      return next;
    });
    setSelectedPost((prev) => (prev?.id === postId ? updater(prev) : prev));
  };

  const spawnFloatingEffect = (postId, label, color = 'text-emerald-500') => {
    const effect = {
      id: `${postId}-${Date.now()}-${Math.random()}`,
      postId,
      label,
      color,
      x: Math.round(Math.random() * 60 - 30)
    };

    setFloatingEffects((prev) => [...prev, effect]);
    window.setTimeout(() => {
      setFloatingEffects((prev) => prev.filter((entry) => entry.id !== effect.id));
    }, 1600);
  };

  const triggerBurst = (postId) => {
    setBurstPostIds((prev) => [...prev, postId]);
    window.setTimeout(() => {
      setBurstPostIds((prev) => prev.filter((entry) => entry !== postId));
    }, 600);
  };

  const createLocalPost = () => {
    const media = attachedMedia.map((media) => ({
      type: media.type,
      url: media.url,
      name: media.name,
      mimeType: media.mimeType,
      duration: media.duration || null
    }));

    return normalizePost({
      id: `local-${Date.now()}`,
      description: newPost.trim(),
      content: newPost.trim(),
      createdAt: new Date().toISOString(),
      images: media.filter((entry) => entry.type === 'image').map((entry) => entry.url),
      media,
      signalSource: liveSession?.isLive ? 'command' : 'social',
      isLive: Boolean(liveSession?.isLive),
      proofOfPresence: Boolean(liveSession?.proofOfPresence),
      location: liveSession?.location
        ? {
            text: 'Live proof of presence',
            lat: liveSession.location.lat,
            lon: liveSession.location.lon
          }
        : null,
      ...classifyClientPost(newPost.trim()),
      user: {
        id: activeUser?._id,
        name: activeUser?.name,
        avatar: activeUser?.avatar,
        verifiedReporter: activeUser?.verifiedReporter,
        trustScore: activeUser?.reputation?.trustScore || 0
      },
      isLocalOnly: true
    });
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) return;

    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
      await setUser({ avatar: loadEvent.target.result });
    };
    reader.readAsDataURL(file);
  };

  const handleMediaAttachment = async (event) => {
    const files = Array.from(event.target.files || []);
    const mediaFiles = await Promise.all(
      files.map(async (file) => {
        const type = getMediaType(file);
        return {
          file,
          url: await fileToDataUrl(file),
          type,
          mimeType: file.type,
          name: file.name
        };
      })
    );
    setAttachedMedia((prev) => [...prev, ...mediaFiles]);
  };

  const removeMedia = (index) => {
    setAttachedMedia((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const createPost = async () => {
    if ((!newPost.trim() && attachedMedia.length === 0) || isProcessing) return;

    setIsProcessing(true);
    setComposerError('');
    const optimisticPost = createLocalPost();
    persistLocalPost(optimisticPost);
    setPosts((prev) => [optimisticPost, ...prev.filter((entry) => entry.id !== optimisticPost.id)]);
    const postText = newPost;
    const mediaToClear = attachedMedia;
    const liveContext = liveSession;
    const geolocation = await getCurrentPosition();
    setNewPost('');
    setAttachedMedia([]);
    triggerBurst(optimisticPost.id);

    try {
      const payload = {
        description: postText.trim(),
        images: mediaToClear.filter((media) => media.type === 'image').map((media) => media.url),
        media: mediaToClear.map((media) => ({
          type: media.type,
          url: media.url,
          name: media.name,
          mimeType: media.mimeType
        })),
        signalSource: liveContext?.isLive ? 'command' : 'social',
        isLive: Boolean(liveContext?.isLive),
        proofOfPresence: Boolean(liveContext?.proofOfPresence),
        liveSessionId: liveContext?.sessionId || '',
        location: liveContext?.location
          ? {
              text: 'Live proof of presence',
              lat: liveContext.location.lat,
              lon: liveContext.location.lon
            }
          : geolocation
            ? {
                text: 'Device location',
                lat: geolocation.coords.latitude,
                lon: geolocation.coords.longitude
              }
            : undefined
      };

      const result = await feedService.createPost(payload, token);
      if (!result.success) {
        setComposerError('Backend unavailable. Post saved locally in the feed.');
      } else {
        const createdPost = normalizePost({
          ...result.data.report,
          user: {
            ...result.data.report.user,
            avatar: activeUser?.avatar || result.data.report.user?.avatar,
            name: activeUser?.name || result.data.report.user?.name,
            verifiedReporter: activeUser?.verifiedReporter ?? result.data.report.user?.verifiedReporter
          }
        });
        removeLocalPost(optimisticPost.id);
        setPosts((prev) => [createdPost, ...prev.filter((item) => item.id !== createdPost.id)]);
      }

      syncUserReputation(liveContext?.isLive ? REWARD_RULES.livePost : REWARD_RULES.post);
      spawnFloatingEffect(optimisticPost.id, liveContext?.isLive ? '+Live Signal' : '+Posted', 'text-emerald-500');
      setLiveSession(null);
    } catch (error) {
      console.error('Error creating post:', error);
      setComposerError('Network issue detected. Post saved locally in the feed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const loadComments = async (post) => {
    if (post.isLocalOnly) {
      setCommentsByPost((prev) => ({ ...prev, [post.id]: prev[post.id] || [] }));
      return;
    }

    const response = await feedService.fetchComments(post.id, token);
    if (response.success) {
      setCommentsByPost((prev) => ({ ...prev, [post.id]: response.data }));
    }
  };

  const openPost = async (post) => {
    setSelectedPost(post);
    triggerBurst(post.id);
    spawnFloatingEffect(post.id, 'Engagement live', 'text-sky-400');
    await loadComments(post);
  };

  const handleLike = async (post) => {
    const optimisticLiked = !post.likedByViewer;
    updatePostById(post.id, (entry) => ({
      ...entry,
      likedByViewer: optimisticLiked,
      likes: Math.max(0, (entry.likes || 0) + (optimisticLiked ? 1 : -1))
    }));

    spawnFloatingEffect(post.id, optimisticLiked ? '+Like' : 'Like removed', 'text-rose-500');
    triggerBurst(post.id);

    const response = await feedService.likePost(post.id, token);
    if (response.success) {
      updatePostById(post.id, (entry) => ({
        ...entry,
        likedByViewer: response.data.liked,
        likes: response.data.likes
      }));
      if (response.data.liked) {
        syncUserReputation(REWARD_RULES.like);
      }
    }
  };

  const handleValidate = async (post) => {
    updatePostById(post.id, (entry) => ({
      ...entry,
      validatedByViewer: !entry.validatedByViewer,
      downvotedByViewer: false,
      upvotes: Math.max(0, (entry.upvotes || 0) + (entry.validatedByViewer ? -1 : 1)),
      downvotes: entry.downvotedByViewer ? Math.max(0, (entry.downvotes || 0) - 1) : entry.downvotes
    }));
    spawnFloatingEffect(post.id, '+Validate', 'text-emerald-500');
    triggerBurst(post.id);

    const response = await feedService.validatePost(post.id, token);
    if (response.success) {
      updatePostById(post.id, (entry) => ({
        ...entry,
        upvotes: response.data.upvotes,
        downvotes: response.data.downvotes,
        validatedByViewer: response.data.validatedByViewer,
        downvotedByViewer: response.data.downvotedByViewer
      }));
      if (response.data.validatedByViewer) {
        syncUserReputation(REWARD_RULES.validate);
      }
    }
  };

  const handleDownvote = async (post) => {
    updatePostById(post.id, (entry) => ({
      ...entry,
      downvotedByViewer: !entry.downvotedByViewer,
      validatedByViewer: false,
      downvotes: Math.max(0, (entry.downvotes || 0) + (entry.downvotedByViewer ? -1 : 1)),
      upvotes: entry.validatedByViewer ? Math.max(0, (entry.upvotes || 0) - 1) : entry.upvotes
    }));
    spawnFloatingEffect(post.id, 'Downvote', 'text-amber-500');

    const response = await feedService.downvotePost(post.id, token);
    if (response.success) {
      updatePostById(post.id, (entry) => ({
        ...entry,
        upvotes: response.data.upvotes,
        downvotes: response.data.downvotes,
        validatedByViewer: response.data.validatedByViewer,
        downvotedByViewer: response.data.downvotedByViewer
      }));
      if (response.data.downvotedByViewer) {
        syncUserReputation(REWARD_RULES.downvote);
      }
    }
  };

  const handleVerify = async (post) => {
    const response = await feedService.verifyPost(post.id, token);
    if (response.success) {
      updatePostById(post.id, (entry) => ({
        ...entry,
        validated: true
      }));
      spawnFloatingEffect(post.id, 'Verified signal', 'text-emerald-500');
      syncUserReputation(REWARD_RULES.validate);
    }
  };

  const handleShare = async (post) => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${post.category} signal on EcoNet`,
          text: post.content
        });
      }
    } catch (error) {
      console.warn('Native share skipped:', error);
    }

    const response = await feedService.sharePost(post.id, token);
    if (response.success) {
      updatePostById(post.id, (entry) => ({
        ...entry,
        shares: response.data.shares
      }));
      spawnFloatingEffect(post.id, '+Share', 'text-sky-500');
      syncUserReputation(REWARD_RULES.share);
    }
  };

  const handleSubmitComment = async (post) => {
    const commentText = (commentDrafts[post.id] || '').trim();
    if (!commentText) return;

    const optimisticComment = {
      id: `local-comment-${Date.now()}`,
      text: commentText,
      createdAt: new Date().toISOString(),
      user: {
        id: activeUser?._id,
        name: activeUser?.name,
        avatar: resolveMediaUrl(activeUser?.avatar)
      }
    };

    setCommentsByPost((prev) => ({
      ...prev,
      [post.id]: [optimisticComment, ...(prev[post.id] || [])]
    }));
    setCommentDrafts((prev) => ({ ...prev, [post.id]: '' }));
    updatePostById(post.id, (entry) => ({ ...entry, comments: (entry.comments || 0) + 1 }));
    spawnFloatingEffect(post.id, '+Comment', 'text-sky-500');
    triggerBurst(post.id);

    const response = await feedService.submitComment(post.id, commentText, token);
    if (response.success) {
      setCommentsByPost((prev) => ({
        ...prev,
        [post.id]: [response.data, ...(prev[post.id] || []).filter((entry) => entry.id !== optimisticComment.id)]
      }));
      syncUserReputation(REWARD_RULES.comment);
    }
  };

  const handleGift = (post, giftKey) => {
    const reward = REWARD_RULES[giftKey];
    updatePostById(post.id, (entry) => ({
      ...entry,
      giftsCount: (entry.giftsCount || 0) + 1
    }));
    spawnFloatingEffect(post.id, `+${giftKey.replace('gift', '')}`, 'text-fuchsia-500');
    syncUserReputation(reward);
  };

  const handleHarvest = () => {
    const result = claimDailyHarvest();
    setHarvestState(readHarvestState());
    if (result.claimed) {
      syncUserReputation(result.reward);
      spawnFloatingEffect('harvest', `+${result.reward.leaves} Leaves`, 'text-emerald-500');
    }
  };

  const handleLiveStarted = (payload) => {
    setLiveSession(payload);
  };

  const commandPosts = posts.filter((post) => isCommandEligible(post) && hasMapCoordinates(post));

  if (mode === 'command') {
    return <CommandCenter reports={commandPosts} user={activeUser} />;
  }

  return (
    <div className={`min-h-screen theme-surface theme-${theme}`}>
      <header className="sticky top-0 z-40 border-b border-theme bg-theme-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-green-600 to-blue-600 text-sm font-bold text-white">EN</div>
              <span className="text-xl font-bold text-theme-primary">EcoNet IO</span>
            </div>
            <button
              onClick={() => setShowLive(true)}
              className="flex items-center space-x-2 rounded-full border border-white/20 bg-red-500/85 px-3 py-1 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:bg-red-600/90"
            >
              <div className="h-2 w-2 animate-pulse rounded-full bg-white"></div>
              <span>{liveSession?.isLive ? 'LIVE ACTIVE' : 'LIVE'}</span>
            </button>
          </div>

          <div className="hidden items-center space-x-1 rounded-lg bg-theme-muted p-1 md:flex">
            <button onClick={() => setMode('social')} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'social' ? 'bg-theme-card text-theme-primary shadow-sm' : 'text-theme-secondary hover:text-theme-primary'}`}>
              <FaUserFriends className="mr-2 inline" />
              Social
            </button>
            <button onClick={() => setMode('command')} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'command' ? 'bg-theme-card text-theme-primary shadow-sm' : 'text-theme-secondary hover:text-theme-primary'}`}>
              <FaTerminal className="mr-2 inline" />
              Command
            </button>
          </div>

          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="rounded-lg p-2 hover:bg-theme-muted md:hidden">
            <FaGlobe className="h-5 w-5" />
          </button>

          <div className="hidden items-center space-x-4 md:flex">
            {voiceSupported && (
              <button onClick={isListening ? stopListening : startListening} className={`rounded-lg p-2 transition-colors ${isListening ? 'animate-pulse bg-red-100 text-red-600' : 'bg-theme-muted text-theme-secondary hover:bg-theme-muted/80'}`}>
                <FaRobot className="h-4 w-4" />
              </button>
            )}
            <div className="flex items-center space-x-2">
              <div className="relative">
                <img src={resolveMediaUrl(activeUser?.avatar) || 'https://picsum.photos/seed/avatar32/32/32.jpg'} alt={activeUser?.name} className="h-8 w-8 cursor-pointer rounded-full object-cover hover:opacity-80" onClick={() => document.getElementById('avatar-upload').click()} />
                <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>
              <span className="text-sm font-medium text-theme-primary">{activeUser?.name}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-theme bg-theme-card p-2 shadow-sm md:hidden">
          <button onClick={() => setMode('social')} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${mode === 'social' ? 'bg-theme-muted text-theme-primary' : 'text-theme-secondary'}`}>
            <FaUserFriends className="mr-2 inline" />
            Social
          </button>
          <button onClick={() => setMode('command')} className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${mode === 'command' ? 'bg-theme-muted text-theme-primary' : 'text-theme-secondary'}`}>
            <FaTerminal className="mr-2 inline" />
            Command
          </button>
        </div>

        {composerError && composerError.includes('locally') && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This post is only on this device right now. Cross-device visibility on the deployed beta still needs persistent server storage behind the Netlify function.
          </div>
        )}

        {doubleRewardsUntil && Date.now() < doubleRewardsUntil && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-100 to-yellow-100 px-4 py-3 text-sm font-semibold text-amber-900"
          >
            Global Bloom is active. Rewards are doubled for 30 seconds.
          </motion.div>
        )}

        <div className="flex gap-6">
          <main className={`flex-1 ${sidebarOpen ? 'hidden md:block' : ''}`}>
            <div className="mb-6 rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
              <div className="flex space-x-3">
                <img src={resolveMediaUrl(activeUser?.avatar) || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face'} alt={activeUser?.name} className="h-10 w-10 rounded-full object-cover" />
                <div className="flex-1">
                  <div className="relative">
                    <textarea
                      value={newPost}
                      onChange={(event) => setNewPost(event.target.value)}
                      placeholder="Share an update. LILO routes climate signals into command mode."
                      className="w-full resize-none rounded-xl border border-theme bg-theme-card px-3 py-3 text-theme-primary focus:border-transparent focus:ring-2 focus:ring-green-500"
                      rows={3}
                    />
                    <div className="absolute bottom-2 right-2 flex space-x-2">
                      <input id="media-upload" type="file" accept="image/*,video/*,audio/*" multiple onChange={handleMediaAttachment} className="hidden" />
                      <button type="button" onClick={() => document.getElementById('media-upload').click()} className="rounded-full bg-theme-muted p-2 text-theme-secondary transition-colors hover:bg-theme-muted/80" title="Attach image, video, or audio">
                        <FaExpand className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {attachedMedia.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {attachedMedia.map((media, index) => (
                        <button
                          key={`${media.name}-${index}`}
                          type="button"
                          onClick={() => setSelectedMedia(media)}
                          className="group relative overflow-hidden rounded-xl border border-theme bg-theme-muted"
                        >
                          {media.type === 'image' && <img src={media.url} alt={media.name} className="h-20 w-20 object-cover" />}
                          {media.type === 'video' && (
                            <div className="relative h-20 w-20">
                              <video src={media.url} className="h-20 w-20 object-cover" />
                              <FaPlay className="absolute inset-0 m-auto text-white drop-shadow" />
                            </div>
                          )}
                          {media.type === 'audio' && (
                            <div className="flex h-20 w-28 flex-col items-center justify-center gap-2 px-3">
                              <FaVolumeUp className="text-theme-primary" />
                              <span className="line-clamp-1 text-xs text-theme-secondary">{media.name}</span>
                            </div>
                          )}
                          <button type="button" onClick={(event) => { event.stopPropagation(); removeMedia(index); }} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">×</button>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-theme-secondary">
                      <span>Social Mode</span>
                      {liveSession?.isLive && (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 font-semibold text-red-600">
                            <FaBroadcastTower />
                            Live proof ready
                          </span>
                          <button type="button" onClick={() => setLiveSession(null)} className="rounded-full bg-theme-muted px-2 py-1 font-semibold text-theme-secondary hover:bg-theme-muted/80">
                            Clear live context
                          </button>
                        </>
                      )}
                    </div>
                    <div className="flex space-x-3">
                      <button onClick={() => { setNewPost(''); setAttachedMedia([]); }} className="px-4 py-2 text-sm font-medium text-theme-secondary hover:text-theme-primary">Cancel</button>
                      <button onClick={createPost} disabled={(!newPost.trim() && attachedMedia.length === 0) || isProcessing} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
                        {isProcessing ? 'Processing...' : 'Post'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {composerError && <p className="mt-3 text-sm text-amber-600">{composerError}</p>}
            </div>

            <div className="space-y-4">
              {posts.map((post) => {
                const effects = floatingEffects.filter((entry) => entry.postId === post.id);
                const burstActive = burstPostIds.includes(post.id);
                const previewMedia = post.media?.length ? post.media : buildFallbackMedia(post.images || []);

                return (
                  <motion.article
                    key={post.id}
                    layout
                    className="relative overflow-hidden rounded-2xl border border-theme bg-theme-card p-4 shadow-sm transition-shadow hover:shadow-md"
                    onClick={() => openPost(post)}
                  >
                    <div className={`absolute left-0 right-0 top-0 h-1.5 ${getLedBarClass(post)}`}></div>

                    <AnimatePresence>
                      {burstActive && (
                        <motion.div
                          initial={{ scale: 0.2, opacity: 0.55 }}
                          animate={{ scale: 2.1, opacity: 0 }}
                          exit={{ opacity: 0 }}
                          className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300 bg-emerald-300/10"
                        />
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {effects.map((effect) => (
                        <motion.div
                          key={effect.id}
                          initial={{ opacity: 0, y: 18, x: effect.x, scale: 0.9 }}
                          animate={{ opacity: 1, y: -24, x: effect.x, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className={`pointer-events-none absolute right-10 top-8 z-20 text-sm font-bold ${effect.color}`}
                        >
                          {effect.label}
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    <div className="flex space-x-3">
                      <img src={resolveMediaUrl(post.avatar)} alt={post.author} className="h-12 w-12 rounded-full object-cover" />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-theme-primary">{post.author}</h3>
                          {isSentinelVerified(post) && <SentinelBadge compact />}
                          {getPostStatus(post) === 'critical' && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">Critical</span>}
                          {post.isLive && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">Live Front</span>}
                          {post.proofOfPresence && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Proof of Presence</span>}
                          <span className="text-sm text-theme-secondary">·</span>
                          <time className="text-sm text-theme-secondary">{formatTime(post.timestamp)}</time>
                          {post.isLocalOnly && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Local</span>}
                        </div>

                        <div className="mt-2 text-theme-primary">{post.content}</div>

                        {previewMedia.length > 0 && (
                          <div className="mt-3 grid gap-2">
                            {previewMedia.slice(0, 3).map((media, index) => (
                              <button key={`${media.url}-${index}`} type="button" onClick={(event) => { event.stopPropagation(); setSelectedMedia(media); }} className="group relative overflow-hidden rounded-lg text-left">
                                {media.type === 'image' && <img src={resolveMediaUrl(media.url)} alt={`Post media ${index + 1}`} className="h-48 w-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-[1.02]" />}
                                {media.type === 'video' && (
                                  <div className="relative">
                                    <video src={resolveMediaUrl(media.url)} className="h-48 w-full rounded-lg object-cover" />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                      <FaPlay className="text-2xl text-white" />
                                    </div>
                                  </div>
                                )}
                                {media.type === 'audio' && (
                                  <div className="flex h-20 items-center gap-3 rounded-lg bg-theme-muted px-4">
                                    <FaVolumeUp className="text-theme-primary" />
                                    <div>
                                      <div className="text-sm font-semibold text-theme-primary">{media.name || 'Voice note'}</div>
                                      <div className="text-xs text-theme-secondary">Tap to open audio</div>
                                    </div>
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                                  <span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100">
                                    <FaExpand />
                                    View media
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {isClimateSignal(post) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-theme-secondary">LILO Confidence:</span>
                            <span className={`font-bold ${post.ai_confidence >= 90 ? 'text-green-600' : post.ai_confidence >= 80 ? 'text-blue-600' : post.ai_confidence >= 70 ? 'text-yellow-600' : 'text-orange-600'}`}>{post.ai_confidence}%</span>
                            <span className="text-theme-secondary">· {getPostStatus(post) === 'critical' ? 'Critical command signal' : 'Observation signal'}</span>
                          </div>
                        )}

                        {post.tags?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {post.tags.map((tag, index) => (
                              <span key={`${tag}-${index}`} className="inline-block rounded-full bg-green-100 px-2 py-1 text-xs text-green-800">{tag}</span>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                          <div className="flex flex-wrap items-center gap-4">
                            {isClimateSignal(post) && (
                              <>
                                <button type="button" onClick={(event) => { event.stopPropagation(); handleValidate(post); }} className={`flex items-center space-x-1 transition-colors ${post.validatedByViewer ? 'text-emerald-600' : 'text-theme-secondary hover:text-emerald-600'}`} title="Validate this climate signal">
                                  <FaArrowUp className="h-4 w-4" />
                                  <span className="text-sm">{post.upvotes || 0}</span>
                                </button>
                                <button type="button" onClick={(event) => { event.stopPropagation(); handleDownvote(post); }} className={`flex items-center space-x-1 transition-colors ${post.downvotedByViewer ? 'text-amber-600' : 'text-theme-secondary hover:text-amber-600'}`} title="Downvote this climate signal">
                                  <FaArrowDown className="h-4 w-4" />
                                  <span className="text-sm">{post.downvotes || 0}</span>
                                </button>
                              </>
                            )}
                            <button type="button" onClick={(event) => { event.stopPropagation(); handleLike(post); }} className={`flex items-center space-x-1 transition-colors ${post.likedByViewer ? 'text-rose-600' : 'text-theme-secondary hover:text-rose-600'}`}><FaHeart className="h-4 w-4" /><span className="text-sm">{post.likes || 0}</span></button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); openPost(post); }} className="flex items-center space-x-1 text-theme-secondary transition-colors hover:text-blue-600"><FaComments className="h-4 w-4" /><span className="text-sm">{post.comments || 0}</span></button>
                            <button type="button" onClick={(event) => { event.stopPropagation(); handleShare(post); }} className="flex items-center space-x-1 text-theme-secondary transition-colors hover:text-green-600"><FaShare className="h-4 w-4" /><span className="text-sm">{post.shares || 0}</span></button>
                          </div>

                          <div className="flex items-center gap-2">
                            {GIFT_OPTIONS.map((gift) => {
                              const GiftIcon = gift.icon;
                              return (
                                <button key={gift.key} type="button" onClick={(event) => { event.stopPropagation(); handleGift(post, gift.key); }} className="inline-flex items-center gap-1 rounded-full bg-theme-muted px-2.5 py-1 text-xs font-semibold text-theme-primary hover:bg-theme-muted/80">
                                  <GiftIcon className={gift.accent} />
                                  {gift.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {post.isLive && (
                          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                            Live front is active. This post can route directly into command visibility.
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </main>

          <aside className={`w-80 space-y-6 ${sidebarOpen ? 'block' : 'hidden md:block'}`}>
            <div className="rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold text-theme-primary">Economy Loop</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-theme-muted p-3">
                  <div className="text-xs text-theme-secondary">Leaves</div>
                  <div className="text-xl font-black text-theme-primary">{activeUser?.reputation?.leaves || 0}</div>
                </div>
                <div className="rounded-xl bg-theme-muted p-3">
                  <div className="text-xs text-theme-secondary">EcoCoins</div>
                  <div className="text-xl font-black text-theme-primary">{activeUser?.reputation?.ecoCoins || activeUser?.reputation?.seeds || 0}</div>
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-theme-muted p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-theme-secondary">
                  <span>Global Bloom</span>
                  <span>{Math.min(100, Math.round(bloomMeter))}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/50">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-lime-400 to-amber-300 transition-all" style={{ width: `${Math.min(100, bloomMeter)}%` }} />
                </div>
              </div>
              <button onClick={handleHarvest} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
                Daily Harvest
              </button>
              <div className="mt-2 text-center text-xs text-theme-secondary">Current streak: {harvestState.streak || 0} days</div>
              <div className="mt-4 space-y-2 text-xs text-theme-secondary">
                <div>Rules: Likes build Leaves. Verified climate reports earn EcoCoins. Trust 80+ with 3 verified reports unlocks Sentinel Verified.</div>
                <div>Live posts with proof of presence get stronger trust weight in command mode.</div>
              </div>
            </div>

            <div className="rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
              <h2 className="mb-4 flex items-center text-lg font-semibold text-theme-primary"><FaFire className="mr-2 text-orange-500" />Trending Topics</h2>
              <div className="space-y-2">
                {DEFAULT_TRENDING.map((topic, index) => (
                  <div key={index} className="flex cursor-pointer items-center justify-between rounded-lg p-2 hover:bg-theme-muted">
                    <span className="font-medium text-theme-primary">{topic.tag}</span>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-theme-secondary">{topic.count.toLocaleString()}</span>
                      {topic.trend === 'up' && <span className="text-xs text-green-500">+</span>}
                      {topic.trend === 'down' && <span className="text-xs text-red-500">-</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-theme bg-theme-card p-4 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-theme-primary">Quick Actions</h2>
              <div className="space-y-2">
                <button className="w-full rounded-lg px-3 py-2 text-left text-theme-primary hover:bg-theme-muted"><FaHashtag className="mr-2 inline text-theme-secondary" />Explore Topics</button>
                <button className="w-full rounded-lg px-3 py-2 text-left text-theme-primary hover:bg-theme-muted"><FaUsers className="mr-2 inline text-theme-secondary" />Find People</button>
                <button className="w-full rounded-lg px-3 py-2 text-left text-theme-primary hover:bg-theme-muted"><FaGlobe className="mr-2 inline text-theme-secondary" />Eco Resources</button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <AnimatePresence>
        {selectedPost && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" onClick={() => setSelectedPost(null)}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-theme-card p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-theme-primary">{selectedPost.author}</div>
                  <div className="text-sm text-theme-secondary">{selectedPost.category} · {formatTime(selectedPost.timestamp)}</div>
                </div>
                <button type="button" className="text-theme-secondary" onClick={() => setSelectedPost(null)}>
                  <FaTimes className="text-xl" />
                </button>
              </div>

              <div className="text-theme-primary">{selectedPost.content}</div>

              {postSupportsFullView(selectedPost) && (
                <div className="mt-4 grid gap-3">
                  {(selectedPost.media?.length ? selectedPost.media : buildFallbackMedia(selectedPost.images || [])).map((media, index) => (
                    <button key={`${media.url}-${index}`} type="button" onClick={() => setSelectedMedia(media)} className="overflow-hidden rounded-2xl border border-theme text-left">
                      {media.type === 'image' && <img src={resolveMediaUrl(media.url)} alt={`Post media ${index + 1}`} className="w-full object-cover" />}
                      {media.type === 'video' && <video controls src={resolveMediaUrl(media.url)} className="w-full" />}
                      {media.type === 'audio' && <audio controls src={resolveMediaUrl(media.url)} className="w-full p-4" />}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {isClimateSignal(selectedPost) && (activeUser?.reputation?.trustScore || 0) >= 70 && !selectedPost.validated && (
                  <button type="button" onClick={() => handleVerify(selectedPost)} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    Verify signal
                  </button>
                )}
                <button type="button" onClick={() => handleLike(selectedPost)} className="rounded-full bg-theme-muted px-4 py-2 text-sm font-semibold text-theme-primary">Like</button>
                <button type="button" onClick={() => handleShare(selectedPost)} className="rounded-full bg-theme-muted px-4 py-2 text-sm font-semibold text-theme-primary">Share</button>
              </div>

              <div className="mt-6">
                <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-theme-secondary">Comments</h3>
                <div className="mb-3 flex gap-2">
                  <input
                    value={commentDrafts[selectedPost.id] || ''}
                    onChange={(event) => setCommentDrafts((prev) => ({ ...prev, [selectedPost.id]: event.target.value }))}
                    placeholder="Add context, eyewitness detail, or response note"
                    className="flex-1 rounded-xl border border-theme bg-theme-card px-3 py-2 text-sm text-theme-primary focus:border-transparent focus:ring-2 focus:ring-emerald-500"
                  />
                  <button type="button" onClick={() => handleSubmitComment(selectedPost)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Send</button>
                </div>
                <div className="space-y-3">
                  {(commentsByPost[selectedPost.id] || []).map((comment) => (
                    <div key={comment.id || `${comment.user?.id}-${comment.createdAt}`} className="rounded-2xl bg-theme-muted px-4 py-3">
                      <div className="mb-1 flex items-center gap-2">
                        <img src={resolveMediaUrl(comment.user?.avatar) || 'https://picsum.photos/seed/comment/32/32'} alt={comment.user?.name} className="h-7 w-7 rounded-full object-cover" />
                        <span className="text-sm font-semibold text-theme-primary">{comment.user?.name || 'Sentinel'}</span>
                        <span className="text-xs text-theme-secondary">{formatTime(comment.createdAt)}</span>
                      </div>
                      <div className="text-sm text-theme-primary">{comment.text}</div>
                    </div>
                  ))}
                  {!(commentsByPost[selectedPost.id] || []).length && (
                    <div className="rounded-2xl bg-theme-muted px-4 py-3 text-sm text-theme-secondary">No comments yet. Open the signal with context.</div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedMedia && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4" onClick={() => setSelectedMedia(null)}>
            <button type="button" className="absolute right-6 top-6 text-white" onClick={() => setSelectedMedia(null)}>
              <FaTimes className="text-2xl" />
            </button>
            <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} exit={{ scale: 0.96 }} className="max-h-[90vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
              {selectedMedia.type === 'image' && <img src={resolveMediaUrl(selectedMedia.url)} alt="Expanded post" className="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl" />}
              {selectedMedia.type === 'video' && <video controls autoPlay src={resolveMediaUrl(selectedMedia.url)} className="max-h-[90vh] max-w-[92vw] rounded-2xl shadow-2xl" />}
              {selectedMedia.type === 'audio' && <audio controls autoPlay src={resolveMediaUrl(selectedMedia.url)} className="w-[min(92vw,640px)] rounded-2xl bg-white p-4 shadow-2xl" />}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLive && (
          <SentinelLive
            user={activeUser}
            onStarted={handleLiveStarted}
            onStop={() => {
              setShowLive(false);
            }}
          />
        )}
      </AnimatePresence>

      {sidebarOpen && isMobile && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />}
      <LiloAI position="bottom-right" />
    </div>
  );
};

export default SocialDashboard;
