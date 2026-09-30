// Load environment variables FIRST — before any module that reads process.env
// at import time (CanonicalPersistenceConfig, DevAuthStore, etc.).
// 'dotenv/config' runs dotenv.config() synchronously as a side-effect import,
// ensuring the .env file is loaded before any downstream module evaluation.
import 'dotenv/config';

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
import paymentsRoutes from './routes/payments.js';
import profileRoutes from './routes/profile.js';
import uploadRoutes from './routes/upload.js';
import healthRoutes from './routes/health.js';
import regionRoutes from './routes/region.js';
import liloRoutes   from './routes/lilo.js';
import weatherRoutes from './routes/weather.js';
import chatRoutes from './routes/chat.js';
// ─── Canonical API v2 routes ──────────────────────────────────────────────────
import missionsV2Routes from './routes/v2/missions.js';
import communitiesV2Routes from './routes/v2/communities.js';
import simulationV2Routes from './routes/v2/simulation.js';
import economyRoutes from './routes/economy.js';

dotenv.config();

// GROQ_API_KEY is required only for LILO AI analysis (/analyze-report).
// We warn on startup when it is absent but do NOT terminate the process —
// all other routes (auth, reports, map, missions, etc.) must remain available
// even when the LILO AI key is not configured.
if (!process.env.GROQ_API_KEY) {
  console.warn(
    '[server] GROQ_API_KEY is not set. ' +
    'The /analyze-report endpoint will return 503 until the key is provided. ' +
    'All other routes are unaffected.'
  );
}

const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;

// Connect to MongoDB.
// In production, a failed connection is fatal — all legacy routes (auth, reports,
// map, profile) depend on MongoDB. The process exits so the orchestrator can restart
// with the correct environment.
// During local development, if MONGODB_URI is absent, a warning is printed and the
// server starts without legacy MongoDB routes so Vite + canonical v2 routes work.
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI, {
    // Do NOT set tls:true or tlsAllowInvalidCertificates — the Atlas SRV URI
    // enables TLS automatically. Forcing these options causes an OpenSSL TLS
    // alert (error 80) on Node.js 24 / OpenSSL 3.x.
    retryWrites: true,
    w: 'majority',
    // M0 free clusters can take up to 30s to wake from auto-pause.
    serverSelectionTimeoutMS: 45000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
    maxPoolSize: 10,
    // Force IPv4 to avoid ETIMEDOUT on IPv6 interfaces
    family: 4
  })
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => {
      console.error('❌ MongoDB connection error:', err.message);
      if (process.env.NODE_ENV === 'production') {
        console.error('Exiting — MongoDB is required in production.');
        process.exit(1);
      } else {
        console.warn(
          '[server] MongoDB unavailable. Legacy routes (auth/reports/profile/map) will return 503. ' +
          'Canonical v2 routes and Lilo AI analysis remain available.'
        );
      }
    });
} else {
  console.warn(
    '[server] MONGODB_URI is not set. ' +
    'Legacy routes requiring MongoDB will return 503. ' +
    'Set MONGODB_URI to enable full functionality.'
  );
}

const app = express();
const httpServer = createServer(app); //  Wrap express app in HTTP server

// Allowed CORS origins — shared by Express and Socket.io.
// FRONTEND_URL can be set in the environment to add a production frontend.
const allowedOrigins = [
  'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176',
  'http://127.0.0.1:61337', 'http://localhost:61337', 'http://127.0.0.1:49617', 'http://127.0.0.1:49618',
  'https://econet.netlify.app',
  'https://www.econet.netlify.app',
];
if (process.env.FRONTEND_URL && !allowedOrigins.includes(process.env.FRONTEND_URL)) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Socket.io Configuration
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

// Make 'io' accessible in your routes
app.set('socketio', io);

io.on("connection", (socket) => {
  console.log(" Sentinel Node Connected:", socket.id);
  // Allow clients to join a specific chat conversation room for real-time delivery.
  socket.on("chat:join", (conversationId) => {
    if (typeof conversationId === 'string' && conversationId.length < 200) {
      socket.join(`chat:${conversationId}`);
    }
  });
  socket.on("chat:leave", (conversationId) => {
    if (typeof conversationId === 'string') socket.leave(`chat:${conversationId}`);
  });
  socket.on("disconnect", () => console.log(" Node Offline"));
});

// CORS configuration — allowlist includes local dev ports + known production origins.
// Set FRONTEND_URL in the environment to add a custom production frontend origin.
const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
// The Paystack webhook requires the EXACT raw body for HMAC-SHA512 signature
// verification, so it must receive express.raw() before express.json() runs.
// Only this one path gets the raw parser — global body security is unchanged.
app.use('/api/payments/webhook', express.raw({ type: 'application/json', limit: '256kb' }));
// Increase limit to 10mb to accommodate social posts that embed image data.
// The canonical fix is to upload images separately via /api/upload/image, but
// the current frontend sends base64 inline. 10mb covers typical images.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Groq client is created lazily inside the /analyze-report handler so that
// a missing GROQ_API_KEY only fails that specific route, not the whole server.

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

