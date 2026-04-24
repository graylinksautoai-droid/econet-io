import { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl } from '../services/runtimeConfig.js';

/**
 * Hook for autonomous regional configuration detection
 * Uses geolocation with IP-based fallback
 */
export function useRegionalConfig() {
  const [region, setRegion] = useState({
    country: null,
    region: null,
    coordinates: null,
    loading: true,
    error: null
  });

  /**
   * Get country from coordinates using reverse geocoding
   */
  const getCountryFromCoordinates = async (lat, lon) => {
    try {
      // Using OpenStreetMap Nominatim API for reverse geocoding
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=2&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'EcoNet/1.0'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        return {
          country: data.address?.country || 'Unknown',
          region: data.address?.state || data.address?.region || 'Unknown'
        };
      }
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
    }
    
    return { country: 'Unknown', region: 'Unknown' };
  };

  /**
   * Get country from IP address (fallback)
   */
  const getCountryFromIP = async () => {
    try {
      const response = await fetch('https://ipapi.co/json/');
      if (response.ok) {
        const data = await response.json();
        return {
          country: data.country_name || 'Unknown',
          region: data.region || 'Unknown',
          coordinates: [data.longitude, data.latitude]
        };
      }
    } catch (error) {
      console.warn('IP geolocation failed:', error);
    }
    
    return { country: 'Unknown', region: 'Unknown', coordinates: null };
  };

  /**
   * Detect user region using geolocation
   */
  const detectRegion = useCallback(async () => {
    setRegion(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Try browser geolocation first
      if (navigator.geolocation) {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            enableHighAccuracy: true
          });
        });

        const { latitude, longitude } = position.coords;
        const locationData = await getCountryFromCoordinates(latitude, longitude);
        
        setRegion({
          country: locationData.country,
          region: locationData.region,
          coordinates: [longitude, latitude],
          loading: false,
          error: null
        });
      } else {
        throw new Error('Geolocation not supported');
      }
    } catch (error) {
      console.warn('Geolocation failed, using IP fallback:', error.message);
      
      try {
        // Fallback to IP-based detection
        const ipData = await getCountryFromIP();
        setRegion({
          country: ipData.country,
          region: ipData.region,
          coordinates: ipData.coordinates,
          loading: false,
          error: null
        });
      } catch (ipError) {
        console.warn('IP geolocation also failed, using default region:', ipError.message);
        
        // Final fallback to default region
        const DEFAULT_REGION = {
          country: 'NG',
          region: 'Lagos',
          coordinates: [6.5244, 3.3792]
        };
        
        setRegion({
          country: DEFAULT_REGION.country,
          region: DEFAULT_REGION.region,
          coordinates: DEFAULT_REGION.coordinates,
          loading: false,
          error: null
        });
      }
    }
  }, []);

  /**
   * Fetch regional configuration from backend
   */
  const fetchRegionalConfig = useCallback(async () => {
    if (!region.country || region.country === 'Unknown') {
      return null;
    }

    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await fetch(
        `${getApiBaseUrl()}/region/config?country=${encodeURIComponent(region.country)}`,
        {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }
      );

      if (response.ok) {
        const config = await response.json();
        // Cache in localStorage
        try {
          localStorage.setItem('regionalConfig', JSON.stringify(config));
        } catch (error) {
          console.warn('Failed to cache regional config:', error);
        }
        return config;
      }
    } catch (error) {
      console.warn('Failed to fetch regional config:', error);
    }

    return null;
  }, [region.country]);

  /**
   * Get cached regional config
   */
  const getCachedConfig = useCallback(() => {
    try {
      const cached = localStorage.getItem('regionalConfig');
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('Failed to parse cached config:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    detectRegion();
  }, [detectRegion]);

  return {
    ...region,
    detectRegion,
    fetchRegionalConfig,
    getCachedConfig
  };
}
