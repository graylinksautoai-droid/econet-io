import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * LILO Regional Service - Autonomous Regional Configuration
 * Handles regional detection, configuration, and authority discovery
 */
class LiloRegionalService {
  constructor() {
    this.regionCache = new Map();
    this.configPath = path.join(__dirname, '../data/regional_master.json');
    this.masterConfig = null;
    this.loadMasterConfig();
  }

  /**
   * Load master regional configuration
   */
  async loadMasterConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.masterConfig = JSON.parse(data);
      console.log('LILO Regional: Master config loaded');
    } catch (error) {
      console.error('LILO Regional: Failed to load master config:', error);
      this.masterConfig = {};
    }
  }

  /**
   * Initialize region configuration
   */
  async initializeRegion(country) {
    if (!country) {
      return this.getDefaultConfig();
    }

    // Check cache first
    if (this.regionCache.has(country)) {
      console.log(`LILO Regional: Returning cached config for ${country}`);
      return this.regionCache.get(country);
    }

    // Check master configuration
    if (this.masterConfig[country]) {
      const config = this.masterConfig[country];
      this.regionCache.set(country, config);
      console.log(`LILO Regional: Found master config for ${country}`);
      return config;
    }

    // Auto-discover region if not in master config
    console.log(`LILO Regional: Auto-discovering config for ${country}`);
    const discoveredConfig = await this.discoverRegion(country);
    this.regionCache.set(country, discoveredConfig);
    return discoveredConfig;
  }

  /**
   * Auto-discover regional configuration using external APIs
   */
  async discoverRegion(country) {
    try {
      // Use OpenStreetMap Nominatim API for basic discovery
      const searchQuery = encodeURIComponent(`${country} emergency services fire department environmental agency`);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${searchQuery}&limit=5`,
        {
          headers: {
            'User-Agent': 'EcoNet/1.0'
          }
        }
      );

      if (response.ok) {
        const places = await response.json();
        const authorities = this.extractAuthoritiesFromPlaces(places);
        
        return {
          units: "metric", // Default to metric
          hazardTypes: ["flood", "fire", "drought", "environmental"],
          authorities: authorities,
          ngos: [],
          uiLabels: {
            temperature: "°C",
            distance: "km",
            speed: "km/h",
            pressure: "hPa",
            humidity: "%",
            wind: "Wind Speed",
            visibility: "Visibility",
            airQuality: "Air Quality Index"
          },
          emergencyNumbers: ["112"],
          timezone: "UTC",
          language: "en",
          autoDiscovered: true
        };
      }
    } catch (error) {
      console.warn(`LILO Regional: Discovery failed for ${country}:`, error);
    }

    // Return default config if discovery fails
    return this.getDefaultConfig();
  }

  /**
   * Extract authority information from OpenStreetMap places
   */
  extractAuthoritiesFromPlaces(places) {
    const authorities = [];
    const seen = new Set();

    for (const place of places) {
      const name = place.display_name.split(',')[0];
      const key = name.toLowerCase();

      if (seen.has(key)) continue;

      // Categorize based on name
      let type = 'emergency';
      if (name.toLowerCase().includes('fire')) {
        type = 'fire';
      } else if (name.toLowerCase().includes('environmental') || name.toLowerCase().includes('epa')) {
        type = 'environmental';
      } else if (name.toLowerCase().includes('weather') || name.toLowerCase().includes('meteorological')) {
        type = 'weather';
      }

      authorities.push({
        name: name,
        type: type,
        contactAPI: `https://placeholder-api.example.com/incidents/${encodeURIComponent(name)}`,
        phone: "+000-000-0000", // Placeholder
        discovered: true
      });

      seen.add(key);
    }

    return authorities.slice(0, 3); // Limit to 3 authorities
  }

  /**
   * Get default regional configuration
   */
  getDefaultConfig() {
    return {
      units: "metric",
      hazardTypes: ["flood", "fire", "drought", "environmental"],
      authorities: [
        {
          name: "Local Emergency Services",
          type: "emergency",
          contactAPI: "https://placeholder-api.example.com/incidents",
          phone: "112"
        }
      ],
      ngos: [],
      uiLabels: {
        temperature: "°C",
        distance: "km",
        speed: "km/h",
        pressure: "hPa",
        humidity: "%",
        wind: "Wind Speed",
        visibility: "Visibility",
        airQuality: "Air Quality Index"
      },
      emergencyNumbers: ["112"],
      timezone: "UTC",
      language: "en",
      isDefault: true
    };
  }

  /**
   * Notify authorities about a new report
   */
  async notifyAuthorities(report, regionConfig) {
    if (!regionConfig || !regionConfig.authorities) {
      console.log('LILO Regional: No authorities configured for notification');
      return;
    }

    const notifications = [];

    // Find relevant authorities based on hazard type
    const relevantAuthorities = this.getRelevantAuthorities(report.category, regionConfig.authorities);

    for (const authority of relevantAuthorities) {
      try {
        // Create notification payload
        const payload = {
          incident: {
            id: report._id,
            type: report.category,
            severity: report.severity,
            urgency: report.urgency,
            location: report.location,
            description: report.description || report.content,
            timestamp: report.createdAt,
            reporter: {
              name: report.authorName || 'Anonymous',
              trustScore: report.trustScore || 0
            }
          },
          source: 'EcoNet',
          timestamp: new Date().toISOString()
        };

        // Send notification (mock implementation)
        console.log(`LILO Regional: Notifying ${authority.name} about ${report.category} incident`);
        
        if (authority.contactAPI && !authority.contactAPI.includes('placeholder-api')) {
          // Real API call
          const response = await fetch(authority.contactAPI, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'EcoNet/1.0'
            },
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            notifications.push({
              authority: authority.name,
              status: 'sent',
              timestamp: new Date().toISOString()
            });
          } else {
            notifications.push({
              authority: authority.name,
              status: 'failed',
              error: `HTTP ${response.status}`,
              timestamp: new Date().toISOString()
            });
          }
        } else {
          // Mock notification
          notifications.push({
            authority: authority.name,
            status: 'mocked',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error(`LILO Regional: Failed to notify ${authority.name}:`, error);
        notifications.push({
          authority: authority.name,
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return notifications;
  }

  /**
   * Get relevant authorities for a hazard type
   */
  getRelevantAuthorities(hazardType, authorities) {
    const hazardTypeLower = hazardType.toLowerCase();
    
    // Priority mapping for hazard types to authority types
    const priorityMap = {
      'fire': ['fire', 'emergency'],
      'flood': ['emergency', 'weather'],
      'drought': ['weather', 'environmental'],
      'oil_spill': ['environmental', 'emergency'],
      'erosion': ['environmental'],
      'deforestation': ['environmental'],
      'landslide': ['emergency', 'environmental'],
      'wildfire': ['fire', 'emergency'],
      'hurricane': ['weather', 'emergency'],
      'tornado': ['weather', 'emergency'],
      'earthquake': ['emergency'],
      'pollution': ['environmental'],
      'air quality': ['environmental', 'weather']
    };

    const relevantTypes = priorityMap[hazardTypeLower] || ['emergency'];
    
    return authorities
      .filter(authority => relevantTypes.includes(authority.type))
      .slice(0, 2); // Limit to 2 most relevant authorities
  }

  /**
   * Clear region cache
   */
  clearCache() {
    this.regionCache.clear();
    console.log('LILO Regional: Cache cleared');
  }

  /**
   * Get cached region
   */
  getCachedRegion(country) {
    return this.regionCache.get(country);
  }
}

// Export singleton instance
const liloRegionalService = new LiloRegionalService();
export default liloRegionalService;
