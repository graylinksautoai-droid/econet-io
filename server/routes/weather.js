/**
 * Weather routes — real OpenWeather integration for Lilo and the app.
 *
 *   GET /api/weather?location=Kubwa%20Abuja
 *   GET /api/weather?lat=9.14&lon=7.32
 *
 * Returns current conditions plus an aggregated forecast for TOMORROW
 * (local time at the location, using the provider's timezone offset).
 *
 * Honesty rules:
 * - 503 when OPENWEATHER_API_KEY is absent (capability unavailable).
 * - 404 when the location cannot be geocoded.
 * - 502 when the provider fails.
 * - Responses never include precise coordinates — city-level naming only.
 *
 * This is REAL provider data (api.openweathermap.org). No fabricated weather.
 */
import express from 'express';
import axios from 'axios';

const router = express.Router();

const KEY = () => process.env.OPENWEATHER_API_KEY || '';

async function geocode(locationText) {
  const res = await axios.get('https://api.openweathermap.org/geo/1.0/direct', {
    params: { q: locationText, limit: 1, appid: KEY() },
    timeout: 10_000
  });
  if (!Array.isArray(res.data) || res.data.length === 0) return null;
  const g = res.data[0];
  return { lat: g.lat, lon: g.lon, name: g.name, country: g.country, state: g.state || null };
}

async function currentWeather(lat, lon) {
  const res = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
    params: { lat, lon, appid: KEY(), units: 'metric' },
    timeout: 10_000
  });
  const d = res.data;
  return {
    tempC: Math.round(d.main?.temp ?? 0),
    feelsLikeC: Math.round(d.main?.feels_like ?? 0),
    humidityPct: d.main?.humidity ?? null,
    windKph: d.wind?.speed != null ? Math.round(d.wind.speed * 3.6) : null,
    condition: d.weather?.[0]?.description || 'unknown',
    observedAt: d.dt ? new Date(d.dt * 1000).toISOString() : null
  };
}

/** Aggregate the provider's 3-hour forecast steps into a tomorrow summary. */
async function tomorrowForecast(lat, lon) {
  const res = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
    params: { lat, lon, appid: KEY(), units: 'metric' },
    timeout: 10_000
  });
  const tzOffsetSec = res.data.city?.timezone ?? 0;
  const nowLocal = new Date(Date.now() + tzOffsetSec * 1000);
  const tomorrow = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate() + 1));
  const dayAfter = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate() + 2));

  const steps = (res.data.list || []).filter(s => {
    const local = new Date(s.dt * 1000 + tzOffsetSec * 1000);
    return local >= tomorrow && local < dayAfter;
  });
  if (steps.length === 0) return null;

  const temps = steps.map(s => s.main?.temp).filter(Number.isFinite);
  const rainChance = Math.max(...steps.map(s => Math.round((s.pop ?? 0) * 100)));
  // Dominant condition = most frequent weather main across the day.
  const freq = new Map();
  for (const s of steps) {
    const c = s.weather?.[0]?.description || 'unknown';
    freq.set(c, (freq.get(c) || 0) + 1);
  }
  const dominant = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

  return {
    date: tomorrow.toISOString().slice(0, 10),
    tempMinC: Math.round(Math.min(...temps)),
    tempMaxC: Math.round(Math.max(...temps)),
    rainChancePct: rainChance,
    condition: dominant
  };
}

router.get('/', async (req, res) => {
  if (!KEY()) {
    return res.status(503).json({ success: false, code: 'WEATHER_NOT_CONFIGURED',
      message: 'Weather capability is not configured on this deployment.' });
  }
  try {
    let geo = null;
    const { location, lat, lon } = req.query;

    if (location && typeof location === 'string' && location.trim()) {
      geo = await geocode(location.trim().slice(0, 120));
      if (!geo) {
        return res.status(404).json({ success: false, code: 'LOCATION_NOT_FOUND',
          message: `Could not find a location matching "${location.trim()}".` });
      }
    } else if (lat != null && lon != null && Number.isFinite(+lat) && Number.isFinite(+lon)) {
      geo = { lat: +lat, lon: +lon, name: null, country: null, state: null };
    } else {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR',
        message: 'Provide ?location=<place> or ?lat=<>&lon=<>.' });
    }

    const [current, tomorrow] = await Promise.all([
      currentWeather(geo.lat, geo.lon),
      tomorrowForecast(geo.lat, geo.lon).catch(() => null)
    ]);

    return res.json({
      success: true,
      data: {
        location: { name: geo.name, state: geo.state, country: geo.country },
        current,
        tomorrow,
        source: 'openweathermap',
        fetchedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[weather] provider error:', err.message);
    return res.status(502).json({ success: false, code: 'PROVIDER_ERROR',
      message: 'Weather provider request failed.' });
  }
});

export default router;
