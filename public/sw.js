/**
 * EcoNet IO Service Worker: push notifications + offline sync.
 * Sync event for tag "sync-reports": reads pending-reports from IndexedDB
 * and POSTs each to the backend (analyze then save), then removes from IDB.
 */
const DB_NAME = 'econet-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-reports';
const API_BASE = 'http://localhost:5000';

// Existing push and notification handlers
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  self.registration.showNotification(data.title || 'EcoNet IO', {
    body: data.body || '',
    icon: data.icon || '/logo192.png',
    badge: data.badge || '/badge.png',
    data: data.data || {}
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});

// Background Sync: when sync-reports fires, drain pending-reports and POST to API
self.addEventListener('sync', event => {
  if (event.tag !== 'sync-reports') return;
  event.waitUntil(syncPendingReports());
});

function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

function getAllPending(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const list = (req.result || []).filter(r => r.status === 'sync-pending');
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

function deletePending(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function syncPendingReports() {
  let db;
  try {
    db = await openIDB();
  } catch (e) {
    console.error('Sync: could not open IndexedDB', e);
    return;
  }

  let pending;
  try {
    pending = await getAllPending(db);
  } catch (e) {
    console.error('Sync: could not read pending reports', e);
    db.close();
    return;
  }

  for (const record of pending) {
    const { id, description, location, images = [], token } = record;
    try {
      const analyzeRes = await fetch(`${API_BASE}/analyze-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: `${description} Location: ${location}` })
      });
      if (!analyzeRes.ok) {
        const errData = await analyzeRes.json().catch(() => ({}));
        console.error('Sync: analyze failed for pending report', id, errData);
        continue;
      }
      const analyzeData = await analyzeRes.json();

      const saveRes = await fetch(`${API_BASE}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          description,
          category: analyzeData.category,
          severity: analyzeData.severity,
          urgency: analyzeData.urgency,
          confidence: analyzeData.confidence,
          summary: analyzeData.summary,
          location: { text: location, city: (location || '').split(',')[0].trim(), state: '' },
          images: Array.isArray(images) ? images : []
        })
      });

      if (saveRes.ok) {
        await deletePending(db, id);
      } else {
        const errData = await saveRes.json().catch(() => ({}));
        console.error('Sync: save failed for pending report', id, errData);
      }
    } catch (err) {
      console.error('Sync: network error for pending report', id, err);
    }
  }

  db.close();
}
