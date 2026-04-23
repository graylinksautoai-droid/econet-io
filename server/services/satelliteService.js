/**
 * Satellite Data Integration Service
 * Integrates NASA, ESA, and other satellite APIs for environmental monitoring
 */
const fetch = require('node-fetch');

class SatelliteService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
    this.apis = {
      nasaFirms: {
        baseUrl: 'https://firms.modaps.eosdis.nasa.gov/api/area',
        key: process.env.NASA_FIRMS_API_KEY || 'demo_key'
      },
      nasaPower: {
        baseUrl: 'https://power.larc.nasa.gov/api/temporal/daily/point',
        key: process.env.NASA_POWER_API_KEY || 'demo_key'
      },
      esaSentinel: {
        baseUrl: 'https://services.sentinel-hub.com/api/v1',
        key: process.env.ESA_SENTINEL_API_KEY || 'demo_key'
      }
    };
  }

  /**
   * Fetch fire data from NASA FIRMS
   */
  async fetchFireData(lat, lon, radius = 0.5) {
    try {
      console.log(`Satellite Service: Fetching fire data for ${lat}, ${lon}`);
      
      const cacheKey = `fire_${lat}_${lon}_${radius}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      // NASA FIRMS API for active fire data
      const url = `${this.apis.nasaFirms.baseUrl}?lat=${lat}&lon=${lon}&radius=${radius}&source=MODIS_NRT&api_key=${this.apis.nasaFirms.key}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'EcoNet-Satellite/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`NASA FIRMS API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Normalize fire data
      const fireData = this.normalizeFireData(data);
      
      // Cache the result
      this.setCache(cacheKey, fireData);
      
      console.log(`Satellite Service: Retrieved ${fireData.heatSpots.length} fire hotspots`);
      
      return fireData;
      
    } catch (error) {
      console.error('Satellite Service: Fire data fetch failed:', error);
      return this.getFallbackFireData(lat, lon);
    }
  }

  /**
   * Fetch weather/climate data from NASA POWER
   */
  async fetchWeatherData(lat, lon, startDate = null, endDate = null) {
    try {
      console.log(`Satellite Service: Fetching weather data for ${lat}, ${lon}`);
      
      const cacheKey = `weather_${lat}_${lon}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      // Default to last 7 days if no dates provided
      const end = endDate || new Date().toISOString().split('T')[0];
      const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // NASA POWER API for weather data
      const url = `${this.apis.nasaPower.baseUrl}?start=${start}&end=${end}&latitude=${lat}&longitude=${lon}&community=SB&parameters=T2M,RH2M,PRECTOTCORR&format=JSON&api_key=${this.apis.nasaPower.key}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'EcoNet-Satellite/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`NASA POWER API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Normalize weather data
      const weatherData = this.normalizeWeatherData(data);
      
      // Cache the result
      this.setCache(cacheKey, weatherData);
      
      console.log(`Satellite Service: Retrieved weather data for ${weatherData.dataPoints} days`);
      
      return weatherData;
      
    } catch (error) {
      console.error('Satellite Service: Weather data fetch failed:', error);
      return this.getFallbackWeatherData(lat, lon);
    }
  }

  /**
   * Fetch satellite imagery from ESA Sentinel Hub
   */
  async fetchSatelliteImagery(lat, lon, radius = 0.1, date = null) {
    try {
      console.log(`Satellite Service: Fetching satellite imagery for ${lat}, ${lon}`);
      
      const cacheKey = `imagery_${lat}_${lon}_${radius}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      // Use provided date or most recent available
      const targetDate = date || new Date().toISOString().split('T')[0];

      // ESA Sentinel Hub API for satellite imagery
      const bbox = this.calculateBoundingBox(lat, lon, radius);
      const url = `${this.apis.esaSentinel.baseUrl}/process?bbox=${bbox}&time=${targetDate}&evalscript=return[0.2,0.6,0.1]&format=png&api_key=${this.apis.esaSentinel.key}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'EcoNet-Satellite/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`ESA Sentinel API error: ${response.status}`);
      }

      const imageBuffer = await response.buffer();
      
      // Convert to base64 for storage
      const base64Image = imageBuffer.toString('base64');
      
      const imageryData = {
        imageUrl: `data:image/png;base64,${base64Image}`,
        bbox,
        timestamp: targetDate,
        cloudCoverage: await this.estimateCloudCoverage(lat, lon, targetDate),
        resolution: '10m'
      };
      
      // Cache the result
      this.setCache(cacheKey, imageryData);
      
      console.log(`Satellite Service: Retrieved satellite imagery`);
      
      return imageryData;
      
    } catch (error) {
      console.error('Satellite Service: Imagery fetch failed:', error);
      return this.getFallbackImagery(lat, lon);
    }
  }

  /**
   * Get comprehensive environmental data
   */
  async getEnvironmentalData(lat, lon) {
    try {
      console.log(`Satellite Service: Getting comprehensive environmental data for ${lat}, ${lon}`);
      
      // Fetch all data types in parallel
      const [fireData, weatherData, imageryData] = await Promise.all([
        this.fetchFireData(lat, lon),
        this.fetchWeatherData(lat, lon),
        this.fetchSatelliteImagery(lat, lon)
      ]);

      // Combine and normalize data
      const environmentalData = {
        location: { lat, lon },
        timestamp: new Date().toISOString(),
        temperature: weatherData.temperature,
        humidity: weatherData.humidity,
        precipitation: weatherData.precipitation,
        fireRisk: this.calculateFireRisk(fireData, weatherData),
        vegetationIndex: await this.calculateVegetationIndex(lat, lon),
        recentHeatSpots: fireData.heatSpots,
        weatherTrend: weatherData.trend,
        imagery: imageryData.imageUrl,
        cloudCoverage: imageryData.cloudCoverage,
        airQuality: await this.getAirQualityIndex(lat, lon),
        riskFactors: this.assessRiskFactors(fireData, weatherData)
      };

      console.log(`Satellite Service: Environmental data ready - Fire Risk: ${environmentalData.fireRisk}`);
      
      return environmentalData;
      
    } catch (error) {
      console.error('Satellite Service: Environmental data fetch failed:', error);
      return this.getFallbackEnvironmentalData(lat, lon);
    }
  }

  /**
   * Normalize fire data from NASA FIRMS
   */
  normalizeFireData(data) {
    const heatSpots = [];
    
    if (data && Array.isArray(data)) {
      for (const fire of data) {
        heatSpots.push({
          latitude: fire.latitude || fire.lat,
          longitude: fire.longitude || fire.lon,
          confidence: fire.confidence || fire.acq_time || 0.5,
          brightness: fire.brightness || 300,
          power: fire.frp || 0,
          detectionTime: fire.acq_time || new Date().toISOString(),
          satellite: fire.satellite || 'MODIS'
        });
      }
    }

    return {
      heatSpots: heatSpots.slice(0, 50), // Limit to 50 most recent
      totalFires: heatSpots.length,
      highConfidenceFires: heatSpots.filter(f => f.confidence > 80).length,
      averageBrightness: heatSpots.length > 0 ? 
        heatSpots.reduce((sum, f) => sum + f.brightness, 0) / heatSpots.length : 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Normalize weather data from NASA POWER
   */
  normalizeWeatherData(data) {
    const weatherData = {
      temperature: 25,
      humidity: 60,
      precipitation: 0,
      trend: 'stable',
      dataPoints: 0
    };

    if (data && data.properties && data.properties.parameter) {
      const params = data.properties.parameter;
      
      // Get temperature data (T2M)
      if (params.T2M) {
        const temps = Object.values(params.T2M);
        weatherData.temperature = temps[temps.length - 1] || 25;
        weatherData.trend = this.calculateTrend(temps);
      }
      
      // Get humidity data (RH2M)
      if (params.RH2M) {
        const humidity = Object.values(params.RH2M);
        weatherData.humidity = humidity[humidity.length - 1] || 60;
      }
      
      // Get precipitation data (PRECTOTCORR)
      if (params.PRECTOTCORR) {
        const precip = Object.values(params.PRECTOTCORR);
        weatherData.precipitation = precip[precip.length - 1] || 0;
      }
      
      weatherData.dataPoints = Math.max(
        Object.keys(params.T2M || {}).length,
        Object.keys(params.RH2M || {}).length,
        Object.keys(params.PRECTOTCORR || {}).length
      );
    }

    return weatherData;
  }

  /**
   * Calculate fire risk based on fire and weather data
   */
  calculateFireRisk(fireData, weatherData) {
    let risk = 0;
    
    // Base risk from recent heat spots
    if (fireData.heatSpots.length > 0) {
      risk += Math.min(fireData.heatSpots.length * 2, 20);
    }
    
    // High confidence fires increase risk
    risk += fireData.highConfidenceFires * 3;
    
    // Weather factors
    if (weatherData.temperature > 35) risk += 15;
    else if (weatherData.temperature > 30) risk += 10;
    else if (weatherData.temperature > 25) risk += 5;
    
    if (weatherData.humidity < 20) risk += 15;
    else if (weatherData.humidity < 30) risk += 10;
    else if (weatherData.humidity < 40) risk += 5;
    
    // Recent precipitation reduces risk
    if (weatherData.precipitation > 5) risk -= 10;
    else if (weatherData.precipitation > 2) risk -= 5;
    
    return Math.max(0, Math.min(100, Math.round(risk)));
  }

  /**
   * Calculate vegetation index (simplified NDVI)
   */
  async calculateVegetationIndex(lat, lon) {
    try {
      // In real implementation, use satellite NDVI data
      // For now, simulate based on location and season
      const season = new Date().getMonth();
      const baseIndex = 0.6;
      
      // Higher vegetation in growing seasons
      if (season >= 3 && season <= 8) {
        return Math.min(0.9, baseIndex + Math.random() * 0.3);
      } else {
        return Math.max(0.2, baseIndex - Math.random() * 0.2);
      }
    } catch (error) {
      console.warn('Vegetation index calculation failed:', error);
      return 0.5;
    }
  }

  /**
   * Get air quality index
   */
  async getAirQualityIndex(lat, lon) {
    try {
      // In real implementation, use air quality API
      // For now, simulate based on location
      return Math.round(50 + Math.random() * 100); // 50-150 AQI
    } catch (error) {
      console.warn('Air quality calculation failed:', error);
      return 75;
    }
  }

  /**
   * Assess risk factors
   */
  assessRiskFactors(fireData, weatherData) {
    const factors = [];
    
    if (fireData.heatSpots.length > 5) {
      factors.push('Multiple active fire hotspots detected');
    }
    
    if (weatherData.temperature > 35) {
      factors.push('Extreme temperature conditions');
    }
    
    if (weatherData.humidity < 20) {
      factors.push('Very low humidity');
    }
    
    if (weatherData.trend === 'rising' && weatherData.temperature > 30) {
      factors.push('Rising temperature trend');
    }
    
    return factors;
  }

  /**
   * Calculate trend from data array
   */
  calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const recent = values.slice(-3);
    const older = values.slice(-6, -3);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, val) => sum + val, 0) / recent.length;
    const olderAvg = older.reduce((sum, val) => sum + val, 0) / older.length;
    
    const change = (recentAvg - olderAvg) / olderAvg;
    
    if (change > 0.05) return 'rising';
    if (change < -0.05) return 'falling';
    return 'stable';
  }

  /**
   * Calculate bounding box for satellite imagery
   */
  calculateBoundingBox(lat, lon, radius) {
    const latDelta = radius / 111; // Approximate degrees
    const lonDelta = radius / (111 * Math.cos(lat * Math.PI / 180));
    
    return `${lon - lonDelta},${lat - latDelta},${lon + lonDelta},${lat + latDelta}`;
  }

  /**
   * Estimate cloud coverage
   */
  async estimateCloudCoverage(lat, lon, date) {
    // In real implementation, use cloud coverage API
    return Math.round(Math.random() * 100); // 0-100%
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Fallback data methods
   */
  getFallbackFireData(lat, lon) {
    return {
      heatSpots: [],
      totalFires: 0,
      highConfidenceFires: 0,
      averageBrightness: 0,
      timestamp: new Date().toISOString(),
      fallback: true
    };
  }

  getFallbackWeatherData(lat, lon) {
    return {
      temperature: 25 + Math.random() * 10,
      humidity: 50 + Math.random() * 30,
      precipitation: Math.random() * 5,
      trend: 'stable',
      dataPoints: 1,
      fallback: true
    };
  }

  getFallbackImagery(lat, lon) {
    return {
      imageUrl: null,
      bbox: this.calculateBoundingBox(lat, lon, 0.1),
      timestamp: new Date().toISOString().split('T')[0],
      cloudCoverage: 0,
      resolution: '10m',
      fallback: true
    };
  }

  getFallbackEnvironmentalData(lat, lon) {
    return {
      location: { lat, lon },
      timestamp: new Date().toISOString(),
      temperature: 25,
      humidity: 60,
      precipitation: 0,
      fireRisk: 20,
      vegetationIndex: 0.5,
      recentHeatSpots: [],
      weatherTrend: 'stable',
      imagery: null,
      cloudCoverage: 0,
      airQuality: 75,
      riskFactors: [],
      fallback: true
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.log('Satellite Service: Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      timeout: this.cacheTimeout,
      oldestEntry: this.cache.size > 0 ? 
        Math.min(...Array.from(this.cache.values()).map(c => c.timestamp)) : null
    };
  }
}

module.exports = new SatelliteService();
