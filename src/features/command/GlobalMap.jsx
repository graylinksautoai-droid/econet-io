import React, { useState, useEffect, useRef } from 'react';
import { FaGlobe, FaExclamationTriangle, FaFire, FaWater, FaWind, FaMountain, FaTrash, FaSatellite, FaCrosshairs } from 'react-icons/fa';

/**
 * Global Map Component - Command Center
 * Shows global environmental risk heatmap and live alerts
 */
const GlobalMap = () => {
  const [mapData, setMapData] = useState({
    regions: [],
    alerts: [],
    loading: true,
    error: null
  });
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [mapStyle, setMapStyle] = useState('satellite');
  const [showAlerts, setShowAlerts] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  useEffect(() => {
    loadGlobalData();
    initializeMap();
    
    // Set up real-time updates
    const interval = setInterval(loadGlobalData, 30000); // 30 seconds
    
    return () => {
      clearInterval(interval);
      if (mapInstance.current) {
        mapInstance.current.remove();
      }
    };
  }, []);

  /**
   * Load global data from backend
   */
  const loadGlobalData = async () => {
    try {
      const response = await fetch('/api/command/global-status');
      const data = await response.json();
      
      setMapData({
        regions: data.regionStatus || [],
        alerts: data.activeAlerts || [],
        loading: false,
        error: null
      });
      
    } catch (error) {
      console.error('Failed to load global data:', error);
      setMapData(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load global data'
      }));
    }
  };

  /**
   * Initialize map
   */
  const initializeMap = async () => {
    if (!mapRef.current) return;

    try {
      // Initialize maplibre map
      const maplibregl = window.maplibregl;
      
      mapInstance.current = new maplibregl.Map({
        container: mapRef.current,
        style: mapStyle === 'satellite' 
          ? 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json'
          : 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
        center: [20, 0], // Center on Africa/Europe
        zoom: 3,
        attributionControl: false
      });

      mapInstance.current.on('load', () => {
        addRegionLayers();
        addAlertLayers();
        addHeatmapLayer();
      });

      mapInstance.current.on('click', handleMapClick);
      
    } catch (error) {
      console.error('Map initialization failed:', error);
    }
  };

  /**
   * Add region layers to map
   */
  const addRegionLayers = () => {
    if (!mapInstance.current || mapData.regions.length === 0) return;

    const map = mapInstance.current;

    // Add region points
    map.addSource('regions', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: mapData.regions.map(region => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [region.coordinates.lon, region.coordinates.lat]
          },
          properties: {
            id: region.id,
            name: region.name,
            country: region.country,
            riskLevel: region.riskLevel,
            lastScan: region.lastScan,
            activeAlerts: region.activeAlerts
          }
        }))
      }
    });

    // Add region circles
    map.addLayer({
      id: 'region-circles',
      type: 'circle',
      source: 'regions',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['get', 'activeAlerts'],
          0, 8,
          1, 12,
          2, 16,
          3, 20
        ],
        'circle-color': [
          'match',
          ['get', 'riskLevel'],
          'critical', '#ef4444',
          'high', '#f97316',
          'medium', '#eab308',
          'low', '#22c55e',
          'minimal', '#3b82f6',
          '#6b7280'
        ],
        'circle-opacity': 0.8,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    });

    // Add region labels
    map.addLayer({
      id: 'region-labels',
      type: 'symbol',
      source: 'regions',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
        'text-anchor': 'center',
        'text-offset': [0, 2]
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1
      }
    });
  };

  /**
   * Add alert layers to map
   */
  const addAlertLayers = () => {
    if (!mapInstance.current || mapData.alerts.length === 0) return;

    const map = mapInstance.current;

    map.addSource('alerts', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: mapData.alerts.map(alert => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [alert.coordinates.lon, alert.coordinates.lat]
          },
          properties: {
            id: alert.id,
            type: alert.disasterType,
            severity: alert.severity,
            probability: alert.probability,
            timestamp: alert.timestamp
          }
        }))
      }
    });

    // Add alert markers
    map.addLayer({
      id: 'alert-markers',
      type: 'symbol',
      source: 'alerts',
      layout: {
        'icon-image': [
          'match',
          ['get', 'type'],
          'Fire', 'fire-icon',
          'Flood', 'water-icon',
          'Storm', 'wind-icon',
          'Landslide', 'mountain-icon',
          'Pollution', 'trash-icon',
          'satellite-icon'
        ],
        'icon-size': 1.5,
        'icon-allow-overlap': true
      }
    });

    // Add alert pulse animation
    map.addLayer({
      id: 'alert-pulse',
      type: 'circle',
      source: 'alerts',
      paint: {
        'circle-radius': 20,
        'circle-color': [
          'match',
          ['get', 'severity'],
          'Critical', '#ef4444',
          'High', '#f97316',
          'Medium', '#eab308',
          '#22c55e'
        ],
        'circle-opacity': 0.3
      }
    });
  };

  /**
   * Add heatmap layer
   */
  const addHeatmapLayer = () => {
    if (!mapInstance.current || !showHeatmap) return;

    const map = mapInstance.current;

    // Create heatmap data from risk levels
    const heatmapData = {
      type: 'FeatureCollection',
      features: mapData.regions.map(region => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [region.coordinates.lon, region.coordinates.lat]
        },
        properties: {
          intensity: getRiskIntensity(region.riskLevel)
        }
      }))
    };

    map.addSource('heatmap', {
      type: 'geojson',
      data: heatmapData
    });

    map.addLayer({
      id: 'heatmap-layer',
      type: 'heatmap',
      source: 'heatmap',
      paint: {
        'heatmap-weight': ['get', 'intensity'],
        'heatmap-intensity': 0.8,
        'heatmap-radius': 50,
        'heatmap-opacity': 0.6,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0, 0, 255, 0)',
          0.2, 'rgba(0, 255, 0, 0.5)',
          0.4, 'rgba(255, 255, 0, 0.5)',
          0.6, 'rgba(255, 128, 0, 0.5)',
          1, 'rgba(255, 0, 0, 0.8)'
        ]
      }
    });
  };

  /**
   * Handle map click
   */
  const handleMapClick = (e) => {
    const features = mapInstance.current.queryRenderedFeatures(e.point);
    
    if (features.length > 0) {
      const feature = features[0];
      if (feature.layer.id === 'region-circles' || feature.layer.id === 'region-labels') {
        setSelectedRegion(feature.properties);
      } else if (feature.layer.id === 'alert-markers') {
        // Show alert details
        showAlertDetails(feature.properties);
      }
    }
  };

  /**
   * Get risk intensity for heatmap
   */
  const getRiskIntensity = (riskLevel) => {
    const intensities = {
      'critical': 1.0,
      'high': 0.8,
      'medium': 0.6,
      'low': 0.4,
      'minimal': 0.2
    };
    return intensities[riskLevel] || 0.2;
  };

  /**
   * Show alert details
   */
  const showAlertDetails = (alert) => {
    // In a real implementation, show modal or sidebar with alert details
    console.log('Alert details:', alert);
  };

  /**
   * Get disaster icon
   */
  const getDisasterIcon = (type) => {
    const icons = {
      'Fire': <FaFire className="text-red-500" />,
      'Flood': <FaWater className="text-blue-500" />,
      'Storm': <FaWind className="text-gray-500" />,
      'Landslide': <FaMountain className="text-orange-500" />,
      'Pollution': <FaTrash className="text-yellow-500" />
    };
    return icons[type] || <FaSatellite className="text-purple-500" />;
  };

  /**
   * Get risk color
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

  if (mapData.loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FaSatellite className="text-4xl text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading global monitoring data...</p>
        </div>
      </div>
    );
  }

  if (mapData.error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <FaExclamationTriangle className="text-4xl text-red-500 mx-auto mb-4" />
          <p className="text-red-400">{mapData.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-gray-900">
      {/* Map Controls */}
      <div className="absolute top-4 left-4 z-10 space-y-2">
        {/* Map Style Toggle */}
        <div className="bg-gray-800 rounded-lg p-2 space-y-1">
          <button
            onClick={() => setMapStyle(mapStyle === 'satellite' ? 'street' : 'satellite')}
            className="block w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 rounded"
          >
            {mapStyle === 'satellite' ? 'Street View' : 'Satellite View'}
          </button>
        </div>

        {/* Layer Controls */}
        <div className="bg-gray-800 rounded-lg p-2 space-y-1">
          <label className="flex items-center text-sm text-gray-300">
            <input
              type="checkbox"
              checked={showAlerts}
              onChange={(e) => setShowAlerts(e.target.checked)}
              className="mr-2"
            />
            Show Alerts
          </label>
          <label className="flex items-center text-sm text-gray-300">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
              className="mr-2"
            />
            Show Heatmap
          </label>
        </div>
      </div>

      {/* Map Container */}
      <div ref={mapRef} className="absolute inset-0" />

      {/* Global Stats Overlay */}
      <div className="absolute top-4 right-4 z-10">
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-4 min-w-64">
          <h3 className="text-white font-semibold mb-3 flex items-center">
            <FaGlobe className="mr-2" />
            Global Monitor
          </h3>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Regions Monitored:</span>
              <span className="text-emerald-400 font-mono">{mapData.regions.length}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Active Alerts:</span>
              <span className="text-orange-400 font-mono">{mapData.alerts.length}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>High Risk Regions:</span>
              <span className="text-red-400 font-mono">
                {mapData.regions.filter(r => r.riskLevel === 'critical' || r.riskLevel === 'high').length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Region Details */}
      {selectedRegion && (
        <div className="absolute bottom-4 left-4 z-10">
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-4 min-w-80">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-white font-semibold">{selectedRegion.name}</h3>
              <button
                onClick={() => setSelectedRegion(null)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-300">
                <span>Country:</span>
                <span>{selectedRegion.country}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Risk Level:</span>
                <span className={`px-2 py-1 rounded text-xs text-white ${getRiskColor(selectedRegion.riskLevel)}`}>
                  {selectedRegion.riskLevel.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Active Alerts:</span>
                <span className="text-orange-400">{selectedRegion.activeAlerts}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Last Scan:</span>
                <span>{selectedRegion.lastScan ? new Date(selectedRegion.lastScan).toLocaleTimeString() : 'Never'}</span>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-gray-700">
              <button
                onClick={() => forceScanRegion(selectedRegion.id)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded text-sm"
              >
                Force Scan Region
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Legend */}
      <div className="absolute bottom-4 right-4 z-10">
        <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg p-3">
          <h4 className="text-white font-semibold mb-2 text-sm">Risk Levels</h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center text-gray-300">
              <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
              Critical
            </div>
            <div className="flex items-center text-gray-300">
              <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
              High
            </div>
            <div className="flex items-center text-gray-300">
              <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
              Medium
            </div>
            <div className="flex items-center text-gray-300">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              Low
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalMap;
