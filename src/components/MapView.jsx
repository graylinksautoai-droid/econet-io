import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Add custom CSS for map popups
const mapPopupStyles = `
  .map-popup {
    font-family: system-ui, -apple-system, sans-serif;
  }
  .map-popup .maplibregl-popup-content {
    padding: 0 !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
  }
  .map-popup .maplibregl-popup-tip {
    border-top-color: white !important;
  }
`;

const MapView = ({ activeIncident, reports = [] }) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const activePopup = useRef(null); // Keep track of open popups
  const [loading, setLoading] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  // Inject custom styles
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = mapPopupStyles;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  // Define loadReportData with useCallback so it's stable
  const loadReportData = useCallback(async () => {
    if (!map.current) return;
    
    try {
      // Create initial empty source
      console.log('Adding empty map source for dynamic data');
      map.current.addSource('reports', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });

      // Layer definitions
      console.log('Adding cluster layer');
      map.current.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'reports',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#51bbd6',
            100,
            '#f1f075',
            750,
            '#f28cb1'
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,
            100,
            30,
            750,
            40
          ]
        }
      });

      console.log('Adding cluster count layer');
      map.current.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'reports',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        }
      });

      console.log('Adding unclustered point layer for individual pins');
      map.current.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'reports',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': [
            'case',
            ['get', 'severity'],
            'Critical', '#ef4444',
            'Observation', '#f59e0b',
            'Low', '#3b82f6',
            'Moderate', '#f59e0b',
            '#e5e7eb'
          ],
          'circle-radius': 10,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9
        }
      });

      map.current.addLayer({
        id: 'critical-pulse',
        type: 'circle',
        source: 'reports',
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'postStatus'], 'critical']],
        paint: {
          'circle-color': '#ef4444',
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3, 12,
            10, 20,
            14, 28
          ],
          'circle-opacity': 0.22,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#fecaca'
        }
      });
      
      // Add click handler for popups
      map.current.on('click', 'unclustered-point', (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const properties = e.features[0].properties;
        
        new maplibregl.Popup({
          closeButton: true,
          closeOnClick: true,
          className: 'map-popup',
          anchor: 'bottom',
          offset: [0, -15]
        })
        .setLngLat(coordinates)
        .setHTML(`
          <div class="p-3 min-w-[200px]">
            <div class="font-semibold text-gray-900 mb-2">${properties.category || 'Environmental Incident'}</div>
            <div class="text-sm text-gray-600 mb-2">${properties.content || 'No description available'}</div>
            <div class="flex items-center justify-between text-xs">
              <span class="px-2 py-1 rounded-full text-white ${
                properties.severity === 'Critical' ? 'bg-red-500' :
                properties.severity === 'High' ? 'bg-orange-500' :
                properties.severity === 'Moderate' ? 'bg-yellow-500' :
                'bg-blue-500'
              }">${properties.severity || 'Unknown'}</span>
              <span class="text-gray-500">${new Date(properties.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
              <div>Trust Score: ${properties.trustScore || 0}%</div>
              <div>Reported by: ${properties.author || 'Anonymous'}</div>
            </div>
          </div>
        `)
        .addTo(map.current);
      });
      
      // Change cursor on hover
      map.current.on('mouseenter', 'unclustered-point', () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      
      map.current.on('mouseleave', 'unclustered-point', () => {
        map.current.getCanvas().style.cursor = '';
      });
      
      console.log('All map layers added successfully');

      setLoading(false);
      setIsLoaded(true);
      setTimeout(() => {
        map.current?.resize();
        map.current?.invalidateSize?.();
      }, 100);
    } catch (error) {
      console.error('MapView: Error loading report data:', error);
      setLoading(false);
      setIsLoaded(true);
    }
  }, []);

  // Handle Clicks
  useEffect(() => {
    if (map.current) {
      map.current.on('click', (e) => {
        try {
          const features = map.current.queryRenderedFeatures(e.point, {
            layers: ['clusters', 'unclustered-point']
          });

          if (!features.length) return;

          const feature = features[0];
          const coordinates = feature.geometry.coordinates;

          // Create popup content
          const popupContent = `
            <div style="padding: 10px;">
              <h3 style="margin: 0 0 10px 0; color: #333;">${feature.properties.category || 'Unknown'}</h3>
              <p style="margin: 5px 0; color: #666;">Severity: ${feature.properties.severity || 'Unknown'}</p>
              <p style="margin: 5px 0; color: #666;">Trust Score: ${feature.properties.trustScore || 'N/A'}</p>
              <p style="margin: 5px 0; color: #666;">AI Score: ${feature.properties.aiScore || 'N/A'}</p>
            </div>
          `;

          // Close existing popup
          if (activePopup.current) {
            activePopup.current.remove();
          }

          // Create new popup
          activePopup.current = new maplibregl.Popup()
            .setLngLat(coordinates)
            .setHTML(popupContent)
            .addTo(map.current);
        } catch (error) {
          console.error('Error handling map click:', error);
        }
      });
    }
  }, []);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // 2. RESIZE HANDLING
  useEffect(() => {
    const handleResize = () => {
      if (map.current && isLoaded) {
        try {
          map.current.resize();
        } catch (error) {
          console.warn('MapView: Error during resize:', error);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isLoaded]);

  // 3. ACTIVE INCIDENT SYNC
  useEffect(() => {
    if (!map.current || !isLoaded || !activeIncident) return;

    try {
      const coords = activeIncident.location?.coordinates;
      if (coords && coords.length === 2) {
        map.current.flyTo({
          center: coords,
          zoom: 12,
          speed: 1.2,
          curve: 1.42,
          easing: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
        });
      }
    } catch (error) {
      console.warn('MapView: Error flying to incident:', error);
    }
  }, [activeIncident, isLoaded]);

  // 4. REACTIVE DATA SYNC (Updates when the 'reports' prop changes)
  useEffect(() => {
    if (map.current && isLoaded && reports.length > 0) {
      try {
        const source = map.current.getSource('reports');
        if (source) {
          const features = reports.map(r => {
            let coordinates = [7.4951, 9.0579]; // Default to Abuja
            
            // Handle different location data structures
            if (r.location?.coordinates && Array.isArray(r.location.coordinates)) {
              coordinates = r.location.coordinates;
            } else if (r.location?.lon && r.location?.lat) {
              coordinates = [r.location.lon, r.location.lat];
            } else if (r.lon && r.lat) {
              coordinates = [r.lon, r.lat];
            } else if (r.location?.lng && r.location?.lat) {
              coordinates = [r.location.lng, r.location.lat];
            } else if (r.location?.type === 'Point' && r.location?.coordinates) {
              coordinates = r.location.coordinates;
            }
            
            return {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: coordinates
              },
              properties: {
                ...r,
                category: r.category || 'Environmental Incident',
                severity: r.severity || 'Low',
                postStatus: r.postStatus || 'regular',
                author: r.authorName || r.author || 'Anonymous',
                content: r.description || r.content || 'Environmental report'
              }
            };
          });
          
          console.log('MapView: Updating with', features.length, 'features:', features);
          
          source.setData({
            type: 'FeatureCollection',
            features: features
          });
          map.current.resize();
        }
      } catch (error) {
        console.warn('MapView: Error updating source data:', error);
      }
    }
  }, [reports, isLoaded]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    // Set loading timeout
    const loadingTimeout = setTimeout(() => {
      console.log('Map loading timeout - forcing load complete');
      setLoading(false);
      setIsLoaded(true);
    }, 10000); // 10 second timeout

    try {
      console.log('Initializing map with container:', mapContainer.current);
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>'
            }
          },
          layers: [{
            id: 'osm',
            type: 'raster',
            source: 'osm'
          }]
        },
        center: [7.4951, 9.0579], // Abuja, Nigeria [longitude, latitude]
        zoom: 10,
        minZoom: 2,
        maxZoom: 20
      });
      
      console.log('Map initialized:', map.current);

      let mapLoaded = false;

      map.current.on('load', () => {
        if (mapLoaded) return; // Prevent multiple calls
        mapLoaded = true;
        clearTimeout(loadingTimeout);
        console.log('Map loaded successfully');
        
        // Add zoom controls
        map.current.addControl(new maplibregl.NavigationControl({
          visualizePitch: true,
          showZoom: true,
          showCompass: true
        }));
        
        // Add scale control
        map.current.addControl(new maplibregl.ScaleControl({
          maxWidth: 80,
          unit: 'metric'
        }));
        
        // Enable fullscreen control
        map.current.addControl(new maplibregl.FullscreenControl());
        
        // Add geolocate control
        map.current.addControl(new maplibregl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true,
          showUserLocation: true
        }));
        
        // Enable mouse wheel zoom
        map.current.scrollZoom.zoomDelta = 1;
        
        // Enable double click zoom
        map.current.doubleClickZoom.enable();
        
        // Enable drag to pan
        map.current.dragPan.enable();
        
        // Enable touch zoom/rotate
        map.current.touchZoomRotate.enable();
        
        loadReportData();
      });

      map.current.on('error', (e) => {
        clearTimeout(loadingTimeout);
        console.error('Map load error:', e);
        setLoading(false);
        setIsLoaded(true);
        
        // Try fallback dark style
        if (map.current) {
          map.current.setStyle('https://tiles.openstreetmap.org/styles/osm-liberty/style.json');
          console.log('Switched to fallback dark map style');
        }
      });

      return () => {
        clearTimeout(loadingTimeout);
      };
    } catch (error) {
      clearTimeout(loadingTimeout);
      console.error('Map initialization failed:', error);
      setLoading(false);
      setIsLoaded(true);
    }
  }, []);

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden" style={{ height: '600px' }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-20 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-emerald-500 font-black tracking-widest uppercase text-xs">Loading Environmental Data</p>
            <p className="text-gray-400 text-xs mt-2">Initializing pins...</p>
          </div>
        </div>
      )}
      
      <div ref={mapContainer} className="w-full h-full rounded-lg overflow-hidden" style={{ height: '600px' }} />
    </div>
  );
};

export default MapView;
