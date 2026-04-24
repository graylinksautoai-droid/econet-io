import React, { useState, useEffect } from 'react';
import { FaMap, FaSatellite, FaChartLine, FaBell, FaExclamationTriangle, FaRoute, FaUsers, FaDatabase, FaShieldAlt, FaClock, FaMapMarkerAlt, FaFilter, FaDownload, FaUpload, FaCog, FaExpand, FaCompress, FaEye, FaBroadcastTower, FaNetworkWired, FaClipboardList, FaChartBar, FaGlobe } from 'react-icons/fa';
import MapView from './MapView';
import { useTheme } from '../context/ThemeContext';

/**
 * Enterprise Command Center - Professional API for NGOs/Government Agencies
 * Features: Map view, tracking, prediction, routing, and comprehensive monitoring
 */
const CommandCenter = ({ reports = [], user }) => {
  // Theme
  const { theme, isDark, isLight } = useTheme();
  
  // State Management
  const [viewMode, setViewMode] = useState('map'); // 'map', 'analytics', 'tracking', 'routing'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [pinnedSituations, setPinnedSituations] = useState([]);
  const [trackingData, setTrackingData] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [filters, setFilters] = useState({
    urgency: 'all',
    type: 'all',
    timeRange: '24h',
    status: 'active',
    region: 'all',
    state: 'all'
  });
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showMobilePredictions, setShowMobilePredictions] = useState(false);

  // Initialize pinned situations with simulated data if no reports
  useEffect(() => {
    // Create simulated reports with valid coordinates if no real reports exist
    const simulatedReports = reports.length > 0 ? reports : [
      {
        id: 'sim-1',
        type: 'flood_warning',
        urgency: 'critical',
        description: 'Flash flood warning in Abuja central',
        location: { lat: 9.0579, lng: 7.4951, address: 'Abuja Central, Nigeria' },
        timestamp: new Date(),
        images: []
      },
      {
        id: 'sim-2', 
        type: 'air_pollution',
        urgency: 'high',
        description: 'High air pollution levels detected',
        location: { lat: 9.0833, lng: 7.5333, address: 'Maitama, Abuja' },
        timestamp: new Date(),
        images: []
      },
      {
        id: 'sim-3',
        type: 'deforestation',
        urgency: 'medium',
        description: 'Illegal deforestation activity reported',
        location: { lat: 9.0167, lng: 7.4833, address: 'Asokoro, Abuja' },
        timestamp: new Date(),
        images: []
      },
      {
        id: 'sim-4',
        type: 'water_contamination',
        urgency: 'critical',
        description: 'Water contamination emergency',
        location: { lat: 9.1000, lng: 7.4500, address: 'Wuse, Abuja' },
        timestamp: new Date(),
        images: []
      },
      {
        id: 'sim-5',
        type: 'fire_hazard',
        urgency: 'high',
        description: 'Wildfire risk elevated',
        location: { lat: 9.0500, lng: 7.5200, address: 'Garki, Abuja' },
        timestamp: new Date(),
        images: []
      }
    ];

    const criticalReports = simulatedReports.filter(r => r.urgency === 'critical').slice(0, 5);
    setPinnedSituations(criticalReports.map(report => ({
      ...report,
      pinned: true,
      lastUpdate: new Date(),
      status: 'active',
      glowColor: getUrgencyColor(report.urgency)
    })));
  }, [reports]);

  // Generate tracking data with simulated reports
  useEffect(() => {
    const reportsWithLocation = reports.length > 0 ? reports : [
      {
        id: 'sim-1',
        location: { lat: 9.0579, lng: 7.4951 }
      },
      {
        id: 'sim-2',
        location: { lat: 9.0833, lng: 7.5333 }
      },
      {
        id: 'sim-3',
        location: { lat: 9.0167, lng: 7.4833 }
      }
    ];
    
    const mockTracking = reportsWithLocation.map(report => ({
      id: report.id,
      location: report.location,
      trajectory: generateTrajectory(report.location),
      speed: Math.random() * 50 + 10,
      altitude: Math.random() * 1000 + 100,
      lastUpdate: new Date()
    }));
    setTrackingData(mockTracking);
  }, [reports]);

  // Generate predictions
  useEffect(() => {
    const mockPredictions = [
      {
        id: 1,
        type: 'flood_risk',
        location: { lat: 9.0579, lng: 7.4951 },
        probability: 0.85,
        timeWindow: '2-4 hours',
        affected: '12,000 people',
        severity: 'high'
      },
      {
        id: 2,
        type: 'air_quality',
        location: { lat: 9.0833, lng: 7.5333 },
        probability: 0.92,
        timeWindow: '6-8 hours',
        affected: '8,500 people',
        severity: 'medium'
      },
      {
        id: 3,
        type: 'temperature_anomaly',
        location: { lat: 9.0167, lng: 7.4833 },
        probability: 0.78,
        timeWindow: '12-24 hours',
        affected: '5,200 people',
        severity: 'low'
      }
    ];
    setPredictions(mockPredictions);
  }, []);

  // Helper functions
  const getUrgencyColor = (urgency) => {
    switch (urgency) {
      case 'critical': return 'bg-red-600';
      case 'high': return 'bg-orange-600';
      case 'medium': return 'bg-yellow-600';
      case 'low': return 'bg-green-600';
      default: return 'bg-gray-600';
    }
  };

  const generateTrajectory = (location) => {
    const points = [];
    for (let i = 0; i < 5; i++) {
      points.push({
        lat: location.lat + (Math.random() - 0.5) * 0.1,
        lng: location.lng + (Math.random() - 0.5) * 0.1,
        timestamp: new Date(Date.now() + i * 3600000)
      });
    }
    return points;
  };

  const handleIncidentSelect = (incident) => {
    setSelectedIncident(incident);
  };

  const handlePinSituation = (incident) => {
    setPinnedSituations(prev => 
      prev.some(s => s.id === incident.id)
        ? prev.filter(s => s.id !== incident.id)
        : [...prev, { ...incident, pinned: true, glowColor: getUrgencyColor(incident.urgency) }]
    );
  };

  const handleRouteIncident = (incident) => {
    // Route incident to appropriate agency
    console.log('Routing incident:', incident);
  };

  const handleExportData = () => {
    const data = {
      incidents: reports,
      tracking: trackingData,
      predictions: predictions,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `econet-command-center-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900 text-white' : isLight ? 'bg-gray-100 text-gray-900' : 'bg-green-900 text-white'} ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Command Header */}
      <header className={`${isDark ? 'bg-gray-800 border-gray-700' : isLight ? 'bg-white border-gray-200' : 'bg-green-800 border-green-700'} border-b`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <FaShieldAlt className="w-6 h-6 text-green-500" />
                <h1 className="text-xl font-bold">EcoNet Command Center</h1>
              </div>
              
              {/* View Mode Tabs */}
              <div className={`flex space-x-1 ${isDark ? 'bg-gray-700' : isLight ? 'bg-gray-200' : 'bg-green-700'} rounded-lg p-1`}>
                <button
                  onClick={() => setViewMode('map')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'map' 
                      ? `${isDark ? 'bg-gray-600 text-white' : isLight ? 'bg-white text-gray-900' : 'bg-green-600 text-white'}` 
                      : `${isDark ? 'text-gray-300 hover:text-white' : isLight ? 'text-gray-600 hover:text-gray-900' : 'text-gray-300 hover:text-white'}`
                  }`}
                >
                  <FaMap className="inline mr-2" />
                  Map
                </button>
                <button
                  onClick={() => setViewMode('analytics')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'analytics' 
                      ? `${isDark ? 'bg-gray-600 text-white' : isLight ? 'bg-white text-gray-900' : 'bg-green-600 text-white'}` 
                      : `${isDark ? 'text-gray-300 hover:text-white' : isLight ? 'text-gray-600 hover:text-gray-900' : 'text-gray-300 hover:text-white'}`
                  }`}
                >
                  <FaChartLine className="inline mr-2" />
                  Analytics
                </button>
                <button
                  onClick={() => setViewMode('tracking')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'tracking' 
                      ? `${isDark ? 'bg-gray-600 text-white' : isLight ? 'bg-white text-gray-900' : 'bg-green-600 text-white'}` 
                      : `${isDark ? 'text-gray-300 hover:text-white' : isLight ? 'text-gray-600 hover:text-gray-900' : 'text-gray-300 hover:text-white'}`
                  }`}
                >
                  <FaRoute className="inline mr-2" />
                  Tracking
                </button>
                <button
                  onClick={() => setViewMode('routing')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === 'routing' 
                      ? `${isDark ? 'bg-gray-600 text-white' : isLight ? 'bg-white text-gray-900' : 'bg-green-600 text-white'}` 
                      : `${isDark ? 'text-gray-300 hover:text-white' : isLight ? 'text-gray-600 hover:text-gray-900' : 'text-gray-300 hover:text-white'}`
                  }`}
                >
                  <FaNetworkWired className="inline mr-2" />
                  Routing
                </button>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <FaCompress className="w-4 h-4" /> : <FaExpand className="w-4 h-4" />}
              </button>
              <button
                onClick={handleExportData}
                className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
                title="Export Data"
              >
                <FaDownload className="w-4 h-4" />
              </button>
              <button className="p-2 rounded-lg hover:bg-gray-700 transition-colors" title="Settings">
                <FaCog className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Pinned Situations Bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <FaExclamationTriangle className="w-5 h-5 text-yellow-500" />
            <span className="font-medium">Pinned Situations</span>
          </div>
          <div className="flex space-x-2 overflow-x-auto">
            {pinnedSituations.map(situation => (
              <div
                key={situation.id}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg border ${situation.glowColor} bg-opacity-20 border-opacity-50 cursor-pointer hover:bg-opacity-30 transition-all`}
                onClick={() => handleIncidentSelect(situation)}
              >
                <div className={`w-2 h-2 rounded-full ${situation.glowColor} animate-pulse`}></div>
                <span className="text-sm font-medium">{situation.type || 'Incident'}</span>
                <span className="text-xs text-gray-400">
                  {new Date(situation.lastUpdate).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-700 bg-gray-900 px-4 py-3 lg:hidden">
        <button
          onClick={() => setShowMobileFilters((prev) => !prev)}
          className="rounded-full bg-gray-800 px-4 py-2 text-sm font-semibold text-white"
        >
          Filters
        </button>
        <button
          onClick={() => setShowMobilePredictions((prev) => !prev)}
          className="rounded-full bg-gray-800 px-4 py-2 text-sm font-semibold text-white"
        >
          Predictions
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex h-[calc(100vh-120px)]">
        {/* Left Sidebar - Filters & Tools */}
        <aside className={`${showMobileFilters ? 'block' : 'hidden'} lg:block w-full lg:w-80 ${isDark ? 'bg-gray-800 border-gray-700' : isLight ? 'bg-white border-gray-200' : 'bg-green-800 border-green-700'} border-r p-4 overflow-y-auto`}>
          {/* Filters */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <FaFilter className="inline mr-2" />
              Filters
            </h3>
            <div className="space-y-3">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : isLight ? 'text-gray-700' : 'text-gray-300'}`}>Type</label>
                <select 
                  value={filters.type}
                  onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                  className={`w-full px-3 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-green-700 border-green-600 text-white'} border rounded-lg`}
                >
                  <option value="all">All Types</option>
                  <option value="flood_warning">Flood Warning</option>
                  <option value="fire">Fire</option>
                  <option value="pollution">Pollution</option>
                  <option value="earthquake">Earthquake</option>
                </select>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : isLight ? 'text-gray-700' : 'text-gray-300'}`}>Urgency</label>
                <select 
                  value={filters.urgency}
                  onChange={(e) => setFilters(prev => ({ ...prev, urgency: e.target.value }))}
                  className={`w-full px-3 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-green-700 border-green-600 text-white'} border rounded-lg`}
                >
                  <option value="all">All</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : isLight ? 'text-gray-700' : 'text-gray-300'}`}>Time Range</label>
                <select 
                  value={filters.timeRange}
                  onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value }))}
                  className={`w-full px-3 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-green-700 border-green-600 text-white'} border rounded-lg`}
                >
                  <option value="1h">Last Hour</option>
                  <option value="24h">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                </select>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : isLight ? 'text-gray-700' : 'text-gray-300'}`}>Region</label>
                <select 
                  value={filters.region}
                  onChange={(e) => setFilters(prev => ({ ...prev, region: e.target.value }))}
                  className={`w-full px-3 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-green-700 border-green-600 text-white'} border rounded-lg`}
                >
                  <option value="all">All Regions</option>
                  <option value="north">North</option>
                  <option value="south">South</option>
                  <option value="east">East</option>
                  <option value="west">West</option>
                  <option value="central">Central</option>
                </select>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : isLight ? 'text-gray-700' : 'text-gray-300'}`}>State</label>
                <select 
                  value={filters.state}
                  onChange={(e) => setFilters(prev => ({ ...prev, state: e.target.value }))}
                  className={`w-full px-3 py-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : isLight ? 'bg-white border-gray-300 text-gray-900' : 'bg-green-700 border-green-600 text-white'} border rounded-lg`}
                >
                  <option value="all">All States</option>
                  <option value="abuja">Abuja</option>
                  <option value="lagos">Lagos</option>
                  <option value="kano">Kano</option>
                  <option value="rivers">Rivers</option>
                  <option value="delta">Delta</option>
                </select>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="mb-6">
            <h3 className={`text-lg font-semibold mb-4 flex items-center ${isDark ? 'text-gray-100' : isLight ? 'text-gray-800' : 'text-gray-100'}`}>
              <FaChartBar className="inline mr-2" />
              Statistics
            </h3>
            <div className="space-y-2">
              <div className={`flex justify-between items-center p-2 ${isDark ? 'bg-gray-700' : isLight ? 'bg-gray-100' : 'bg-green-700'} rounded`}>
                <span className={isDark ? 'text-gray-300' : isLight ? 'text-gray-600' : 'text-gray-300'}>Active Incidents</span>
                <span className="text-green-400 font-bold">{reports.length}</span>
              </div>
              <div className={`flex justify-between items-center p-2 ${isDark ? 'bg-gray-700' : isLight ? 'bg-gray-100' : 'bg-green-700'} rounded`}>
                <span className={isDark ? 'text-gray-300' : isLight ? 'text-gray-600' : 'text-gray-300'}>Critical Urgency</span>
                <span className="text-red-400 font-bold">{reports.filter(r => r.urgency === 'critical').length}</span>
              </div>
              <div className={`flex justify-between items-center p-2 ${isDark ? 'bg-gray-700' : isLight ? 'bg-gray-100' : 'bg-green-700'} rounded`}>
                <span className={isDark ? 'text-gray-300' : isLight ? 'text-gray-600' : 'text-gray-300'}>Pinned Situations</span>
                <span className="text-yellow-400 font-bold">{pinnedSituations.length}</span>
              </div>
            </div>
          </div>

          {/* API Access */}
          <div>
            <h3 className={`text-lg font-semibold mb-4 flex items-center ${isDark ? 'text-gray-100' : isLight ? 'text-gray-800' : 'text-gray-100'}`}>
              <FaNetworkWired className="inline mr-2" />
              API Access
            </h3>
            <div className="space-y-2">
              <button className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors text-white">
                <FaDownload className="inline mr-2" />
                Export Data
              </button>
              <button className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors text-white">
                <FaUpload className="inline mr-2" />
                Import Data
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 min-w-0 ${isDark ? 'bg-gray-900' : isLight ? 'bg-gray-50' : 'bg-green-900'} ${showMobileFilters || showMobilePredictions ? 'hidden lg:block' : 'block'}`}>
          {viewMode === 'map' && (
            <div className="h-full min-h-0 relative">
              <MapView 
                activeIncident={selectedIncident} 
                reports={reports.length > 0 ? reports : [
                  {
                    id: 'sim-1',
                    type: 'flood_warning',
                    urgency: 'critical',
                    description: 'Flash flood warning in Abuja central',
                    location: { lat: 9.0579, lng: 7.4951, address: 'Abuja Central, Nigeria' },
                    timestamp: new Date(),
                    images: []
                  },
                  {
                    id: 'sim-2', 
                    type: 'air_pollution',
                    urgency: 'high',
                    description: 'High air pollution levels detected',
                    location: { lat: 9.0833, lng: 7.5333, address: 'Maitama, Abuja' },
                    timestamp: new Date(),
                    images: []
                  },
                  {
                    id: 'sim-3',
                    type: 'deforestation',
                    urgency: 'medium',
                    description: 'Illegal deforestation activity reported',
                    location: { lat: 9.0167, lng: 7.4833, address: 'Asokoro, Abuja' },
                    timestamp: new Date(),
                    images: []
                  },
                  {
                    id: 'sim-4',
                    type: 'water_contamination',
                    urgency: 'critical',
                    description: 'Water contamination emergency',
                    location: { lat: 9.1000, lng: 7.4500, address: 'Wuse, Abuja' },
                    timestamp: new Date(),
                    images: []
                  },
                  {
                    id: 'sim-5',
                    type: 'fire_hazard',
                    urgency: 'high',
                    description: 'Wildfire risk elevated',
                    location: { lat: 9.0500, lng: 7.5200, address: 'Garki, Abuja' },
                    timestamp: new Date(),
                    images: []
                  }
                ]} 
              />
              
              {/* Map Overlay Controls */}
              <div className="absolute top-4 right-4 space-y-2">
                <button className="p-3 bg-gray-800 rounded-lg shadow-lg hover:bg-gray-700 transition-colors">
                  <FaEye className="w-4 h-4" />
                </button>
                <button className="p-3 bg-gray-800 rounded-lg shadow-lg hover:bg-gray-700 transition-colors">
                  <FaBroadcastTower className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {viewMode === 'analytics' && (
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6">Analytics Dashboard</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-gray-800 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">Incident Trends</h3>
                  <div className="h-48 bg-gray-700 rounded flex items-center justify-center">
                    <FaChartLine className="w-12 h-12 text-gray-500" />
                  </div>
                </div>
                <div className="bg-gray-800 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">Response Times</h3>
                  <div className="h-48 bg-gray-700 rounded flex items-center justify-center">
                    <FaClock className="w-12 h-12 text-gray-500" />
                  </div>
                </div>
                <div className="bg-gray-800 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">Resource Allocation</h3>
                  <div className="h-48 bg-gray-700 rounded flex items-center justify-center">
                    <FaUsers className="w-12 h-12 text-gray-500" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'tracking' && (
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6">Real-Time Tracking</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {trackingData.map(track => (
                  <div key={track.id} className="bg-gray-800 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold">Tracker #{track.id}</h3>
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Speed:</span>
                        <span>{track.speed.toFixed(1)} km/h</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Altitude:</span>
                        <span>{track.altitude.toFixed(0)} m</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Location:</span>
                        <span>{track.location.lat.toFixed(4)}, {track.location.lng.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'routing' && (
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-6">Incident Routing</h2>
              <div className="space-y-4">
                {reports.filter(r => r.urgency === 'critical').map(incident => (
                  <div key={incident.id} className="bg-gray-800 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${getUrgencyColor(incident.urgency)} animate-pulse`}></div>
                        <h3 className="font-semibold">{incident.type || 'Critical Incident'}</h3>
                      </div>
                      <button
                        onClick={() => handleRouteIncident(incident)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                      >
                        <FaRoute className="inline mr-2" />
                        Route
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Location:</span>
                        <p>{incident.location?.address || 'Unknown'}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Priority:</span>
                        <p className="text-yellow-500">{incident.urgency?.toUpperCase()}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Assigned:</span>
                        <p>Not assigned</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar - Predictions */}
        <aside className={`${showMobilePredictions ? 'block' : 'hidden'} lg:block w-full lg:w-80 ${isDark ? 'bg-gray-800 border-gray-700' : isLight ? 'bg-white border-gray-200' : 'bg-green-800 border-green-700'} border-l p-4 overflow-y-auto`}>
          <h3 className={`text-lg font-semibold mb-4 flex items-center ${isDark ? 'text-gray-100' : isLight ? 'text-gray-800' : 'text-gray-100'}`}>
            <FaGlobe className="inline mr-2" />
            Predictions
          </h3>
          <div className="space-y-4">
            {predictions.map(prediction => (
              <div key={prediction.id} className={`${isDark ? 'bg-gray-700' : isLight ? 'bg-gray-100' : 'bg-green-700'} p-4 rounded-lg`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium capitalize">{prediction.type.replace('_', ' ')}</h4>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    prediction.severity === 'high' ? 'bg-red-600' :
                    prediction.severity === 'medium' ? 'bg-yellow-600' : 'bg-green-600'
                  }`}>
                    {prediction.severity}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Probability:</span>
                    <span>{(prediction.probability * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Time Window:</span>
                    <span>{prediction.timeWindow}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Affected:</span>
                    <span>{prediction.affected}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default CommandCenter;
