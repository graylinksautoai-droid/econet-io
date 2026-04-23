import express from "express";
import { createServer } from "http"; // 👈 Added for Socket.io
import { Server } from "socket.io"; // 👈 Added for Socket.io
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { agencies, findAgenciesForLocation } from './agencies.js';
import authRoutes from './routes/auth.js';
import reportRoutes from './routes/reports.js';
import voteRoutes from './routes/votes.js';
import userRoutes from './routes/users.js';
import commentRoutes from './routes/comments.js';
import mapRoutes from './routes/map.js';
import notificationRoutes, { initVapid } from './routes/notifications.js';
import validationQueue from './queues/validationQueue.js';
import marketplaceRoutes from './routes/marketplace.js';
import profileRoutes from './routes/profile.js';
import uploadRoutes from './routes/upload.js';
import healthRoutes from './routes/health.js';
import regionRoutes from './routes/region.js';

dotenv.config();

// Check for required environment variables
if (!process.env.GROQ_API_KEY) {
  console.error(" GROQ_API_KEY is missing in .env file!");
  process.exit(1);
}

const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// Connect to MongoDB with TLS options
mongoose.connect(process.env.MONGODB_URI, {
  tls: true,
  tlsAllowInvalidCertificates: true,
  retryWrites: true,
  w: 'majority'
})
  .then(() => console.log(" Connected to MongoDB"))
  .catch(err => {
    console.error(" MongoDB connection error:", err.message);
    process.exit(1);
  });

const app = express();
const httpServer = createServer(app); //  Wrap express app in HTTP server

// Socket.io Configuration
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://127.0.0.1:61337', 'http://localhost:61337', 'http://127.0.0.1:49617', 'http://127.0.0.1:49618'],
    credentials: true
  }
});

// Make 'io' accessible in your routes
app.set('socketio', io);

io.on("connection", (socket) => {
  console.log(" Sentinel Node Connected:", socket.id);
  socket.on("disconnect", () => console.log(" Node Offline"));
});

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176',
    'http://127.0.0.1:61337', 'http://localhost:61337', 'http://127.0.0.1:49617', 'http://127.0.0.1:49618',
    'https://econet.netlify.app',
    'https://www.econet.netlify.app',
  ],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ===== HELPER FUNCTIONS (UNCHANGED) =====
function extractLocation(text) {
  const locationMatch = text.match(/Location: (.*?)(?:$|\.)/i);
  return locationMatch ? locationMatch[1].trim() : "Unknown location";
}

function parseLocation(locationStr) {
  const result = { country: "Nigeria", state: "", city: "", full: locationStr };
  if (!locationStr || locationStr === "Unknown location") return result;
  const cityStateMap = { "abuja": { state: "FCT", city: "Abuja" }, "lagos": { state: "Lagos", city: "Lagos" } };
  const lowerLoc = locationStr.toLowerCase().trim();
  for (const [key, value] of Object.entries(cityStateMap)) {
    if (lowerLoc.includes(key)) { result.state = value.state; result.city = value.city; break; }
  }
  return result;
}

async function geocodeLocation(locationText) {
  if (!WEATHER_API_KEY) return null;
  try {
    const response = await axios.get(`https://api.openweathermap.org/geo/1.0/direct`, {
      params: { q: locationText, limit: 1, appid: WEATHER_API_KEY }
    });
    return response.data.length > 0 ? { lat: response.data[0].lat, lon: response.data[0].lon } : null;
  } catch (error) { return null; }
}

async function getWeatherData(lat, lon) {
  if (!WEATHER_API_KEY) return null;
  try {
    const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
      params: { lat, lon, appid: WEATHER_API_KEY, units: 'metric' }
    });
    return response.data;
  } catch (error) { return null; }
}

async function checkSatelliteData(category, lat, lon) {
  if (category !== 'Fire') return null;
  return { fireDetected: Math.random() > 0.5 };
}

async function searchNews(query) {
  if (!NEWS_API_KEY) return [];
  try {
    const response = await axios.get(`https://newsapi.org/v2/everything`, {
      params: { q: query, language: 'en', sortBy: 'relevancy', pageSize: 5, apiKey: NEWS_API_KEY }
    });
    return response.data.articles;
  } catch (error) { return []; }
}

async function sendReportToAuthority(reportData, originalDescription) {
  // your existing implementation
}

// ===== ROUTES =====
app.get("/", (req, res) => {
  res.json({ message: "EcoNet API is running with Groq and Real-time Mesh! " });
});

app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/votes', voteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/region', regionRoutes);
app.use('/health', healthRoutes);

initVapid();
app.use('/api/notifications', notificationRoutes);

app.post("/analyze-report", async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: "Description is required" });

    console.log("📝 Analyzing:", description.substring(0, 50) + "...");
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a climate risk classification AI. Based on the description, return JSON with:
{
  "category": "Flood | Drought | Fire | Pollution | Storm | Other",
  "severity": "Low | Moderate | Critical",
  "urgency": "Low | Medium | Immediate | Observation | TemporaryRelief",
  "confidence": 0.95,
  "recommendedAuthority": "Name of agency that should respond",
  "summary": "Brief one-sentence summary"
}`
        },
        { role: "user", content: description }
      ],
      temperature: 0.1,
      max_tokens: 500
    });

    const result = completion.choices[0]?.message?.content;
    let jsonResult;
    try {
      let cleanedResult = result.replace(/```json\n?|\n?```/g, '').trim();
      jsonResult = JSON.parse(cleanedResult);
    } catch (e) {
      jsonResult = { category: "Other", severity: "Moderate", summary: description.substring(0, 100) };
    }

    // 📣 BROADCAST THE SIGNAL TO COMMAND CENTER
    const socketio = req.app.get('socketio');
    socketio.emit('new_report', {
      ...jsonResult,
      description,
      timestamp: new Date(),
      // Adding default demo coordinates (Abuja)
      location: { type: 'Point', coordinates: [7.4951, 9.0579] }
    });

    sendReportToAuthority(jsonResult, description).catch(err => console.error("📧 Email error:", err.message));
    res.json(jsonResult);

  } catch (error) {
    console.error("========== GROQ ERROR ==========");
    res.status(500).json({ error: "AI analysis failed" });
  }
});

// ✅ USE httpServer.listen instead of app.listen
httpServer.listen(5000, () => {
  console.log("✅ EcoNet server running on http://localhost:5000");
  console.log("📡 Real-time Sentinel Mesh Active");
});