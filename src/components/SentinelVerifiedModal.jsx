import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import PropTypes from 'prop-types';
import SentinelShield from './SentinelShield';

const VERIFICATION_DURATION_MS = 2200;
const SWEEP_DELAY_MS = 400;
const BADGE_APPEAR_MS = 600;

function SentinelVerifiedModal({ isOpen, onClose }) {
  const [verificationProgress, setVerificationProgress] = useState(0);
  const [showSweep, setShowSweep] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const hasFiredConfetti = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    setVerificationProgress(0);
    setShowSweep(false);
    setShowBadge(false);
    setShowMessage(false);
    hasFiredConfetti.current = false;

    const start = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(100, (elapsed / VERIFICATION_DURATION_MS) * 100);
      setVerificationProgress(progress);
      if (progress >= 100) {
        clearInterval(progressInterval);
      }
    }, 50);

    return () => clearInterval(progressInterval);
  }, [isOpen]);

  useEffect(() => {
    if (verificationProgress < 100) return;

    const sweepTimer = setTimeout(() => setShowSweep(true), SWEEP_DELAY_MS);
    const badgeTimer = setTimeout(() => setShowBadge(true), BADGE_APPEAR_MS);
    const messageTimer = setTimeout(() => setShowMessage(true), BADGE_APPEAR_MS + 200);

    if (!hasFiredConfetti.current) {
      hasFiredConfetti.current = true;
      setTimeout(() => {
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.5, x: 0.5 },
          colors: ['#22c55e', '#16a34a', '#ffffff', '#d1fae5'],
        });
        setTimeout(() => {
          confetti({
            particleCount: 60,
            angle: 60,
            spread: 55,
            origin: { x: 0.3, y: 0.6 },
            colors: ['#22c55e', '#ffffff'],
          });
          confetti({
            particleCount: 60,
            angle: 120,
            spread: 55,
            origin: { x: 0.7, y: 0.6 },
            colors: ['#22c55e', '#ffffff'],
          });
        }, 150);
      }, BADGE_APPEAR_MS);
    }

    return () => {
      clearTimeout(sweepTimer);
      clearTimeout(badgeTimer);
      clearTimeout(messageTimer);
    };
  }, [verificationProgress]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      >
        <motion.div
          className="relative flex flex-col items-center justify-center rounded-2xl bg-gray-900/95 border border-emerald-500/30 shadow-2xl p-10 max-w-md mx-4 overflow-hidden"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Green radar sweep - expands from center when verification hits 100% */}
          <AnimatePresence>
            {showSweep && (
              <motion.div
                className="absolute inset-0 pointer-events-none rounded-2xl"
                initial={{ scale: 0, opacity: 0.9 }}
                animate={{ scale: 3.5, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                style={{
                  boxShadow:
                    '0 0 0 3px rgba(34, 197, 94, 0.6), 0 0 80px 40px rgba(34, 197, 94, 0.15)',
                  borderRadius: '1rem',
                }}
              />
            )}
          </AnimatePresence>

          {/* Glowing spinning radar logo */}
          <motion.div
            className="relative z-10 flex items-center justify-center mb-6"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          >
            <div
              className="absolute w-28 h-28 rounded-full opacity-70"
              style={{
                background:
                  'radial-gradient(circle, rgba(34, 197, 94, 0.5) 0%, transparent 70%)',
                boxShadow:
                  '0 0 60px 30px rgba(34, 197, 94, 0.4), 0 0 100px 40px rgba(34, 197, 94, 0.2)',
              }}
            />
            <div
              className="relative"
              style={{ filter: 'drop-shadow(0 0 20px rgba(34, 197, 94, 0.8))' }}
            >
              <SentinelShield size="lg" className="text-emerald-400" />
            </div>
          </motion.div>

          {/* Verification progress */}
          <div className="w-full max-w-xs mb-6">
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-emerald-500 rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: `${verificationProgress}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
            <p className="text-center text-emerald-300/90 text-sm mt-2 font-medium">
              Verifying... {Math.round(verificationProgress)}%
            </p>
          </div>

          {/* Verified badge with haptic-style shake */}
          <AnimatePresence>
            {showBadge && (
              <motion.div
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-500/20 border border-emerald-400/50 mb-4"
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  x: [0, -8, 8, -6, 6, -4, 4, -2, 2, 0],
                }}
                transition={{
                  scale: { duration: 0.3 },
                  opacity: { duration: 0.3 },
                  x: {
                    duration: 0.5,
                    times: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1],
                  },
                }}
              >
                <SentinelShield size="md" />
                <span className="text-emerald-300 font-bold text-lg tracking-wide">
                  Verified
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feedback message */}
          <AnimatePresence>
            {showMessage && (
              <motion.p
                className="text-center text-white/90 text-sm max-w-xs mb-6"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
              >
                Identity Confirmed. Sentinel Data Integrated.
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
          >
            Done
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

SentinelVerifiedModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default SentinelVerifiedModal;
