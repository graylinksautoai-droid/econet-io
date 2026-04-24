import { getStore } from '@netlify/blobs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
};

const seededUsers = [
  {
    id: 'demo-user',
    name: 'Demo User',
    email: 'demo@econet.io',
    password: 'password123',
    avatar: 'https://via.placeholder.com/150',
    bio: '',
    phone: '',
    location: '',
    website: '',
    verifiedReporter: true,
    reputation: {
      trustScore: 85,
      verifiedReports: 12,
      totalReports: 20,
      leaves: 340,
      ecoCoins: 90,
      seeds: 90
    },
    settings: {
      security: {
        e2eeEnabled: false,
        geospatialSalting: false
      },
      dataSync: {
        progressiveSyncPref: 'Standard',
        bitrateThrottling: false
      },
      appearance: {
        theme: 'light'
      }
    }
  }
];

const seededReports = [
  {
    id: 'netlify-demo-1',
    description: 'River overflow observed near Lokoja after prolonged rainfall.',
    category: 'Flood',
    severity: 'Moderate',
    urgency: 'Observation',
    postStatus: 'observe',
    signalSource: 'social',
    createdAt: new Date().toISOString(),
    images: [],
    media: [],
    location: { text: 'Lokoja', lat: 7.8023, lon: 6.7333 },
    aiScore: 76,
    verificationStatus: 'pending',
    likes: [],
    upvotes: [],
    downvotes: [],
    sharesCount: 0,
    comments: [],
    isLive: false,
    proofOfPresence: false,
    liloClassification: {
      isClimateRelated: true,
      confidence: 76,
      summary: 'Netlify beta LILO marked this for observation.',
      matchedSignals: ['flood', 'rainfall'],
      routedToCommand: true
    },
    userId: 'demo-user'
  }
];

const sessions = new Map();
const usersStore = getStore('econet-users');
const reportsStore = getStore('econet-reports');

async function readAllEntries(store) {
  const { blobs } = await store.list();
  const entries = await Promise.all(
    blobs.map(async ({ key }) => {
      const value = await store.get(key, { type: 'json' });
      return value ? { key, value } : null;
    })
  );

  return entries.filter(Boolean);
}

async function ensureSeedData() {
  const userEntries = await usersStore.list();
  if (userEntries.blobs.length === 0) {
    await Promise.all(
      seededUsers.map((user) => usersStore.setJSON(user.id, user, { onlyIfNew: true }))
    );
  }

  const reportEntries = await reportsStore.list();
  if (reportEntries.blobs.length === 0) {
    await Promise.all(
      seededReports.map((report) => reportsStore.setJSON(report.id, report, { onlyIfNew: true }))
    );
  }
}

async function loadUsers() {
  await ensureSeedData();
  const entries = await readAllEntries(usersStore);
  return entries.map(({ value }) => value);
}

async function loadReports() {
  await ensureSeedData();
  const entries = await readAllEntries(reportsStore);
  return entries
    .map(({ value }) => value)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function saveUser(user) {
  await usersStore.setJSON(user.id, user);
  return user;
}

async function saveReport(report) {
  await reportsStore.setJSON(report.id, report);
  return report;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function createToken(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    email: user.email,
    name: user.name,
    ts: Date.now()
  })).toString('base64url');
  const token = `econet.${payload}`;
  sessions.set(token, user.id);
  return token;
}

async function getUserFromToken(headers = {}) {
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const sessionUserId = sessions.get(token);
  if (sessionUserId) {
    const users = await loadUsers();
    return users.find((user) => user.id === sessionUserId) || null;
  }

  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const users = await loadUsers();
    return users.find((user) => user.id === decoded.id || user.email === decoded.email) || null;
  } catch {
    return null;
  }
}

function serializeUser(user) {
  return {
    id: user.id,
    _id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    phone: user.phone,
    location: user.location,
    website: user.website,
    verifiedReporter: user.verifiedReporter,
    reputation: user.reputation,
    settings: user.settings
  };
}

