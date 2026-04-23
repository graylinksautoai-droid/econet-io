import React, { useState, useEffect } from 'react';
import { FaLeaf, FaShoppingCart, FaGift, FaTrophy } from 'react-icons/fa';

/**
 * Leaf Counter Component - EcoNet Reward System
 */
const LeafCounter = ({ userLeaves = 0, onRedeem }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [totalLeaves, setTotalLeaves] = useState(userLeaves);

  const rewards = [
    { id: 1, name: 'Eco Warrior Badge', cost: 50, icon: FaTrophy, description: 'Show your environmental commitment' },
    { id: 2, name: 'Tree Planting Credit', cost: 100, icon: FaLeaf, description: 'Plant a real tree through our partners' },
    { id: 3, name: 'Premium Analytics', cost: 200, icon: FaGift, description: 'Advanced environmental insights' },
    { id: 4, name: 'Carbon Offset Certificate', cost: 500, icon: FaShoppingCart, description: 'Official carbon offset documentation' }
  ];

  useEffect(() => {
    // Simulate leaf earning from activities
    const interval = setInterval(() => {
      setTotalLeaves(prev => prev + Math.floor(Math.random() * 3));
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const handleRedeem = (reward) => {
    if (totalLeaves >= reward.cost) {
      setTotalLeaves(prev => prev - reward.cost);
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 1000);
      setShowRedeemModal(false);
      if (onRedeem) onRedeem(reward);
    }
  };

  return (
    <>
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg p-4 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`relative ${isAnimating ? 'animate-bounce' : ''}`}>
              <FaLeaf className="text-2xl" />
              {isAnimating && (
                <div className="absolute -top-2 -right-2 w-4 h-4 bg-yellow-400 rounded-full animate-ping"></div>
              )}
            </div>
            <div>
              <p className="text-sm font-medium opacity-90">Eco Leaves</p>
              <p className="text-2xl font-bold">{totalLeaves.toLocaleString()}</p>
            </div>
          </div>
          
          <button
            onClick={() => setShowRedeemModal(true)}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
          >
            <FaShoppingCart className="text-sm" />
            <span className="text-sm font-medium">Redeem</span>
          </button>
        </div>

        <div className="mt-3 pt-3 border-t border-white/20">
          <div className="flex justify-between text-xs">
            <span className="opacity-75">Next reward in:</span>
            <span className="font-medium">25 leaves</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2 mt-1">
            <div 
              className="bg-white rounded-full h-2 transition-all duration-500"
              style={{ width: `${Math.min((totalLeaves % 50) / 50 * 100, 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Redeem Modal */}
      {showRedeemModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center">
                <FaLeaf className="mr-2 text-green-400" />
                Redeem Rewards
              </h3>
              <button
                onClick={() => setShowRedeemModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-green-300 font-medium">Available Leaves:</span>
                <span className="text-green-300 font-bold text-xl">{totalLeaves.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-3">
              {rewards.map(reward => {
                const Icon = reward.icon;
                const canAfford = totalLeaves >= reward.cost;
                
                return (
                  <div 
                    key={reward.id}
                    className={`border rounded-lg p-3 transition-all ${
                      canAfford 
                        ? 'border-green-500/30 bg-green-500/10 hover:bg-green-500/20 cursor-pointer' 
                        : 'border-gray-700 bg-gray-800/50 opacity-50 cursor-not-allowed'
                    }`}
                    onClick={() => canAfford && handleRedeem(reward)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          canAfford ? 'bg-green-500/20' : 'bg-gray-700'
                        }`}>
                          <Icon className={`text-lg ${canAfford ? 'text-green-400' : 'text-gray-500'}`} />
                        </div>
                        <div>
                          <h4 className="text-white font-medium">{reward.name}</h4>
                          <p className="text-gray-400 text-xs">{reward.description}</p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className={`flex items-center space-x-1 ${
                          canAfford ? 'text-green-400' : 'text-gray-500'
                        }`}>
                          <FaLeaf className="text-sm" />
                          <span className="font-bold">{reward.cost}</span>
                        </div>
                        {canAfford && (
                          <span className="text-xs text-green-400">Available</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LeafCounter;
