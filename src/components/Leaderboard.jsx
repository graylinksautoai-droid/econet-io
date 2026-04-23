import { useState, useEffect } from 'react';
import SentinelBadge from './SentinelBadge';
import { API_ENDPOINTS } from '../services/api';
import { resolveMediaUrl } from '../services/runtimeConfig';

const Leaderboard = ({ limit = 10 }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.USERS.LEADERBOARD);
        if (!res.ok) throw new Error('Failed to load leaderboard');
        const data = await res.json();
        setUsers(data.slice(0, limit));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, [limit]);

  if (loading) return <div className="text-sm text-gray-400">Loading top Sentinels...</div>;
  if (error) return <div className="text-sm text-red-400">{error}</div>;

  return (
    <div className="space-y-3">
      {users.map((user, index) => (
        <div key={user._id} className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500 w-5 text-right">#{index + 1}</span>
          <img src={resolveMediaUrl(user.avatar)} alt={user.name} className="w-8 h-8 rounded-full object-cover border border-gray-300" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium truncate">{user.name}</span>
              {user.verifiedReporter && <SentinelBadge compact />}
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span>Trust: {user.reputation.trustScore}%</span>
              <span>•</span>
              <span>Verified: {user.reputation.verifiedReports}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default Leaderboard;
