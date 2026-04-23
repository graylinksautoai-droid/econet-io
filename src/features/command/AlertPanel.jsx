import React, { useState, useEffect } from 'react';
import { FaExclamationTriangle, FaFire, FaWater, FaWind, FaMountain, FaTrash, FaClock, FaMapMarkerAlt, FaSatellite, FaBell, FaFilter, FaRefresh } from 'react-icons/fa';

/**
 * Alert Panel Component - Command Center
 * Shows active threats with severity color coding and real-time updates
 */
const AlertPanel = () => {
  const [alerts, setAlerts] = useState({
    data: [],
    loading: true,
    error: null,
    filters: {
      severity: 'all',
      type: 'all',
      timeframe: '24h'
    }
  });
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  useEffect(() => {
    loadAlerts();
    
    if (autoRefresh) {
      const interval = setInterval(loadAlerts, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, alerts.filters]);

  /**
   * Load alerts from backend
   */
  const loadAlerts = async () => {
    try {
      setAlerts(prev => ({ ...prev, loading: true, error: null }));
      
      const params = new URLSearchParams();
      if (alerts.filters.severity !== 'all') params.append('severity', alerts.filters.severity);
      if (alerts.filters.type !== 'all') params.append('type', alerts.filters.type);
      if (alerts.filters.timeframe !== '24h') params.append('hours', alerts.filters.timeframe.replace('h', ''));
      
      const response = await fetch(`/api/command/alerts?${params}`);
      const data = await response.json();
      
      setAlerts(prev => ({
        ...prev,
        data: data.alerts || [],
        loading: false
      }));
      
    } catch (error) {
      console.error('Failed to load alerts:', error);
      setAlerts(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load alerts'
      }));
    }
  };

  /**
   * Get severity color
   */
  const getSeverityColor = (severity) => {
    const colors = {
      'Critical': 'bg-red-500',
      'High': 'bg-orange-500',
      'Medium': 'bg-yellow-500',
      'Low': 'bg-green-500'
    };
    return colors[severity] || 'bg-gray-500';
  };

  /**
   * Get severity text color
   */
  const getSeverityTextColor = (severity) => {
    const colors = {
      'Critical': 'text-red-400',
      'High': 'text-orange-400',
      'Medium': 'text-yellow-400',
      'Low': 'text-green-400'
    };
    return colors[severity] || 'text-gray-400';
  };

  /**
   * Get disaster icon
   */
  const getDisasterIcon = (type) => {
    const icons = {
      'Fire': <FaFire />,
      'Flood': <FaWater />,
      'Storm': <FaWind />,
      'Landslide': <FaMountain />,
      'Pollution': <FaTrash />
    };
    return icons[type] || <FaSatellite />;
  };

  /**
   * Format time ago
   */
  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const alertTime = new Date(timestamp);
    const diffMs = now - alertTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  /**
   * Handle filter change
   */
  const handleFilterChange = (filterType, value) => {
    setAlerts(prev => ({
      ...prev,
      filters: {
        ...prev.filters,
        [filterType]: value
      }
    }));
  };

  /**
   * Get alert statistics
   */
  const getAlertStats = () => {
    const stats = {
      total: alerts.data.length,
      critical: alerts.data.filter(a => a.severity === 'Critical').length,
      high: alerts.data.filter(a => a.severity === 'High').length,
      medium: alerts.data.filter(a => a.severity === 'Medium').length,
      low: alerts.data.filter(a => a.severity === 'Low').length
    };
    
    return stats;
  };

  const stats = getAlertStats();

  if (alerts.loading && alerts.data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FaSatellite className="text-4xl text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading global alerts...</p>
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
            <FaBell className="mr-2 text-orange-500" />
            Global Alert Center
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={loadAlerts}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
              title="Refresh"
            >
              <FaRefresh className={alerts.loading ? 'animate-spin' : ''} />
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

        {/* Statistics */}
        <div className="grid grid-cols-5 gap-2 text-center">
          <div className="bg-gray-800 rounded p-2">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-gray-400">Total</div>
          </div>
          <div className="bg-red-900/30 rounded p-2 border border-red-500/30">
            <div className="text-2xl font-bold text-red-400">{stats.critical}</div>
            <div className="text-xs text-red-400">Critical</div>
          </div>
          <div className="bg-orange-900/30 rounded p-2 border border-orange-500/30">
            <div className="text-2xl font-bold text-orange-400">{stats.high}</div>
            <div className="text-xs text-orange-400">High</div>
          </div>
          <div className="bg-yellow-900/30 rounded p-2 border border-yellow-500/30">
            <div className="text-2xl font-bold text-yellow-400">{stats.medium}</div>
            <div className="text-xs text-yellow-400">Medium</div>
          </div>
          <div className="bg-green-900/30 rounded p-2 border border-green-500/30">
            <div className="text-2xl font-bold text-green-400">{stats.low}</div>
            <div className="text-xs text-green-400">Low</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center space-x-4">
          <FaFilter className="text-gray-400" />
          
          <select
            value={alerts.filters.severity}
            onChange={(e) => handleFilterChange('severity', e.target.value)}
            className="bg-gray-800 text-gray-300 px-3 py-1 rounded text-sm"
          >
            <option value="all">All Severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            value={alerts.filters.type}
            onChange={(e) => handleFilterChange('type', e.target.value)}
            className="bg-gray-800 text-gray-300 px-3 py-1 rounded text-sm"
          >
            <option value="all">All Types</option>
            <option value="Fire">Fire</option>
            <option value="Flood">Flood</option>
            <option value="Storm">Storm</option>
            <option value="Landslide">Landslide</option>
            <option value="Pollution">Pollution</option>
          </select>

          <select
            value={alerts.filters.timeframe}
            onChange={(e) => handleFilterChange('timeframe', e.target.value)}
            className="bg-gray-800 text-gray-300 px-3 py-1 rounded text-sm"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="72h">Last 3 Days</option>
            <option value="168h">Last Week</option>
          </select>
        </div>
      </div>

      {/* Alerts List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {alerts.error && (
          <div className="bg-red-900/50 border border-red-500/50 rounded-lg p-4 text-red-300">
            <FaExclamationTriangle className="inline mr-2" />
            {alerts.error}
          </div>
        )}

        {alerts.data.length === 0 && !alerts.loading ? (
          <div className="text-center text-gray-400 py-8">
            <FaBell className="text-4xl mx-auto mb-4 opacity-50" />
            <p>No alerts matching current filters</p>
          </div>
        ) : (
          alerts.data.map((alert) => (
            <div
              key={alert.id}
              className={`bg-gray-800 rounded-lg p-4 border-l-4 ${getSeverityColor(alert.severity)} hover:bg-gray-750 cursor-pointer transition-colors`}
              onClick={() => setSelectedAlert(alert)}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center space-x-3">
                  <div className={`text-2xl ${getSeverityTextColor(alert.severity)}`}>
                    {getDisasterIcon(alert.disasterType)}
                  </div>
                  <div>
                    <h3 className="text-white font-semibold">{alert.disasterType}</h3>
                    <p className="text-gray-400 text-sm">{alert.regionName}, {alert.country}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`px-2 py-1 rounded text-xs text-white ${getSeverityColor(alert.severity)}`}>
                    {alert.severity}
                  </div>
                  <div className="text-gray-400 text-xs mt-1 flex items-center">
                    <FaClock className="mr-1" />
                    {formatTimeAgo(alert.timestamp)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
                <div>
                  <span className="text-gray-500">Probability:</span>
                  <span className="ml-2 font-mono">{alert.probability}%</span>
                </div>
                <div>
                  <span className="text-gray-500">Timeframe:</span>
                  <span className="ml-2">{alert.timeframe}</span>
                </div>
                <div>
                  <span className="text-gray-500">Confidence:</span>
                  <span className="ml-2 font-mono">{Math.round(alert.confidence * 100)}%</span>
                </div>
                <div>
                  <span className="text-gray-500">Risk Score:</span>
                  <span className="ml-2 font-mono">{alert.overallRisk}</span>
                </div>
              </div>

              {/* Risk Factors */}
              {alert.factors && alert.factors.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Risk Factors:</div>
                  <div className="flex flex-wrap gap-1">
                    {alert.factors.slice(0, 3).map((factor, index) => (
                      <span
                        key={index}
                        className="bg-gray-700 px-2 py-1 rounded text-xs text-gray-300"
                      >
                        {factor}
                      </span>
                    ))}
                    {alert.factors.length > 3 && (
                      <span className="bg-gray-700 px-2 py-1 rounded text-xs text-gray-300">
                        +{alert.factors.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Environmental Conditions */}
              {alert.satelliteData && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="text-xs text-gray-500 mb-1">Environmental Conditions:</div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Temp:</span>
                      <span className="ml-1">{alert.satelliteData.temperature}°C</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Humidity:</span>
                      <span className="ml-1">{alert.satelliteData.humidity}%</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Air Quality:</span>
                      <span className="ml-1">{alert.satelliteData.airQuality}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Fire Risk:</span>
                      <span className="ml-1">{alert.satelliteData.fireRisk}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Selected Alert Details Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-bold text-white flex items-center">
                  {getDisasterIcon(selectedAlert.disasterType)}
                  <span className="ml-3">{selectedAlert.disasterType} Alert</span>
                </h3>
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-700 rounded p-4">
                  <h4 className="text-white font-semibold mb-2">Alert Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Location:</span>
                      <p className="text-white">{selectedAlert.regionName}, {selectedAlert.country}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Severity:</span>
                      <p className={`inline-block px-2 py-1 rounded text-xs text-white ${getSeverityColor(selectedAlert.severity)}`}>
                        {selectedAlert.severity}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-400">Probability:</span>
                      <p className="text-white font-mono">{selectedAlert.probability}%</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Timeframe:</span>
                      <p className="text-white">{selectedAlert.timeframe}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Confidence:</span>
                      <p className="text-white font-mono">{Math.round(selectedAlert.confidence * 100)}%</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Generated:</span>
                      <p className="text-white">{new Date(selectedAlert.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {selectedAlert.factors && selectedAlert.factors.length > 0 && (
                  <div className="bg-gray-700 rounded p-4">
                    <h4 className="text-white font-semibold mb-2">Risk Factors</h4>
                    <ul className="space-y-1">
                      {selectedAlert.factors.map((factor, index) => (
                        <li key={index} className="text-gray-300 flex items-center">
                          <FaExclamationTriangle className="text-yellow-500 mr-2 text-xs" />
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedAlert.satelliteData && (
                  <div className="bg-gray-700 rounded p-4">
                    <h4 className="text-white font-semibold mb-2">Environmental Conditions</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Temperature:</span>
                        <p className="text-white">{selectedAlert.satelliteData.temperature}°C</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Humidity:</span>
                        <p className="text-white">{selectedAlert.satelliteData.humidity}%</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Precipitation:</span>
                        <p className="text-white">{selectedAlert.satelliteData.precipitation}mm</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Air Quality:</span>
                        <p className="text-white">{selectedAlert.satelliteData.airQuality} AQI</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Vegetation Index:</span>
                        <p className="text-white">{selectedAlert.satelliteData.vegetationIndex}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Fire Risk:</span>
                        <p className="text-white">{selectedAlert.satelliteData.fireRisk}%</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-gray-700 rounded p-4">
                  <h4 className="text-white font-semibold mb-2">Location</h4>
                  <div className="flex items-center text-gray-300">
                    <FaMapMarkerAlt className="mr-2" />
                    <span className="font-mono">
                      {selectedAlert.coordinates.lat.toFixed(4)}, {selectedAlert.coordinates.lon.toFixed(4)}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => window.open(`https://www.google.com/maps?q=${selectedAlert.coordinates.lat},${selectedAlert.coordinates.lon}`, '_blank')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded flex items-center justify-center"
                  >
                    <FaMapMarkerAlt className="mr-2" />
                    View on Map
                  </button>
                  <button
                    onClick={() => setSelectedAlert(null)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertPanel;
