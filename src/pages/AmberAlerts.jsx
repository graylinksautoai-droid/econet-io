import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import AlertRoutingService from '../services/AlertRoutingService';
import { FaExclamationTriangle, FaMapMarkerAlt, FaPhone, FaClock, FaShareAlt, FaBell, FaEye, FaRoute, FaShieldAlt, FaBuilding, FaUsers, FaAmbulance, FaFire, FaHospital } from 'react-icons/fa';

function AmberAlerts({ user, onLogout, onNavigate }) {
  const [alerts, setAlerts] = useState([]);
  const [activeAlert, setActiveAlert] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [alertRadius, setAlertRadius] = useState(5); // km
  const [notifications, setNotifications] = useState(true);
  const [routingService] = useState(new AlertRoutingService());
  const [routingAnalysis, setRoutingAnalysis] = useState(null);
  const [showRouting, setShowRouting] = useState(false);

  // Mock amber alerts data with critical flagging
  const mockAlerts = [
    {
      id: 'ALT-2024-001',
      type: 'amber',
      severity: 'critical',
      title: 'Missing Child - National Emergency Response Required',
      description: '8-year-old female child missing from residential area. Last seen wearing blue dress and carrying pink backpack. National interest case requiring immediate federal response.',
      location: 'EcoNet Community Center, Lagos',
      coordinates: { lat: 6.5244, lng: 3.3792 },
      lastSeen: '2024-04-09T14:30:00Z',
      reportedBy: 'Lagos State Emergency Services',
      contact: {
        phone: '+234-800-AMBER-01',
        email: 'emergency@ecosafe.ng'
      },
      status: 'active',
      radius: 10,
      image: 'https://via.placeholder.com/300x200/FF0000/FFFFFF?text=MISSING+CHILD',
      flagged: true,
      nationalInterest: true,
      timeSensitive: true,
      casualties: 0,
      infrastructureImpact: false,
      category: 'missing_persons',
      keywords: ['missing_child', 'amber_alert', 'critical'],
      details: {
        age: '8 years',
        height: '4\'2"',
        weight: '35 kg',
        hair: 'Black, shoulder length',
        eyes: 'Brown',
        distinguishing: 'Small scar on left cheek'
      },
      routing: {
        priority: 'critical',
        channels: ['sms', 'push', 'email', 'broadcast', 'emergency_broadcast'],
        estimatedReach: 50000,
        responseRate: 87,
        authoritiesNotified: ['NEMA', 'NPF', 'REDCROSS', 'FMOH']
      }
    },
    {
      id: 'ENV-2024-002',
      type: 'environmental',
      severity: 'critical',
      title: 'Chemical Spill - National Infrastructure Emergency',
      description: 'Major industrial chemical spill near residential area and critical infrastructure. Immediate federal response required. Potential national disaster situation.',
      location: 'Industrial Zone, Port Harcourt',
      coordinates: { lat: 4.8156, lng: 7.0498 },
      lastSeen: '2024-04-09T13:15:00Z',
      reportedBy: 'Environmental Protection Agency',
      contact: {
        phone: '+234-800-ENV-001',
        email: 'emergency@epa.ng'
      },
      status: 'active',
      radius: 15,
      image: 'https://via.placeholder.com/300x200/FFA500/FFFFFF?text=CHEMICAL+SPILL',
      flagged: true,
      nationalInterest: true,
      timeSensitive: true,
      casualties: 0,
      infrastructureImpact: true,
      category: 'chemical_spill',
      keywords: ['chemical_spill', 'infrastructure', 'evacuation', 'critical'],
      details: {
        chemical: 'Industrial solvent - toxic',
        windDirection: 'Northeast',
        evacuation: 'Mandatory',
        shelters: ['Community Center A', 'Sports Complex B'],
        affectedInfrastructure: ['Power Plant', 'Water Treatment', 'Highway Bridge']
      },
      routing: {
        priority: 'critical',
        channels: ['sms', 'push', 'email', 'broadcast', 'emergency_broadcast', 'siren'],
        estimatedReach: 100000,
        responseRate: 95,
        authoritiesNotified: ['NEMA', 'FEMA', 'NPF', 'REDCROSS', 'FMOH', 'SEMA']
      }
    },
    {
      id: 'CLI-2024-003',
      type: 'climate',
      severity: 'medium',
      title: 'Flash Flood Warning',
      description: 'Heavy rainfall causing flash flooding in low-lying areas. Avoid waterlogged roads and seek higher ground.',
      location: 'Coastal Communities, Delta State',
      coordinates: { lat: 5.5882, lng: 5.6732 },
      lastSeen: '2024-04-09T12:00:00Z',
      reportedBy: 'National Emergency Management Agency',
      contact: {
        phone: '+234-800-FLOOD-01',
        email: 'emergency@nema.ng'
      },
      status: 'monitoring',
      radius: 15,
      image: 'https://via.placeholder.com/300x200/0066CC/FFFFFF?text=FLASH+FLOOD',
      details: {
        rainfall: '150mm in 6 hours',
        waterLevel: '2.5m above normal',
        affected: '12 communities',
        forecast: 'Continued rain expected'
      },
      routing: {
        priority: 'medium',
        channels: ['sms', 'push', 'radio'],
        estimatedReach: 35000,
        responseRate: 78
      }
    }
  ];

  useEffect(() => {
    // Load alerts
    setAlerts(mockAlerts);
    
    // Set first alert as active if none selected
    if (mockAlerts.length > 0 && !activeAlert) {
      setActiveAlert(mockAlerts[0]);
    }
  }, []);

  // Analyze routing when active alert changes
  useEffect(() => {
    if (activeAlert) {
      const analysis = routingService.analyzeAlert(activeAlert);
      setRoutingAnalysis(analysis);
    }
  }, [activeAlert, routingService]);

  const handleRouteToAlert = (alert) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const url = `https://www.google.com/maps/dir/${latitude},${longitude}/${alert.coordinates.lat},${alert.coordinates.lng}`;
          window.open(url, '_blank');
        },
        (error) => {
          // Fallback - just open alert location
          const url = `https://www.google.com/maps?q=${alert.coordinates.lat},${alert.coordinates.lng}`;
          window.open(url, '_blank');
        }
      );
    }
  };

  const handleExecuteRouting = async () => {
    if (routingAnalysis) {
      const notifications = await routingService.executeRouting(routingAnalysis.routingPlan);
      alert(`Routing executed! ${notifications.length} authorities notified.`);
    }
  };

  const handleShareAlert = (alert) => {
    const shareText = `URGENT: ${alert.title}\n\nLocation: ${alert.location}\nDetails: ${alert.description}\n\nContact: ${alert.contact.phone}\n\nPlease share this alert widely!`;
    
    if (navigator.share) {
      navigator.share({
        title: alert.title,
        text: shareText,
        url: window.location.href
      });
    } else {
      // Fallback - copy to clipboard
      navigator.clipboard.writeText(shareText);
      alert('Alert details copied to clipboard!');
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-white';
      case 'low': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'amber': return <FaExclamationTriangle className="w-6 h-6" />;
      case 'environmental': return <FaShieldAlt className="w-6 h-6" />;
      case 'climate': return <FaBell className="w-6 h-6" />;
      default: return <FaExclamationTriangle className="w-6 h-6" />;
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const alertTime = new Date(timestamp);
    const diffInMinutes = Math.floor((now - alertTime) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes} minutes ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)} hours ago`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)} days ago`;
    }
  };

  return (
    <MainLayout user={user} onLogout={onLogout} onNavigate={onNavigate}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="bg-red-500 p-3 rounded-full">
                <FaExclamationTriangle className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">AMBER Alerts & Emergency Routing</h1>
                <p className="text-gray-600">Real-time emergency alerts and intelligent routing system</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Alert Radius:</label>
                <select
                  value={alertRadius}
                  onChange={(e) => setAlertRadius(parseInt(e.target.value))}
                  className="px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
                >
                  <option value={1}>1 km</option>
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={25}>25 km</option>
                  <option value={50}>50 km</option>
                </select>
              </div>
              
              <button
                onClick={() => setNotifications(!notifications)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  notifications 
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <FaBell className="w-4 h-4 mr-2 inline" />
                {notifications ? 'Notifications On' : 'Notifications Off'}
              </button>
            </div>
          </div>
        </div>

        {/* Active Alert Banner */}
        {activeAlert && (
          <div className={`mb-8 p-6 rounded-lg border-2 ${getSeverityColor(activeAlert.severity)} bg-opacity-10 border-opacity-50`}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Alert Image */}
              <div className="lg:col-span-1">
                <img 
                  src={activeAlert.image} 
                  alt={activeAlert.title}
                  className="w-full h-48 object-cover rounded-lg"
                />
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Alert ID:</span>
                    <span className="font-mono">{activeAlert.id}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      activeAlert.status === 'active' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {activeAlert.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Radius:</span>
                    <span>{activeAlert.radius} km</span>
                  </div>
                </div>
              </div>

              {/* Alert Details */}
              <div className="lg:col-span-2">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">{activeAlert.title}</h2>
                    <p className="text-gray-700 mb-4">{activeAlert.description}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${getSeverityColor(activeAlert.severity)}`}>
                    {activeAlert.severity.toUpperCase()}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <button
                    onClick={() => handleRouteToAlert(activeAlert)}
                    className="flex flex-col items-center justify-center p-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <FaRoute className="w-5 h-5 mb-1" />
                    <span className="text-xs">Get Directions</span>
                  </button>
                  
                  <button
                    onClick={() => handleShareAlert(activeAlert)}
                    className="flex flex-col items-center justify-center p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    <FaShareAlt className="w-5 h-5 mb-1" />
                    <span className="text-xs">Share Alert</span>
                  </button>
                  
                  <button
                    onClick={() => window.open(`tel:${activeAlert.contact.phone}`)}
                    className="flex flex-col items-center justify-center p-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    <FaPhone className="w-5 h-5 mb-1" />
                    <span className="text-xs">Call Emergency</span>
                  </button>
                  
                  <button
                    onClick={() => setShowMap(!showMap)}
                    className="flex flex-col items-center justify-center p-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    <FaMapMarkerAlt className="w-5 h-5 mb-1" />
                    <span className="text-xs">View Map</span>
                  </button>
                  
                  <button
                    onClick={() => setShowRouting(!showRouting)}
                    className="flex flex-col items-center justify-center p-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    <FaShieldAlt className="w-5 h-5 mb-1" />
                    <span className="text-xs">Authority Routing</span>
                  </button>
                </div>

                {/* Contact Information */}
                <div className="bg-white bg-opacity-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Emergency Contact</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Reported By:</p>
                      <p className="font-medium">{activeAlert.reportedBy}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Phone:</p>
                      <p className="font-medium">{activeAlert.contact.phone}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Email:</p>
                      <p className="font-medium">{activeAlert.contact.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Last Updated:</p>
                      <p className="font-medium">{formatTimeAgo(activeAlert.lastSeen)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Routing Analysis Section */}
        {showRouting && routingAnalysis && (
          <div className="mb-8 bg-white rounded-lg border-2 border-red-500 shadow-lg">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <FaShieldAlt className="w-6 h-6 text-red-500" />
                  <h3 className="text-xl font-bold text-gray-900">Authority Routing Analysis</h3>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    routingAnalysis.severity === 'critical' ? 'bg-red-100 text-red-800' : 
                    routingAnalysis.severity === 'high' ? 'bg-orange-100 text-orange-800' : 
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {routingAnalysis.severity.toUpperCase()} SEVERITY
                  </span>
                </div>
                <button
                  onClick={handleExecuteRouting}
                  className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 font-medium"
                >
                  Execute Emergency Routing
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Primary Authorities */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <FaAmbulance className="w-4 h-4 mr-2 text-red-500" />
                    Primary Response ({routingAnalysis.routingPlan.primary.length})
                  </h4>
                  <div className="space-y-2">
                    {routingAnalysis.routingPlan.primary.map((authority, index) => (
                      <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-red-900">{authority.authority}</span>
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                            {authority.responseTime}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">{authority.role}</p>
                        <p className="text-xs text-gray-500">{authority.contact.phone}</p>
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-700">Actions:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {authority.actions.slice(0, 2).map((action, i) => (
                              <span key={i} className="text-xs bg-white px-2 py-1 rounded border border-gray-200">
                                {action}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Secondary Authorities */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <FaUsers className="w-4 h-4 mr-2 text-orange-500" />
                    Secondary Support ({routingAnalysis.routingPlan.secondary.length})
                  </h4>
                  <div className="space-y-2">
                    {routingAnalysis.routingPlan.secondary.map((authority, index) => (
                      <div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-orange-900">{authority.authority}</span>
                          <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                            {authority.responseTime}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">{authority.role}</p>
                        <p className="text-xs text-gray-500">{authority.contact.phone}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notification & Escalation */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <FaBell className="w-4 h-4 mr-2 text-blue-500" />
                    Notification Network ({routingAnalysis.routingPlan.notification.length + routingAnalysis.routingPlan.escalation.length})
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Notification Authorities:</p>
                      <div className="space-y-1">
                        {routingAnalysis.routingPlan.notification.map((authority, index) => (
                          <div key={index} className="bg-blue-50 border border-blue-200 rounded p-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium text-blue-900">{authority.authority}</span>
                              <span className="text-xs text-gray-500">{authority.responseTime}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Escalation Authorities:</p>
                      <div className="space-y-1">
                        {routingAnalysis.routingPlan.escalation.map((authority, index) => (
                          <div key={index} className="bg-gray-50 border border-gray-200 rounded p-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium text-gray-900">{authority.authority}</span>
                              <span className="text-xs text-gray-500">{authority.responseTime}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Routing Summary */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-500">{routingAnalysis.authorities.length}</p>
                    <p className="text-sm text-gray-600">Total Authorities</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-500">{routingAnalysis.routingPlan.primary.length}</p>
                    <p className="text-sm text-gray-600">Primary Response</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-500">{routingAnalysis.estimatedResponseTime}</p>
                    <p className="text-sm text-gray-600">Est. Response Time</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-500">IMMEDIATE</p>
                    <p className="text-sm text-gray-600">Routing Priority</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Contact Information */}
        {activeAlert && (
          <div className="bg-white bg-opacity-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Emergency Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Reported By:</p>
                <p className="font-medium">{activeAlert.reportedBy}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Phone:</p>
                <p className="font-medium">{activeAlert.contact.phone}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email:</p>
                <p className="font-medium">{activeAlert.contact.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Last Updated:</p>
                <p className="font-medium">{formatTimeAgo(activeAlert.lastSeen)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Map View Toggle */}
        {showMap && activeAlert && (
          <div className="mb-8 bg-gray-100 rounded-lg p-4">
            <div className="bg-gray-300 h-96 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <FaMapMarkerAlt className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Interactive Map View</p>
                <p className="text-sm text-gray-500 mt-2">Alert location: {activeAlert.location}</p>
                <p className="text-sm text-gray-500">Radius: {activeAlert.radius} km</p>
              </div>
            </div>
          </div>
        )}

        {/* All Alerts List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">All Active Alerts</h3>
            <div className="space-y-4">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => setActiveAlert(alert)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    activeAlert?.id === alert.id 
                      ? 'border-red-500 bg-red-50' 
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className={`p-2 rounded-full ${getSeverityColor(alert.severity)}`}>
                        {getAlertIcon(alert.type)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">{alert.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                          <span className="flex items-center">
                            <FaMapMarkerAlt className="w-3 h-3 mr-1" />
                            {alert.location}
                          </span>
                          <span className="flex items-center">
                            <FaClock className="w-3 h-3 mr-1" />
                            {formatTimeAgo(alert.lastSeen)}
                          </span>
                          <span className="flex items-center">
                            <FaEye className="w-3 h-3 mr-1" />
                            {alert.routing.estimatedReach.toLocaleString()} reached
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end space-y-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        alert.status === 'active' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {alert.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Routing Analytics */}
          <div className="lg:col-span-1">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Routing Analytics</h3>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Total Reach</span>
                    <span className="text-sm font-bold text-gray-900">
                      {alerts.reduce((sum, alert) => sum + alert.routing.estimatedReach, 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '75%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Response Rate</span>
                    <span className="text-sm font-bold text-gray-900">85%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '85%' }}></div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">Alert Distribution</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">SMS Notifications</span>
                      <span className="font-medium">12,450</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Push Notifications</span>
                      <span className="font-medium">8,230</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Email Alerts</span>
                      <span className="font-medium">3,120</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Broadcast Messages</span>
                      <span className="font-medium">2,100</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">System Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Alert System</span>
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Online</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Routing Engine</span>
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Active</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Notification Queue</span>
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">Processing</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default AmberAlerts;
