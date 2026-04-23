/**
 * EcoNet IO Offline-First: IndexedDB store for pending reports.
 * Uses idb for a simple Promise-based API. Same DB/store name is used
 * by the service worker (sw.js) for the sync loop.
 */
import { openDB } from 'idb';

const DB_NAME = 'econet-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending-reports';

/**
 * Opens the IndexedDB. Creates the pending-reports store on first run.
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

/**
 * Add a report to pending-reports with status 'sync-pending'.
 * Call this when navigator.onLine is false. Include token so the
 * service worker can authenticate when syncing.
 *
 * @param {Object} payload - Report payload (description, location, images, analysis, token, etc.)
 * @returns {Promise<number>} ID of the stored record
 */
export async function addPendingReport(payload) {
  const db = await getDB();
  const record = {
    ...payload,
    status: 'sync-pending',
    createdAt: Date.now(),
  };
  return db.add(STORE_NAME, record);
}

/**
 * Get all pending reports (status sync-pending) for the sync loop.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllPendingReports() {
  const db = await getDB();
  const list = await db.getAll(STORE_NAME);
  return list.filter((r) => r.status === 'sync-pending');
}

/**
 * Remove a pending report after successful sync.
 * @param {number} id - Record id (keyPath)
 */
export async function removePendingReport(id) {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export { DB_NAME, STORE_NAME };
