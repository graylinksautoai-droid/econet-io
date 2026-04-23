import React, { useState, useEffect } from 'react';
import { FaGlobe, FaCoins, FaUsers, FaChartLine, FaFire, FaWater, FaExclamationTriangle, FaMapMarkerAlt, FaSatellite, FaTrendingUp, FaTrendingDown, FaMinus } from 'react-icons/fa';

/**
 * Region Stats Component - Command Center
 * Shows EcoCoin activity, user engagement, and risk levels by region
 */
const RegionStats = () => {
  const [regionStats, setRegionStats] = useState({
    regions: [],
    globalStats: {
      totalUsers: 0,
      totalCoins: 0,
      totalReports: 0,
      totalAlerts: 0,
      activeRegions: 0
    },
    loading: true,
    error: null,
    timeRange: '24h'
  });
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [sortField, setSortField] = useState('riskLevel');
  const [sortDirection, setSortDirection] = useState('desc');

  useEffect(() => {
    loadRegionStats();
    
    const interval = setInterval(loadRegionStats, 60000); // 1 minute
    return () => clearInterval(interval);
  }, [regionStats.timeRange]);

  /**
   * Load region statistics from backend
   */
  const loadRegionStats = async () => {
    try {
      setRegionStats(prev => ({ ...prev, loading: true, error: null }));
      
      const response = await fetch(`/api/command/region-stats?timeRange=${regionStats.timeRange}`);
      const data = await response.json();
      
      setRegionStats({
        regions: data.regions || [],
        globalStats: data.globalStats || {},
        loading: false,
        error: null
      });
      
    } catch (error) {
      console.error('Failed to load region stats:', error);
      setRegionStats(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load region statistics'
      }));
    }
  };

  /**
   * Sort regions
   */
  const sortRegions = (regions) => {
    return [...regions].sort((a, b) => {
      let aValue = a[sortField];
      let bValue = b[sortField];
      
      // Handle string comparison
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  };

  /**
   * Handle sort change
   */
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  /**
   * Get sort icon
   */
  const getSortIcon = (field) => {
    if (sortField !== field) return <FaMinus className="text-gray-500" />;
    return sortDirection === 'asc' ? <FaTrendingUp className="text-emerald-400" /> : <FaTrendingDown className="text-red-400" />;
  };

  /**
   * Get risk level color
   */
  const getRiskColor = (riskLevel) => {
    const colors = {
      'critical': 'bg-red-500',
      'high': 'bg-orange-500',
      'medium': 'bg-yellow-500',
      'low': 'bg-green-500',
      'minimal': 'bg-blue-500'
    };
    return colors[riskLevel] || 'bg-gray-500';
  };

  /**
   * Get risk level text color
   */
  const getRiskTextColor = (riskLevel) => {
    const colors = {
      'critical': 'text-red-400',
      'high': 'text-orange-400',
      'medium': 'text-yellow-400',
      'low': 'text-green-400',
      'minimal': 'text-blue-400'
    };
    return colors[riskLevel] || 'text-gray-400';
  };

  /**
   * Format number
   */
  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  /**
   * Get engagement level
   */
  const getEngagementLevel = (score) => {
    if (score >= 80) return { level: 'Expert', color: 'text-purple-400' };
    if (score >= 60) return { level: 'Active', color: 'text-blue-400' };
    if (score >= 40) return { level: 'Moderate', color: 'text-yellow-400' };
    return { level: 'Low', color: 'text-gray-400' };
  };

  const sortedRegions = sortRegions(regionStats.regions);

  if (regionStats.loading && regionStats.regions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FaChartLine className="text-4xl text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading region statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white flex items-center">
            <FaGlobe className="mr-2 text-emerald-500" />
            Regional Statistics
          </h2>
          <select
            value={regionStats.timeRange}
            onChange={(e) => setRegionStats(prev => ({ ...prev, timeRange: e.target.value }))}
            className="bg-gray-800 text-gray-300 px-3 py-1 rounded text-sm"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>

        {/* Global Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-white">{formatNumber(regionStats.globalStats.totalUsers)}</div>
            <div className="text-xs text-gray-400">Total Users</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-yellow-400">{formatNumber(regionStats.globalStats.totalCoins)}</div>
            <div className="text-xs text-gray-400">EcoCoins Earned</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-orange-400">{formatNumber(regionStats.globalStats.totalReports)}</div>
            <div className="text-xs text-gray-400">Reports Created</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-400">{formatNumber(regionStats.globalStats.totalAlerts)}</div>
            <div className="text-xs text-gray-400">LILO Alerts</div>
          </div>
        </div>
      </div>

      {/* Region Table */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {regionStats.error && (
          <div className="bg-red-900/50 border border-red-500/50 rounded-lg p-4 text-red-300 m-4">
            <FaExclamationTriangle className="inline mr-2" />
            {regionStats.error}
          </div>
        )}

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center hover:text-white"
                  >
                    Region
                    {getSortIcon('name')}
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-gray-400 font-medium">
                  <button
                    onClick={() => handleSort('riskLevel')}
                    className="flex items-center justify-center hover:text-white"
                  >
                    Risk Level
                    {getSortIcon('riskLevel')}
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-gray-400 font-medium">
                  <button
                    onClick={() => handleSort('activeUsers')}
                    className="flex items-center justify-center hover:text-white"
                  >
                    Active Users
                    {getSortIcon('activeUsers')}
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-gray-400 font-medium">
                  <button
                    onClick={() => handleSort('coinsEarned')}
                    className="flex items-center justify-center hover:text-white"
                  >
                    EcoCoins
                    {getSortIcon('coinsEarned')}
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-gray-400 font-medium">
                  <button
                    onClick={() => handleSort('reportsCreated')}
                    className="flex items-center justify-center hover:text-white"
                  >
                    Reports
                    {getSortIcon('reportsCreated')}
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-gray-400 font-medium">
                  <button
                    onClick={() => handleSort('engagementScore')}
                    className="flex items-center justify-center hover:text-white"
                  >
                    Engagement
                    {getSortIcon('engagementScore')}
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-gray-400 font-medium">
                  <button
                    onClick={() => handleSort('liloAlerts')}
                    className="flex items-center justify-center hover:text-white"
                  >
                    LILO Alerts
                    {getSortIcon('liloAlerts')}
                  </button>
                </th>
                <th className="px-4 py-3 text-center text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRegions.map((region) => {
                const engagement = getEngagementLevel(region.engagementScore);
                return (
                  <tr key={region.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-white font-medium">{region.name}</div>
                        <div className="text-gray-400 text-xs">{region.country}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className={`inline-block px-2 py-1 rounded text-xs text-white ${getRiskColor(region.riskLevel)}`}>
                        {region.riskLevel.toUpperCase()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center">
                        <FaUsers className="text-gray-500 mr-2" />
                        <span className="text-white">{formatNumber(region.activeUsers)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center">
                        <FaCoins className="text-yellow-500 mr-2" />
                        <span className="text-yellow-400 font-mono">{formatNumber(region.coinsEarned)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center">
                        <FaExclamationTriangle className="text-orange-500 mr-2" />
                        <span className="text-orange-400">{formatNumber(region.reportsCreated)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center">
                        <span className={`font-medium ${engagement.color}`}>{engagement.level}</span>
                        <span className="text-gray-400 text-xs">{region.engagementScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center">
                        <FaSatellite className="text-emerald-500 mr-2" />
                        <span className="text-emerald-400">{region.liloAlerts}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedRegion(region)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-xs"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {regionStats.regions.length === 0 && !regionStats.loading && !regionStats.error && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-gray-400">
              <FaGlobe className="text-4xl mx-auto mb-4 opacity-50" />
              <p>No region data available</p>
            </div>
          </div>
        )}
      </div>

      {/* Region Details Modal */}
      {selectedRegion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">{selectedRegion.name}</h3>
                  <p className="text-gray-400">{selectedRegion.country}</p>
                </div>
                <button
                  onClick={() => setSelectedRegion(null)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-700 rounded-lg p-4 text-center">
                  <div className={`inline-block px-3 py-1 rounded text-sm text-white mb-2 ${getRiskColor(selectedRegion.riskLevel)}`}>
                    {selectedRegion.riskLevel.toUpperCase()}
                  </div>
                  <div className="text-gray-400 text-xs">Risk Level</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-white">{formatNumber(selectedRegion.activeUsers)}</div>
                  <div className="text-gray-400 text-xs">Active Users</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{formatNumber(selectedRegion.coinsEarned)}</div>
                  <div className="text-gray-400 text-xs">EcoCoins Earned</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-orange-400">{formatNumber(selectedRegion.reportsCreated)}</div>
                  <div className="text-gray-400 text-xs">Reports Created</div>
                </div>
              </div>

              {/* Detailed Stats */}
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-4">User Activity</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Engagement Score:</span>
                      <span className={`font-medium ${getEngagementLevel(selectedRegion.engagementScore).color}`}>
                        {selectedRegion.engagementScore}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">New Users (24h):</span>
                      <span className="text-white">{selectedRegion.newUsers || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Active Sessions:</span>
                      <span className="text-white">{selectedRegion.activeSessions || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg. Session Time:</span>
                      <span className="text-white">{selectedRegion.avgSessionTime || '0m'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-700 rounded-lg p-4">
                  <h4 className="text-white font-semibold mb-4">Environmental Activity</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Reports Created:</span>
                      <span className="text-orange-400">{selectedRegion.reportsCreated}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Live Streams:</span>
                      <span className="text-red-400">{selectedRegion.liveStreams || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Image Analyses:</span>
                      <span className="text-blue-400">{selectedRegion.imageAnalyses || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">LILO Alerts:</span>
                      <span className="text-emerald-400">{selectedRegion.liloAlerts}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location Info */}
              <div className="bg-gray-700 rounded-lg p-4 mt-6">
                <h4 className="text-white font-semibold mb-3">Location Information</h4>
                <div className="flex items-center text-gray-300">
                  <FaMapMarkerAlt className="mr-3" />
                  <span className="font-mono">
                    {selectedRegion.coordinates?.lat.toFixed(4)}, {selectedRegion.coordinates?.lon.toFixed(4)}
                  </span>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => window.open(`/command/region/${selectedRegion.id}`, '_blank')}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
                >
                  View Detailed Dashboard
                </button>
                <button
                  onClick={() => setSelectedRegion(null)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionStats;
