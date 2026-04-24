import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { HiOutlineRefresh, HiOutlineStatusOnline, HiOutlineVideoCamera, HiOutlineX } from 'react-icons/hi';
import { API_ENDPOINTS } from '../services/api';
import { resolveMediaUrl } from '../services/runtimeConfig';

const CAMERA_PROFILES = [
  {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 }
    },
    audio: false
  },
  {
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  },
  {
    video: true,
    audio: false
  }
];

const SentinelLive = ({ user, onStop, onStarted }) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [bitrate, setBitrate] = useState('Auto');
  const [compressionMode, setCompressionMode] = useState('Soul-Motion (AV1)');
  const [pulseActive, setPulseActive] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!navigator.connection) return undefined;

    const updateBitrate = () => {
      const { effectiveType, downlink } = navigator.connection;

      if (effectiveType === '4g' && downlink > 5) {
        setBitrate('1080p (High-Fidelity)');
      } else if (effectiveType === '3g' || downlink > 1) {
        setBitrate('720p (Adaptive)');
      } else {
        setBitrate('480p (Nigeria-Sync Optimized)');
        setCompressionMode('Aggressive (WebP)');
      }
    };

    navigator.connection.addEventListener('change', updateBitrate);
    updateBitrate();
    return () => navigator.connection.removeEventListener('change', updateBitrate);
  }, []);

  useEffect(() => {
    const attachStream = async () => {
      if (!isStreaming || !videoRef.current || !streamRef.current) return;

      try {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      } catch (error) {
        console.error('Video attachment failed:', error);
        setStreamError('Camera started, but the video feed could not be rendered.');
      }
    };

    attachStream();
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const dropPulse = () => {
    if (!navigator.geolocation) {
      onStarted?.({
        sessionId: `live-${Date.now()}`,
        proofOfPresence: false,
        isLive: true,
        location: null
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const payload = {
          sessionId: `live-${Date.now()}`,
          proofOfPresence: true,
          isLive: true,
          location: {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          }
        };

        try {
          await fetch(API_ENDPOINTS.MAP.PULSE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user?._id,
              lat: position.coords.latitude,
              lon: position.coords.longitude
            })
          });
        } catch (error) {
          console.error('Pulse API failed:', error);
        }
        onStarted?.(payload);
      },
      (error) => {
        console.error('Geolocation failed:', error);
        onStarted?.({
          sessionId: `live-${Date.now()}`,
          proofOfPresence: false,
          isLive: true,
          location: null
        });
      }
    );
  };

  const startStream = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStreamError('This device or browser does not support camera capture.');
      return;
    }

    setIsStarting(true);
    setStreamError('');

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    for (const profile of CAMERA_PROFILES) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(profile);
        streamRef.current = stream;
        setIsStreaming(true);
        setPulseActive(true);
        dropPulse();
        setIsStarting(false);
        return;
      } catch (error) {
        console.warn('Camera profile failed:', profile, error);
      }
    }

    setIsStreaming(false);
    setPulseActive(false);
    setIsStarting(false);
    setStreamError('Camera access failed. Check permissions or whether another app is already using the camera.');
  };

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsStreaming(false);
    setPulseActive(false);
    setStreamError('');
    onStop();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black p-0 md:bg-black/80 md:p-4 backdrop-blur-xl"
    >
      <div className="relative h-full w-full overflow-hidden bg-black md:h-auto md:max-w-4xl md:rounded-3xl md:border md:border-white/10 md:bg-gray-900 md:shadow-2xl">
        <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white animate-pulse">
            <HiOutlineStatusOnline /> LIVE
          </div>
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-md">
            {bitrate}
          </div>
        </div>

        <button
          onClick={stopStream}
          className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <HiOutlineX className="text-xl" />
        </button>

        <div className="h-full min-h-screen bg-black md:aspect-video md:min-h-0">
          {isStreaming ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/60 to-transparent" />
              <div className="absolute bottom-24 left-4 right-4 z-10 flex items-end justify-between">
                <div>
                  <div className="text-xl font-black text-white">@{(user?.name || 'sentinel').replace(/\s+/g, '').toLowerCase()}</div>
                  <div className="mt-2 max-w-md text-sm text-white/80">Proof-of-presence live front. Capture the signal, then post directly into command processing.</div>
                </div>
                <div className="hidden rounded-2xl bg-black/35 px-4 py-3 text-right backdrop-blur md:block">
                  <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">Signal Quality</div>
                  <div className="text-lg font-bold text-white">{bitrate}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <HiOutlineVideoCamera className="mx-auto mb-4 text-6xl text-gray-600" />
                <button
                  onClick={startStream}
                  disabled={isStarting}
                  className="rounded-2xl bg-emerald-600 px-8 py-3 font-bold text-white shadow-lg shadow-emerald-900/40 transition-colors hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isStarting ? 'Connecting Camera...' : 'Start Sentinel Live'}
                </button>
                {streamError && <p className="mt-4 max-w-md text-sm text-red-300">{streamError}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-white/10 bg-black/50 p-4 backdrop-blur-md md:relative md:bg-gray-900/50 md:p-6">
          <div className="flex items-center gap-4">
            <img src={resolveMediaUrl(user?.avatar)} className="h-12 w-12 rounded-full border-2 border-emerald-500 object-cover" alt="" />
            <div>
              <h3 className="font-bold text-white">{user?.name || 'Sentinel Observer'}</h3>
              <p className="text-xs text-gray-400">Transcoding: {compressionMode}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-emerald-400">+40% Trust Score</span>
              <span className="text-[10px] text-gray-500">{pulseActive ? 'Proof of Presence Active' : 'Waiting for location pulse'}</span>
            </div>
            {isStreaming && (
              <button
                onClick={startStream}
                className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
                title="Retry camera"
              >
                <HiOutlineRefresh className="text-lg" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default SentinelLive;
