import { openDB } from 'idb';

const DB_NAME = 'econet_db';
const POSTS_QUEUE_STORE_NAME = 'posts_queue';

async function createDb() {
  const db = await openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(POSTS_QUEUE_STORE_NAME);
    },
  });
  return db;
}

export const dbPromise = createDb();
