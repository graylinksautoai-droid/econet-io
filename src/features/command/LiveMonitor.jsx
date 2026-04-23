import React, { useState, useEffect } from 'react';
import { FaVideo, FaUsers, FaExclamationTriangle, FaClock, FaMapMarkerAlt, FaSatellite, FaEye, FaComment, FaShare, FaHeart, FaCoins, FaChartLine, FaGlobe, FaFire, FaWater } from 'react-icons/fa';

/**
 * Live Monitor Component - Command Center
 * Shows active live streams, ongoing reports, and LILO alerts in real-time
 */
const LiveMonitor = () => {
  const [monitorData, setMonitorData] = useState({
    liveStreams: [],
    ongoingReports: [],
    liloAlerts: [],
    userActivity: [],
    loading: true,
    error: null
  });
  const [selectedTab, setSelectedTab] = useState('streams');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(15000); // 15 seconds

  useEffect(() => {
    loadMonitorData();
    
    if (autoRefresh) {
      const interval = setInterval(loadMonitorData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  /**
   * Load monitor data from backend
   */
  const loadMonitorData = async () => {
    try {
      setMonitorData(prev => ({ ...prev, loading: true, error: null }));
      
      const response = await fetch('/api/command/live-monitor');
      const data = await response.json();
      
      setMonitorData({
        liveStreams: data.liveStreams || [],
        ongoingReports: data.ongoingReports || [],
        liloAlerts: data.liloAlerts || [],
        userActivity: data.userActivity || [],
        loading: false,
        error: null
      });
      
    } catch (error) {
      console.error('Failed to load monitor data:', error);
      setMonitorData(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load live data'
      }));
    }
  };

  /**
   * Format duration
   */
  const formatDuration = (startTime) => {
    const now = new Date();
    const start = new Date(startTime);
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'Just started';
    if (diffMins < 60) return `${diffMins}m`;
    return `${diffHours}h ${diffMins % 60}m`;
  };

  /**
   * Format time ago
   */
  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${diffHours}h ago`;
  };

  /**
   * Get activity icon
   */
  const getActivityIcon = (type) => {
    const icons = {
      'live_start': <FaVideo className="text-red-500" />,
      'report_created': <FaExclamationTriangle className="text-orange-500" />,
      'image_analyzed': <FaSatellite className="text-blue-500" />,
      'voice_interaction': <FaComment className="text-green-500" />,
      'share_created': <FaShare className="text-purple-500" />,
      'like_given': <FaHeart className="text-pink-500" />,
      'coins_earned': <FaCoins className="text-yellow-500" />
    };
    return icons[type] || <FaChartLine className="text-gray-500" />;
  };

  /**
   * Get severity color
   */
  const getSeverityColor = (severity) => {
    const colors = {
      'Critical': 'text-red-400 bg-red-900/30 border-red-500/30',
      'High': 'text-orange-400 bg-orange-900/30 border-orange-500/30',
      'Medium': 'text-yellow-400 bg-yellow-900/30 border-yellow-500/30',
      'Low': 'text-green-400 bg-green-900/30 border-green-500/30'
    };
    return colors[severity] || 'text-gray-400 bg-gray-900/30 border-gray-500/30';
  };

  const tabs = [
    { id: 'streams', label: 'Live Streams', icon: FaVideo, count: monitorData.liveStreams.length },
    { id: 'reports', label: 'Reports', icon: FaExclamationTriangle, count: monitorData.ongoingReports.length },
    { id: 'alerts', label: 'LILO Alerts', icon: FaSatellite, count: monitorData.liloAlerts.length },
    { id: 'activity', label: 'Activity', icon: FaChartLine, count: monitorData.userActivity.length }
  ];

  if (monitorData.loading && monitorData.liveStreams.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FaSatellite className="text-4xl text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading live monitor...</p>
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
            <FaEye className="mr-2 text-emerald-500" />
            Live Monitor
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={loadMonitorData}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
              title="Refresh"
            >
              <FaSatellite className={monitorData.loading ? 'animate-spin' : ''} />
            </button>
            <label className="flex items-center text-sm text-gray-300">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="mr-2"
              />
              Auto-refresh
            </label>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedTab === tab.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <tab.icon className="mr-2" />
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  selectedTab === tab.id
                    ? 'bg-emerald-700 text-white'
                    : 'bg-gray-700 text-gray-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {monitorData.error && (
          <div className="bg-red-900/50 border border-red-500/50 rounded-lg p-4 text-red-300 mb-4">
            <FaExclamationTriangle className="inline mr-2" />
            {monitorData.error}
          </div>
        )}

        {/* Live Streams Tab */}
        {selectedTab === 'streams' && (
          <div className="space-y-4">
            {monitorData.liveStreams.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <FaVideo className="text-4xl mx-auto mb-4 opacity-50" />
                <p>No active live streams</p>
              </div>
            ) : (
              monitorData.liveStreams.map(stream => (
                <div key={stream.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <FaVideo className="text-2xl text-red-500" />
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      </div>
                      <div>
                        <h3 className="text-white font-semibold">{stream.title}</h3>
                        <p className="text-gray-400 text-sm">{stream.userName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-red-400 text-sm font-medium">LIVE</div>
                      <div className="text-gray-400 text-xs">{formatDuration(stream.startTime)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 text-sm text-gray-300 mb-3">
                    <div className="flex items-center">
                      <FaUsers className="mr-2 text-gray-500" />
                      <span>{stream.viewers || 0}</span>
                    </div>
                    <div className="flex items-center">
                      <FaHeart className="mr-2 text-gray-500" />
                      <span>{stream.likes || 0}</span>
                    </div>
                    <div className="flex items-center">
                      <FaComment className="mr-2 text-gray-500" />
                      <span>{stream.comments || 0}</span>
                    </div>
                    <div className="flex items-center">
                      <FaCoins className="mr-2 text-gray-500" />
                      <span>{stream.coins || 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-gray-400 text-sm">
                      <FaMapMarkerAlt className="mr-2" />
                      {stream.location || 'Unknown location'}
                    </div>
                    <button
                      onClick={() => window.open(`/live/${stream.id}`, '_blank')}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded text-sm"
                    >
                      Watch Stream
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Reports Tab */}
        {selectedTab === 'reports' && (
          <div className="space-y-4">
            {monitorData.ongoingReports.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <FaExclamationTriangle className="text-4xl mx-auto mb-4 opacity-50" />
                <p>No ongoing reports</p>
              </div>
            ) : (
              monitorData.ongoingReports.map(report => (
                <div key={report.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded ${getSeverityColor(report.severity)}`}>
                        {report.category === 'fire' ? <FaFire /> : <FaWater />}
                      </div>
                      <div>
                        <h3 className="text-white font-semibold capitalize">{report.category}</h3>
                        <p className="text-gray-400 text-sm">{report.userName}</p>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs text-white ${getSeverityColor(report.severity)}`}>
                      {report.severity}
                    </div>
                  </div>

                  <p className="text-gray-300 text-sm mb-3 line-clamp-2">{report.description}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-gray-400 text-sm">
                      <FaMapMarkerAlt className="mr-2" />
                      {report.location || 'Unknown location'}
                    </div>
                    <div className="flex items-center text-gray-400 text-sm">
                      <FaClock className="mr-2" />
                      {formatTimeAgo(report.createdAt)}
                    </div>
                  </div>

                  {report.images && report.images.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="flex items-center text-gray-400 text-sm mb-2">
                        <FaEye className="mr-2" />
                        {report.images.length} image{report.images.length > 1 ? 's' : ''}
                      </div>
                      <div className="flex space-x-2">
                        {report.images.slice(0, 3).map((image, index) => (
                          <img
                            key={index}
                            src={image}
                            alt={`Report image ${index + 1}`}
                            className="w-16 h-16 object-cover rounded"
                          />
                        ))}
                        {report.images.length > 3 && (
                          <div className="w-16 h-16 bg-gray-700 rounded flex items-center justify-center text-gray-400 text-sm">
                            +{report.images.length - 3}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* LILO Alerts Tab */}
        {selectedTab === 'alerts' && (
          <div className="space-y-4">
            {monitorData.liloAlerts.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <FaSatellite className="text-4xl mx-auto mb-4 opacity-50" />
                <p>No LILO alerts</p>
              </div>
            ) : (
              monitorData.liloAlerts.map(alert => (
                <div key={alert.id} className="bg-gray-800 rounded-lg p-4 border-l-4 border-emerald-500">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center space-x-3">
                      <FaSatellite className="text-2xl text-emerald-500" />
                      <div>
                        <h3 className="text-white font-semibold">{alert.type}</h3>
                        <p className="text-gray-400 text-sm">LILO AI Alert</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-emerald-400 text-sm font-medium">AI Generated</div>
                      <div className="text-gray-400 text-xs">{formatTimeAgo(alert.timestamp)}</div>
                    </div>
                  </div>

                  <p className="text-gray-300 text-sm mb-3">{alert.message}</p>

                  {alert.context && (
                    <div className="bg-gray-700 rounded p-3 text-sm text-gray-300">
                      <div className="font-medium text-white mb-2">Context:</div>
                      {Object.entries(alert.context).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-400 capitalize">{key}:</span>
                          <span>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {alert.actions && alert.actions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <div className="text-sm text-gray-400 mb-2">Actions Taken:</div>
                      <div className="flex flex-wrap gap-2">
                        {alert.actions.map((action, index) => (
                          <span
                            key={index}
                            className="bg-emerald-900/30 border border-emerald-500/30 px-2 py-1 rounded text-xs text-emerald-400"
                          >
                            {action}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Activity Tab */}
        {selectedTab === 'activity' && (
          <div className="space-y-2">
            {monitorData.userActivity.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <FaChartLine className="text-4xl mx-auto mb-4 opacity-50" />
                <p>No recent activity</p>
              </div>
            ) : (
              monitorData.userActivity.map((activity, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getActivityIcon(activity.type)}
                    <div>
                      <p className="text-white text-sm">{activity.description}</p>
                      <p className="text-gray-400 text-xs">{activity.userName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-400 text-xs">{formatTimeAgo(activity.timestamp)}</div>
                    {activity.value && (
                      <div className="text-emerald-400 text-xs font-mono">{activity.value}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-4 border-t border-gray-800">
        <div className="grid grid-cols-4 gap-4 text-center text-sm">
          <div>
            <div className="text-2xl font-bold text-red-400">{monitorData.liveStreams.length}</div>
            <div className="text-gray-400">Live Streams</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-400">{monitorData.ongoingReports.length}</div>
            <div className="text-gray-400">Active Reports</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-400">{monitorData.liloAlerts.length}</div>
            <div className="text-gray-400">LILO Alerts</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">{monitorData.userActivity.length}</div>
            <div className="text-gray-400">Activities</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveMonitor;