// Weather helpers moved to routes/weather.js (wired to GET /api/weather).
// The previous checkSatelliteData() fabricated results with Math.random() and
// has been removed — EcoNet never simulates satellite verification.

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
app.use('/api/payments', paymentsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/region', regionRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/health', healthRoutes);

initVapid();
app.use('/api/notifications', notificationRoutes);

// ─── Canonical API v2 ─────────────────────────────────────────────────────────
app.use('/api/v2/missions', missionsV2Routes);
app.use('/api/v2/communities', communitiesV2Routes);
app.use('/api/v2/simulation', simulationV2Routes);
app.use('/api/economy', economyRoutes);
app.use('/api/lilo', liloRoutes);
app.use('/api/chat', chatRoutes);

app.post("/analyze-report", async (req, res) => {
  // Guard: this route requires GROQ_API_KEY; other routes remain available without it.
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({
      error: "AI analysis unavailable",
      message: "GROQ_API_KEY is not configured on this server. Report submission still works; AI classification is disabled."
    });
  }

  // Lazy initialisation — client is only created when the key is present and the
  // route is actually called. This prevents a startup crash when the key is absent.
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: "Description is required" });

    console.log("📝 Analyzing:", description.substring(0, 50) + "...");
    const completion = await groq.chat.completions.create({
      model: "qwen/qwen3.8-27b",
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
    console.error("Status:", error.status || error.statusCode || 'unknown');
    console.error("Message:", error.message?.substring(0, 200));
    res.status(500).json({ error: "AI analysis failed" });
  }
});

import { seedDevMissions } from './canonical/engines.js';

/**
 * Idempotent catalog seed — runs only when MongoDB is available and the
 * marketplace_products collection is empty. Never deletes existing records.
 */
async function seedCatalogIfEmpty() {
  try {
    // Only run when the legacy Mongoose connection is live (same connection
    // used by the marketplace routes).
    if (mongoose.connection.readyState !== 1) return;

    const { default: Product } = await import('./models/Product.js');
    const count = await Product.countDocuments();
    if (count > 0) return; // already seeded

    const CATALOG = [
      { slug: 'mixed-fruits',        name: 'Mixed Fruits',                seller: 'EcoFarms NG',           category: 'produce',   description: 'Seasonal mixed fruits sourced from verified eco-farms.',                                       priceMinor: 250000,  image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400&q=70', stock: 50 },
      { slug: 'organic-vegetables',  name: 'Organic Vegetables',          seller: 'GreenLeaf Farms',       category: 'produce',   description: 'Pesticide-free vegetables grown using sustainable methods.',                                    priceMinor: 180000,  image: 'https://images.unsplash.com/photo-1597362925123-77861d3fbac7?w=400&q=70', stock: 40 },
      { slug: 'local-honey',         name: 'Local Honey',                 seller: 'BeeFarm Nigeria',       category: 'produce',   description: 'Pure honey from community-owned beehives in rural Nigeria.',                                   priceMinor: 350000,  image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&q=70', stock: 30 },
      { slug: 'solar-lantern',       name: 'Solar Lantern',               seller: 'SunPower NG',           category: 'renewable', description: 'Portable solar-charged lantern, 8 hour run time. Off-grid communities.',                        priceMinor: 1500000, image: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400&q=70', stock: 25 },
      { slug: 'water-purifier',      name: 'Water Purification Tablets',  seller: 'CleanWater Initiative', category: 'renewable', description: '50-tablet pack. Treats up to 50 litres of drinking water.',                                    priceMinor: 80000,   image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400&q=70', stock: 100 },
      { slug: 'tree-seedlings',      name: 'Tree Seedling Pack (×10)',    seller: 'GreenNation',           category: 'renewable', description: 'Ten native tree seedlings for reforestation and climate missions.',                             priceMinor: 120000,  image: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&q=70', stock: 200 },
    ];

    for (const item of CATALOG) {
      await Product.findOneAndUpdate(
        { slug: item.slug },
        { $setOnInsert: { ...item, currency: 'NGN', active: true, createdAt: new Date() } },
        { upsert: true, new: false }
      );
    }
    console.log(`[server] Marketplace catalog seeded: ${CATALOG.length} products.`);
  } catch (err) {
    console.warn('[server] Catalog seed skipped (non-fatal):', err.message);
  }
}

// ✅ USE httpServer.listen instead of app.listen
httpServer.listen(5000, async () => {
  console.log("✅ EcoNet server running on http://localhost:5000");
  console.log("📡 Real-time Sentinel Mesh Active");
  // Seed dev missions after server starts (dotenv is loaded by this point)
  await seedDevMissions();
  // Seed catalog after mongoose connects — use a delayed check
  setTimeout(() => seedCatalogIfEmpty().catch(() => {}), 5000);
});