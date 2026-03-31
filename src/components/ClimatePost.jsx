import React from 'react';
import { motion } from 'framer-motion';

const ClimatePost = ({ urgency, message, location, timestamp }) => {
  const getStyles = () => {
    switch (urgency) {
      case 'low':
        return {
          backgroundColor: 'rgba(0, 255, 136, 0.05)',
          border: '1px solid rgba(0, 255, 136, 0.2)',
        };
      case 'medium':
        return {
          backgroundColor: 'rgba(255, 191, 0, 0.1)',
          border: '1px solid rgba(255, 191, 0, 0.2)',
        };
      case 'high':
        return {
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
          border: '2px solid rgba(255, 0, 0, 0.7)',
        };
      default:
        return {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        };
    }
  };

  const variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    pulse: {
      scale: [1, 1.05, 1],
      borderColor: ["rgba(255, 0, 0, 0.7)", "rgba(255, 0, 0, 0.3)", "rgba(255, 0, 0, 0.7)"],
      transition: {
        duration: 2,
        repeat: Infinity,
        repeatType: "loop",
      },
    },
  };

  const cardStyles = getStyles();

  return (
    <motion.div
      className="glass-card"
      style={{
        ...cardStyles,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)', // For Safari
        padding: '20px',
        borderRadius: '12px',
        marginBottom: '16px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        overflow: 'hidden',
      }}
      initial="hidden"
      animate={urgency === 'high' ? "pulse" : "visible"}
      variants={variants}
    >
      {urgency === 'high' && (
        <motion.div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: '12px',
            border: `2px solid rgba(255, 0, 0, 0.7)`,
            zIndex: 1,
          }}
          variants={variants}
          animate="pulse"
        />
      )}
      <div style={{ position: 'relative', zIndex: 2 }}>
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs text-gray-400">
            {new Date(timestamp).toLocaleString()}
          </span>
          <span className="text-xs text-gray-400 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 019.9 0v1.35a.75.75 0 001.5 0V4.05a7 7 0 00-11.4 0v1.35a.75.75 0 001.5 0V4.05zM7.902 9.25a.75.75 0 01.095.024L10 10.343l2.003-1.068a.75.75 0 01.996.124c.342.342.47.847.383 1.327l-.78 4.508c-.14.818.482 1.643 1.327 1.728a.75.75 0 010 1.496c-.845-.085-1.467-1.086-1.327-1.904l.78-4.508a.75.75 0 01-.383-1.327l-2.003 1.068a.75.75 0 01-.996-.124c-.342-.342-.47-.847-.383-1.327l.78-4.508a.75.75 0 01.383-.737zM3.75 7.75a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5H3.75z" clipRule="evenodd" />
            </svg>
            {location}
          </span>
        </div>
        <p className="text-sm mb-4">{message}</p>
        <div className="flex justify-end">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-4 py-2 rounded-lg text-white text-xs font-semibold"
            style={{ backgroundColor: 'var(--color-brand-green)' }}
          >
            Verify
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

export default ClimatePost;
