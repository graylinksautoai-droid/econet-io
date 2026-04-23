import Queue from 'bull';
import { geocodeLocation, getWeatherData, checkSatelliteData, searchNews } from '../services/validationServices.js';
import Report from '../models/Report.js';

const validationQueue = new Queue('report validation', 'redis://172.31.207.41:6379');

validationQueue.process(async (job) => {
  const { reportId, description, locationText, category } = job.data;
  console.log(`🔍 Validating report ${reportId}...`);

  try {
    const coords = await geocodeLocation(locationText);
    if (coords) {
      await Report.findByIdAndUpdate(reportId, {
        'location.lat': coords.lat,
        'location.lon': coords.lon
      });
    }

    let weatherData = null;
    let satelliteData = null;
    let newsArticles = [];

    if (category === 'Flood' && coords) {
      weatherData = await getWeatherData(coords.lat, coords.lon);
    }
    if (category === 'Fire' && coords) {
      satelliteData = await checkSatelliteData(category, coords.lat, coords.lon);
    }

    const keywords = description.split(' ').slice(0,5).join(' ');
    newsArticles = await searchNews(keywords + ' ' + locationText);

    let adjustedScore = 50;
    if (weatherData && weatherData.rain) adjustedScore += 10;
    if (satelliteData && satelliteData.fireDetected) adjustedScore += 15;
    if (newsArticles.length > 0) adjustedScore += 5 * Math.min(newsArticles.length,3);

    await Report.findByIdAndUpdate(reportId, {
      'aiVerification.weatherData': weatherData,
      'aiVerification.satelliteData': satelliteData,
      'aiVerification.newsArticles': newsArticles,
      'aiVerification.score': adjustedScore
    });

    console.log(`✅ Validation complete for report ${reportId}`);
  } catch (error) {
    console.error(`❌ Validation job error for report ${reportId}:`, error);
  }
});

export default validationQueue;