function calculateStanding(userReports = [], verifiedReports = 0) {
  const trustBase = userReports.reduce((total, report) => {
    const aiScore = report.aiScore || 50;
    const validationBalance = (report.upvotes?.length || 0) - (report.downvotes?.length || 0);
    const socialApproval = (report.likes?.length || 0) + (report.sharesCount || 0);
    const verificationBoost = report.verificationStatus === 'verified' ? 18 : 0;
    const liveBoost = report.isLive || report.proofOfPresence ? 1.4 : 1;
    return total + (aiScore + validationBalance * 3 + socialApproval + verificationBoost) * liveBoost;
  }, 0);

  const trustScore = userReports.length === 0
    ? 0
    : Math.max(0, Math.min(100, Math.round(trustBase / userReports.length + Math.min(20, verifiedReports * 3))));

  const leaves = userReports.reduce((total, report) => total + 5 + (report.likes?.length || 0) + (report.upvotes?.length || 0) * 2 + (report.sharesCount || 0) * 2 + (report.comments?.length || 0) + ((report.isLive || report.proofOfPresence) ? 12 : 0) + (report.verificationStatus === 'verified' ? 20 : 0), verifiedReports * 10);
  const ecoCoins = verifiedReports * 5 + userReports.reduce((total, report) => {
    if (report.verificationStatus !== 'verified') return total;
    const severityBonus = report.severity === 'Critical' ? 8 : report.severity === 'Moderate' ? 4 : 2;
    return total + severityBonus + (report.proofOfPresence ? 3 : 0);
  }, 0);

  return {
    trustScore,
    leaves,
    ecoCoins,
    verifiedReporter: trustScore >= 80 && verifiedReports >= 3
  };
}

async function refreshUserStanding(userId) {
  const users = await loadUsers();
  const reports = await loadReports();
  const user = users.find((entry) => entry.id === userId);
  if (!user) return null;

  const userReports = reports.filter((report) => report.userId === userId);
  const standing = calculateStanding(userReports, user.reputation?.verifiedReports || 0);
  user.reputation = {
    ...user.reputation,
    trustScore: standing.trustScore,
    leaves: standing.leaves,
    ecoCoins: standing.ecoCoins,
    seeds: standing.ecoCoins
  };
  user.verifiedReporter = standing.verifiedReporter;
  await saveUser(user);
  return user;
}

async function serializeReport(report) {
  const users = await loadUsers();
  const author = users.find((user) => user.id === report.userId);

  return {
    id: report.id,
    description: report.description,
    content: report.description,
    category: report.category,
    severity: report.severity,
    urgency: report.urgency,
    postStatus: report.postStatus,
    signalSource: report.signalSource,
    summary: report.liloClassification?.summary || '',
    createdAt: report.createdAt,
    timestamp: report.createdAt,
    images: report.images || [],
    media: report.media || [],
    location: report.location,
    aiScore: report.aiScore || 0,
    liloClassification: report.liloClassification,
    verificationStatus: report.verificationStatus || 'pending',
    likes: report.likes?.length || 0,
    upvotes: report.upvotes?.length || 0,
    downvotes: report.downvotes?.length || 0,
    comments: report.comments?.length || 0,
    shares: report.sharesCount || 0,
    isLive: Boolean(report.isLive),
    proofOfPresence: Boolean(report.proofOfPresence),
    user: author ? {
      id: author.id,
      name: author.name,
      avatar: author.avatar,
      verifiedReporter: author.verifiedReporter,
      trustScore: author.reputation?.trustScore || 0
    } : null
  };
}

function classifyPost(description = '') {
  const lower = description.toLowerCase();
  const climateWords = ['climate', 'flood', 'fire', 'smoke', 'pollution', 'storm', 'heatwave', 'rainfall', 'erosion'];
  const criticalWords = ['critical', 'urgent', 'emergency', 'immediate', 'danger', 'evacuate'];
  const matchedSignals = climateWords.filter((word) => lower.includes(word));
  const isClimateRelated = matchedSignals.length > 0;
  const postStatus = !isClimateRelated ? 'regular' : criticalWords.some((word) => lower.includes(word)) ? 'critical' : 'observe';

  return {
    category: isClimateRelated ? (matchedSignals[0] === 'smoke' ? 'Pollution' : matchedSignals[0]?.charAt(0).toUpperCase() + matchedSignals[0]?.slice(1) || 'Other') : 'Other',
    severity: postStatus === 'critical' ? 'Critical' : postStatus === 'observe' ? 'Moderate' : 'Low',
    urgency: postStatus === 'critical' ? 'Immediate' : postStatus === 'observe' ? 'Observation' : 'Low',
    postStatus,
    liloClassification: {
      isClimateRelated,
      confidence: isClimateRelated ? (postStatus === 'critical' ? 89 : 74) : 18,
      summary: isClimateRelated ? `LILO marked this as a ${postStatus} climate signal.` : 'LILO kept this post in the regular social feed.',
      matchedSignals,
      routedToCommand: isClimateRelated && postStatus !== 'regular'
    }
  };
}

