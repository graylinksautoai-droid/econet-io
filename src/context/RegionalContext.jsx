import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRegionalConfig } from '../hooks/useRegionalConfig';

/**
 * Regional Context - Manages regional configuration and UI adaptation
 */
const RegionalContext = createContext();

export const useRegional = () => {
  const context = useContext(RegionalContext);
  if (!context) {
    throw new Error('useRegional must be used within a RegionalProvider');
  }
  return context;
};

export const RegionalProvider = ({ children }) => {
  const { country, region, coordinates, loading: regionLoading, fetchRegionalConfig, getCachedConfig } = useRegionalConfig();
  
  const [regionalConfig, setRegionalConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState(null);

  /**
   * Load regional configuration
   */
  const loadRegionalConfig = useCallback(async () => {
    if (!country || country === 'Unknown') {
      // Use default config
      const defaultConfig = {
        units: 'metric',
        hazardTypes: ['flood', 'fire', 'drought', 'environmental'],
        authorities: [],
        ngos: [],
        uiLabels: {
          temperature: '°C',
          distance: 'km',
          speed: 'km/h',
          pressure: 'hPa',
          humidity: '%',
          wind: 'Wind Speed',
          visibility: 'Visibility',
          airQuality: 'Air Quality Index'
        },
        emergencyNumbers: ['112'],
        timezone: 'UTC',
        language: 'en',
        isDefault: true
      };
      setRegionalConfig(defaultConfig);
      return;
    }

    setConfigLoading(true);
    setConfigError(null);

    try {
      // Try cached config first
      const cached = getCachedConfig();
      if (cached) {
        setRegionalConfig(cached);
        setConfigLoading(false);
        return;
      }

      // Fetch from backend
      const config = await fetchRegionalConfig();
      if (config) {
        setRegionalConfig(config);
      } else {
        throw new Error('Failed to fetch regional configuration');
      }
    } catch (error) {
      console.error('Regional config load error:', error);
      setConfigError(error.message);
      
      // Use default config on error
      const defaultConfig = {
        units: 'metric',
        hazardTypes: ['flood', 'fire', 'drought', 'environmental'],
        authorities: [],
        ngos: [],
        uiLabels: {
          temperature: '°C',
          distance: 'km',
          speed: 'km/h',
          pressure: 'hPa',
          humidity: '%',
          wind: 'Wind Speed',
          visibility: 'Visibility',
          airQuality: 'Air Quality Index'
        },
        emergencyNumbers: ['112'],
        timezone: 'UTC',
        language: 'en',
        isDefault: true,
        error: true
      };
      setRegionalConfig(defaultConfig);
    } finally {
      setConfigLoading(false);
    }
  }, [country, fetchRegionalConfig, getCachedConfig]);

  /**
   * Load regional config when country changes
   */
  useEffect(() => {
    if (country) {
      loadRegionalConfig();
    }
  }, [country, loadRegionalConfig]);

  /**
   * Convert temperature based on regional units
   */
  const convertTemperature = useCallback((temp, toUnit = null) => {
    const targetUnit = toUnit || regionalConfig?.units || 'metric';
    
    if (targetUnit === 'imperial') {
      return Math.round((temp * 9/5) + 32);
    }
    return Math.round(temp);
  }, [regionalConfig]);

  /**
   * Convert distance based on regional units
   */
  const convertDistance = useCallback((distance, toUnit = null) => {
    const targetUnit = toUnit || regionalConfig?.units || 'metric';
    
    if (targetUnit === 'imperial') {
      return Math.round(distance * 0.621371);
    }
    return Math.round(distance);
  }, [regionalConfig]);

  /**
   * Convert speed based on regional units
   */
  const convertSpeed = useCallback((speed, toUnit = null) => {
    const targetUnit = toUnit || regionalConfig?.units || 'metric';
    
    if (targetUnit === 'imperial') {
      return Math.round(speed * 0.621371);
    }
    return Math.round(speed);
  }, [regionalConfig]);

  /**
   * Get localized UI label
   */
  const getLabel = useCallback((key) => {
    return regionalConfig?.uiLabels?.[key] || key;
  }, [regionalConfig]);

  /**
   * Get hazard types for region
   */
  const getHazardTypes = useCallback(() => {
    return regionalConfig?.hazardTypes || ['flood', 'fire', 'drought', 'environmental'];
  }, [regionalConfig]);

  /**
   * Get authorities for hazard type
   */
  const getAuthoritiesForHazard = useCallback((hazardType) => {
    if (!regionalConfig?.authorities) return [];
    
    // Filter authorities based on hazard type
    const hazardTypeLower = hazardType.toLowerCase();
    const priorityMap = {
      'fire': ['fire', 'emergency'],
      'flood': ['emergency', 'weather'],
      'drought': ['weather', 'environmental'],
      'oil_spill': ['environmental', 'emergency'],
      'pollution': ['environmental', 'weather'],
      'erosion': ['environmental'],
      'deforestation': ['environmental'],
      'landslide': ['emergency', 'environmental'],
      'wildfire': ['fire', 'emergency'],
      'hurricane': ['weather', 'emergency'],
      'tornado': ['weather', 'emergency'],
      'earthquake': ['emergency']
    };

    const relevantTypes = priorityMap[hazardTypeLower] || ['emergency'];
    
    return regionalConfig.authorities
      .filter(authority => relevantTypes.includes(authority.type))
      .slice(0, 2);
  }, [regionalConfig]);

  /**
   * Get NGOs for region
   */
  const getNGOs = useCallback(() => {
    return regionalConfig?.ngos || [];
  }, [regionalConfig]);

  /**
   * Get emergency numbers
   */
  const getEmergencyNumbers = useCallback(() => {
    return regionalConfig?.emergencyNumbers || ['112'];
  }, [regionalConfig]);

  /**
   * Format value with regional units
   */
  const formatWithUnits = useCallback((value, type, precision = 0) => {
    const label = getLabel(type);
    let convertedValue = value;
    
    switch (type) {
      case 'temperature':
        convertedValue = convertTemperature(value);
        break;
      case 'distance':
        convertedValue = convertDistance(value);
        break;
      case 'speed':
        convertedValue = convertSpeed(value);
        break;
      default:
        convertedValue = value;
    }
    
    return `${convertedValue.toFixed(precision)} ${label}`;
  }, [convertTemperature, convertDistance, convertSpeed, getLabel]);

  const value = {
    // Regional data
    country,
    region,
    coordinates,
    regionalConfig,
    
    // Loading states
    loading: regionLoading || configLoading,
    error: configError,
    
    // Configuration methods
    loadRegionalConfig,
    
    // Utility methods
    convertTemperature,
    convertDistance,
    convertSpeed,
    getLabel,
    getHazardTypes,
    getAuthoritiesForHazard,
    getNGOs,
    getEmergencyNumbers,
    formatWithUnits,
    
    // Status
    isDefault: regionalConfig?.isDefault || false,
    hasConfig: !!regionalConfig && !regionalConfig?.isDefault
  };

  return (
    <RegionalContext.Provider value={value}>
      {children}
    </RegionalContext.Provider>
  );
};
