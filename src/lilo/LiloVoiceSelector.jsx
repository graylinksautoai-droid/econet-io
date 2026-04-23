import React, { useState } from 'react';
import { HiOutlineX, HiOutlineSpeakerWave, HiOutlineCheck } from 'react-icons/hi';

/**
 * LILO Voice Selector - Voice selection UI
 */
export default function LiloVoiceSelector({ 
  currentVoice, 
  onChangeVoice, 
  onClose,
  className = ''
}) {
  const [selectedVoice, setSelectedVoice] = useState(currentVoice);
  const [isTesting, setIsTesting] = useState(false);

  const voices = [
    {
      id: 'african-male',
      name: 'African Male',
      description: 'Warm, friendly African male voice',
      preview: 'Hello, I\'m your environmental assistant.'
    },
    {
      id: 'african-female',
      name: 'African Female',
      description: 'Energetic African female voice',
      preview: 'Hello, I\'m your environmental assistant.'
    },
    {
      id: 'neutral-ai',
      name: 'Neutral AI',
      description: 'Standard AI voice',
      preview: 'Hello, I\'m your environmental assistant.'
    }
  ];

  const handleVoiceSelect = (voiceId) => {
    setSelectedVoice(voiceId);
  };

  const handleConfirm = async () => {
    if (selectedVoice !== currentVoice) {
      setIsTesting(true);
      try {
        await onChangeVoice(selectedVoice);
        setTimeout(() => {
          setIsTesting(false);
          onClose();
        }, 1000);
      } catch (error) {
        setIsTesting(false);
        console.error('Voice change failed:', error);
      }
    } else {
      onClose();
    }
  };

  const handleTestVoice = async (voiceId) => {
    const voice = voices.find(v => v.id === voiceId);
    if (voice) {
      try {
        // Test voice preview
        const utterance = new SpeechSynthesisUtterance(voice.preview);
        const voices = window.speechSynthesis.getVoices();
        
        // Find matching voice
        const selectedVoiceObj = voices.find(v => 
          v.lang.includes('NG') || 
          v.name.toLowerCase().includes('african') ||
          v.name.toLowerCase().includes('nigeria')
        );
        
        if (selectedVoiceObj) {
          utterance.voice = selectedVoiceObj;
        }
        
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.error('Voice test failed:', error);
      }
    }
  };

  return (
    <div className={`
      absolute top-full right-0 mt-2 w-80
      bg-white rounded-lg shadow-xl border border-gray-200
      z-50 overflow-hidden
      ${className}
    `}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-600 to-emerald-600 text-white">
        <div className="flex items-center space-x-2">
          <HiOutlineSpeakerWave className="w-5 h-5" />
          <span className="font-medium">Choose Voice</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/20 rounded-full transition-colors"
        >
          <HiOutlineX className="w-4 h-4" />
        </button>
      </div>

      {/* Voice Options */}
      <div className="p-4 space-y-3">
        {voices.map((voice) => (
          <div
            key={voice.id}
            className={`
              p-3 rounded-lg border-2 cursor-pointer transition-all
              ${selectedVoice === voice.id 
                ? 'border-emerald-500 bg-emerald-50' 
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }
            `}
            onClick={() => handleVoiceSelect(voice.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <div className="font-medium text-gray-900">{voice.name}</div>
                  {selectedVoice === voice.id && (
                    <HiOutlineCheck className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <div className="text-sm text-gray-600 mt-1">{voice.description}</div>
              </div>
              
              {/* Test button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTestVoice(voice.id);
                }}
                className="ml-2 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                Test
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <div className="flex space-x-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isTesting}
            className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isTesting ? 'Testing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