export async function handler(event) {
  const { path, httpMethod, body, headers, queryStringParameters } = event;

  if (httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders };
  }

  try {
    if (path.endsWith('/health')) {
      return json(200, {
        status: 'ok',
        environment: 'netlify-beta',
        timestamp: new Date().toISOString()
      });
    }

    if (path.endsWith('/auth/login') && httpMethod === 'POST') {
      const users = await loadUsers();
      const { email, password } = JSON.parse(body || '{}');
      const user = users.find((entry) => entry.email === email);

      if (!user || user.password !== password) {
        return json(401, { error: 'Invalid credentials' });
      }

      const token = createToken(user);
      return json(200, {
        message: 'Login successful',
        token,
        user: serializeUser(user)
      });
    }

    if (path.endsWith('/auth/register') && httpMethod === 'POST') {
      const users = await loadUsers();
      const { name, email, password } = JSON.parse(body || '{}');

      if (users.some((entry) => entry.email === email)) {
        return json(400, { error: 'User already exists' });
      }

      const user = {
        id: `user-${Date.now()}`,
        name,
        email,
        password,
        avatar: 'https://via.placeholder.com/150',
        bio: '',
        phone: '',
        location: '',
        website: '',
        verifiedReporter: false,
        reputation: {
          trustScore: 40,
          verifiedReports: 0,
          totalReports: 0,
          leaves: 0,
          ecoCoins: 0,
          seeds: 0
        },
        settings: {
          security: { e2eeEnabled: false, geospatialSalting: false },
          dataSync: { progressiveSyncPref: 'Standard', bitrateThrottling: false },
          appearance: { theme: 'light' }
        }
      };

      await saveUser(user);
      const token = createToken(user);
      return json(201, {
        message: 'User created successfully',
        token,
        user: serializeUser(user)
      });
    }

    if (path.endsWith('/auth/profile') && httpMethod === 'GET') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      return json(200, { success: true, user: serializeUser(user) });
    }

    if (path.endsWith('/profile') && httpMethod === 'GET') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      return json(200, { success: true, data: serializeUser(user) });
    }

    if (path.endsWith('/profile') && (httpMethod === 'PUT' || httpMethod === 'PATCH')) {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      const payload = JSON.parse(body || '{}');
      Object.assign(user, {
        name: payload.name ?? user.name,
        email: payload.email ?? user.email,
        bio: payload.bio ?? user.bio,
        location: payload.location ?? user.location,
        website: payload.website ?? user.website,
        phone: payload.phone ?? user.phone,
        avatar: payload.avatar ?? user.avatar
      });
      await saveUser(user);
      return json(200, { success: true, message: 'Profile updated successfully', data: serializeUser(user) });
    }

    if (path.endsWith('/profile/settings') && httpMethod === 'GET') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      return json(200, { success: true, settings: user.settings || {}, data: user.settings || {} });
    }

    if (path.endsWith('/profile/settings') && (httpMethod === 'PUT' || httpMethod === 'PATCH')) {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      const payload = JSON.parse(body || '{}');
      const category = payload.category;
      const nextSettings = payload.settings || payload;

      if (category) {
        user.settings = { ...user.settings, [category]: nextSettings };
      } else {
        user.settings = { ...user.settings, ...nextSettings };
      }
      await saveUser(user);

      return json(200, { success: true, message: 'Settings updated successfully', settings: user.settings, data: user.settings });
    }

    if (path.endsWith('/profile/avatar') && httpMethod === 'POST') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      const payload = JSON.parse(body || '{}');
      user.avatar = payload.avatar || user.avatar;
      await saveUser(user);
      return json(200, { success: true, message: 'Avatar updated successfully', data: { avatar: user.avatar } });
    }

    if (path.endsWith('/upload/image') && httpMethod === 'POST') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      const payload = JSON.parse(body || '{}');
      return json(200, {
        success: true,
        message: 'Image stored for beta preview',
        data: {
          filename: `image-${Date.now()}`,
          url: payload.image || payload.url || payload.dataUrl || ''
        }
      });
    }

    if (path.endsWith('/notifications/subscribe') && httpMethod === 'POST') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      return json(200, { success: true, message: 'Notifications enabled for beta preview' });
    }

    if (path.endsWith('/notifications/unsubscribe') && httpMethod === 'POST') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      return json(200, { success: true, message: 'Notifications disabled for beta preview' });
    }

    if (path.endsWith('/analyze-report') && httpMethod === 'POST') {
      const payload = JSON.parse(body || '{}');
      const classification = classifyPost(payload.description || '');
      return json(200, {
        category: classification.category,
        severity: classification.severity,
        urgency: classification.urgency,
        confidence: classification.liloClassification.confidence / 100,
        summary: classification.liloClassification.summary,
        recommendedAuthority: classification.postStatus === 'critical' ? 'Emergency Response Unit' : 'Sentinel Review Desk'
      });
    }

    if (path.endsWith('/reports/feed') && httpMethod === 'GET') {
      const reports = await loadReports();
      const filter = queryStringParameters?.filter || 'for-you';
      const filteredReports = filter === 'for-you' ? reports : reports;
      return json(200, await Promise.all(filteredReports.map(serializeReport)));
    }

    if (path.endsWith('/reports') && httpMethod === 'POST') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });

      const payload = JSON.parse(body || '{}');
      const classification = classifyPost(payload.description || '');
      const media = Array.isArray(payload.media) ? payload.media.filter((entry) => entry?.url && ['image', 'video', 'audio'].includes(entry?.type)) : [];
      const report = {
        id: `report-${Date.now()}`,
        description: payload.description || '',
        images: [...new Set([...(payload.images || []), ...media.filter((entry) => entry.type === 'image').map((entry) => entry.url)])],
        media,
        signalSource: payload.signalSource || 'social',
        createdAt: new Date().toISOString(),
        location: payload.location || { text: '', lat: null, lon: null },
        verificationStatus: 'pending',
        userId: user.id,
        likes: [],
        upvotes: [],
        downvotes: [],
        comments: [],
        sharesCount: 0,
        isLive: Boolean(payload.isLive),
        proofOfPresence: Boolean(payload.proofOfPresence),
        liveSessionId: payload.liveSessionId || '',
        ...classification,
        aiScore: classification.liloClassification.confidence
      };

      user.reputation.totalReports += 1;
      await saveUser(user);
      await saveReport(report);
      await refreshUserStanding(user.id);

      return json(201, {
        message: 'Report saved successfully',
        report: await serializeReport(report)
      });
    }

    if (path.includes('/reports/') && path.endsWith('/like') && httpMethod === 'POST') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      const reports = await loadReports();
      const reportId = path.split('/reports/')[1].split('/')[0];
      const report = reports.find((entry) => entry.id === reportId);
      if (!report) return json(404, { error: 'Report not found' });

      const liked = report.likes.includes(user.id);
      report.likes = liked ? report.likes.filter((entry) => entry !== user.id) : [...report.likes, user.id];
      await saveReport(report);
      await refreshUserStanding(report.userId);

      return json(200, {
        liked: !liked,
        likes: report.likes.length,
        report: await serializeReport(report)
      });
    }

    if (path.includes('/reports/') && path.endsWith('/share') && httpMethod === 'POST') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      const reports = await loadReports();
      const reportId = path.split('/reports/')[1].split('/')[0];
      const report = reports.find((entry) => entry.id === reportId);
      if (!report) return json(404, { error: 'Report not found' });
      report.sharesCount = (report.sharesCount || 0) + 1;
      await saveReport(report);
      await refreshUserStanding(report.userId);

      return json(200, {
        shares: report.sharesCount,
        report: await serializeReport(report)
      });
    }

    if (path.includes('/votes/') && path.endsWith('/upvote') && httpMethod === 'POST') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      const reports = await loadReports();
      const reportId = path.split('/votes/')[1].split('/')[0];
      const report = reports.find((entry) => entry.id === reportId);
      if (!report) return json(404, { error: 'Report not found' });

      report.downvotes = (report.downvotes || []).filter((entry) => entry !== user.id);
      report.upvotes = report.upvotes.includes(user.id)
        ? report.upvotes.filter((entry) => entry !== user.id)
        : [...report.upvotes, user.id];

      await saveReport(report);
      await refreshUserStanding(report.userId);
      return json(200, {
        upvotes: report.upvotes.length,
        downvotes: report.downvotes.length,
        validatedByViewer: report.upvotes.includes(user.id),
        downvotedByViewer: report.downvotes.includes(user.id)
      });
    }

    if (path.includes('/votes/') && path.endsWith('/downvote') && httpMethod === 'POST') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      const reports = await loadReports();
      const reportId = path.split('/votes/')[1].split('/')[0];
      const report = reports.find((entry) => entry.id === reportId);
      if (!report) return json(404, { error: 'Report not found' });

      report.upvotes = (report.upvotes || []).filter((entry) => entry !== user.id);
      report.downvotes = report.downvotes.includes(user.id)
        ? report.downvotes.filter((entry) => entry !== user.id)
        : [...report.downvotes, user.id];

      await saveReport(report);
      await refreshUserStanding(report.userId);
      return json(200, {
        upvotes: report.upvotes.length,
        downvotes: report.downvotes.length,
        validatedByViewer: report.upvotes.includes(user.id),
        downvotedByViewer: report.downvotes.includes(user.id)
      });
    }

    if (path.includes('/votes/') && path.endsWith('/verify') && httpMethod === 'POST') {
      const verifier = await getUserFromToken(headers);
      if (!verifier) return json(401, { error: 'Unauthorized' });
      if ((verifier.reputation?.trustScore || 0) < 70) return json(403, { error: 'Insufficient reputation to verify' });
      const reports = await loadReports();
      const users = await loadUsers();
      const reportId = path.split('/votes/')[1].split('/')[0];
      const report = reports.find((entry) => entry.id === reportId);
      if (!report) return json(404, { error: 'Report not found' });

      report.verificationStatus = 'verified';
      report.verifiedBy = verifier.id;
      report.verifiedAt = new Date().toISOString();

      await saveReport(report);
      const reporter = users.find((entry) => entry.id === report.userId);
      if (reporter) {
        reporter.reputation.verifiedReports = (reporter.reputation.verifiedReports || 0) + 1;
        await saveUser(reporter);
        await refreshUserStanding(reporter.id);
      }

      return json(200, { message: 'Report verified', report: await serializeReport(report) });
    }

    if (path.includes('/comments/') && httpMethod === 'POST') {
      const user = await getUserFromToken(headers);
      if (!user) return json(401, { error: 'Unauthorized' });
      const reports = await loadReports();
      const reportId = path.split('/comments/')[1];
      const report = reports.find((entry) => entry.id === reportId);
      if (!report) return json(404, { error: 'Report not found' });
      const payload = JSON.parse(body || '{}');
      const text = payload.comment || payload.text || '';
      const comment = {
        id: `comment-${Date.now()}`,
        reportId,
        text,
        createdAt: new Date().toISOString(),
        user: {
          id: user.id,
          name: user.name,
          avatar: user.avatar
        }
      };
      report.comments = [...(report.comments || []), comment];
      await saveReport(report);
      await refreshUserStanding(report.userId);
      return json(201, comment);
    }

    if (path.includes('/comments/') && httpMethod === 'GET') {
      const reports = await loadReports();
      const reportId = path.split('/comments/')[1];
      const report = reports.find((entry) => entry.id === reportId);
      if (!report) return json(404, { error: 'Report not found' });
      return json(200, report.comments || []);
    }

    if (path.endsWith('/map/reports') && httpMethod === 'GET') {
      const reports = await loadReports();
      const users = await loadUsers();
      const features = reports
        .filter((report) => report.liloClassification?.isClimateRelated && report.postStatus !== 'regular' && report.location?.lat != null && report.location?.lon != null)
        .map((report) => {
          const author = users.find((user) => user.id === report.userId);
          return {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [report.location.lon, report.location.lat]
            },
            properties: {
              id: report.id,
              category: report.category,
              severity: report.severity,
              urgency: report.urgency,
              postStatus: report.postStatus,
              createdAt: report.createdAt,
              trustScore: author?.reputation?.trustScore || 0,
              verifiedReporter: author?.verifiedReporter || false,
              aiScore: report.aiScore || 0,
              pulse: report.postStatus === 'critical',
              routedToCommand: report.liloClassification?.routedToCommand || false
            }
          };
        });

      return json(200, { type: 'FeatureCollection', features });
    }

    if (path.endsWith('/map/pulse') && httpMethod === 'POST') {
      return json(200, { success: true, message: 'Pulse registered' });
    }

    if (path.endsWith('/users/leaderboard') && httpMethod === 'GET') {
      const users = await loadUsers();
      return json(200, users.map((user) => serializeUser(user)).sort((a, b) => (b.reputation?.trustScore || 0) - (a.reputation?.trustScore || 0)));
    }

    return json(404, { error: 'Endpoint not found', path });
  } catch (error) {
    console.error('Netlify API error:', error);
    return json(500, { error: 'Internal server error', message: error.message });
  }
}
