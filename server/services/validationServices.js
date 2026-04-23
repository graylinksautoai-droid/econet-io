import axios from 'axios';

const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const NASA_FIRMS_API_KEY = process.env.NASA_FIRMS_API_KEY; // new
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// Geocode location (unchanged)
export async function geocodeLocation(locationText) {
  if (!WEATHER_API_KEY) return null;
  try {
    const response = await axios.get(`https://api.openweathermap.org/geo/1.0/direct`, {
      params: {
        q: locationText,
        limit: 1,
        appid: WEATHER_API_KEY
      }
    });
    if (response.data.length > 0) {
      return {
        lat: response.data[0].lat,
        lon: response.data[0].lon
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return null;
  }
}

// Get current weather (improved with precipitation detection)
export async function getWeatherData(lat, lon) {
  if (!WEATHER_API_KEY) return null;
  try {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
      params: {
        lat,
        lon,
        appid: WEATHER_API_KEY,
        units: 'metric'
      }
    });
    const data = response.data;
    // Extract rain volume (if any) – OpenWeatherMap provides rain.1h or rain.3h [citation:3]
    const rain = data.rain ? (data.rain['1h'] || data.rain['3h'] || 0) : 0;
    return {
      ...data,
      precipitation: rain  // add a custom field for convenience
    };
  } catch (error) {
    console.error('Weather API error:', error.message);
    return null;
  }
}

// Real satellite check using NASA FIRMS
export async function checkSatelliteData(category, lat, lon) {
  if (category !== 'Fire') return null;
  if (!NASA_FIRMS_API_KEY) {
    console.warn('NASA FIRMS API key missing – skipping satellite check');
    return null;
  }

  try {
    // Define a bounding box around the location (approx 0.5° in each direction)
    const buffer = 0.5;
    const west = lon - buffer;
    const south = lat - buffer;
    const east = lon + buffer;
    const north = lat + buffer;
    const areaCoord = `${west},${south},${east},${north}`;

    // Query FIRMS for the last 1 day (day_range=1) using VIIRS for higher resolution [citation:6]
    const response = await axios.get(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${NASA_FIRMS_API_KEY}/VIIRS_SNPP_NRT/${areaCoord}/1`, {
      timeout: 10000
    });

    // The response is CSV text – we'll parse the first line to see if there are hotspots
    const lines = response.data.split('\n');
    if (lines.length < 2) {
      return { fireDetected: false, count: 0 };
    }

    // Skip header, count rows with data
    const hotspots = lines.slice(1).filter(line => line.trim() !== '').length;
    const fireDetected = hotspots > 0;

    // Optionally, parse the first hotspot for more details (confidence, FRP) [citation:6][citation:7]
    let firstHotspot = null;
    if (fireDetected) {
      const columns = lines[1].split(',');
      firstHotspot = {
        latitude: columns[0],
        longitude: columns[1],
        confidence: columns[8] || 'unknown',
        frp: columns[11] || 0, // Fire Radiative Power [citation:6]
        type: columns[13] || 0   // For VIIRS, type indicates vegetation/volcano/static [citation:6]
      };
    }

    return {
      fireDetected,
      count: hotspots,
      firstHotspot,
      raw: response.data.substring(0, 500) // preview (optional)
    };
  } catch (error) {
    console.error('NASA FIRMS API error:', error.message);
    return null;
  }
}

// Search news (unchanged)
export async function searchNews(query) {
  if (!NEWS_API_KEY) return [];
  try {
    const response = await axios.get(`https://newsapi.org/v2/everything`, {
      params: {
        q: query,
        language: 'en',
        sortBy: 'relevancy',
        pageSize: 5,
        apiKey: NEWS_API_KEY
      }
    });
    return response.data.articles;
  } catch (error) {
    console.error('News API error:', error.message);
    return [];
  }
}