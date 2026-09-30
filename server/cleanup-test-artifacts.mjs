/**
 * Test-artifact cleanup (operator tool).
 *
 * Removes ONLY artifacts that were positively identified as test/demo/seed
 * data during the production-readiness audit. Genuine user data is never
 * touched: the real accounts (George's accounts), the marketplace catalog,
 * and community records are explicitly excluded.
 *
 * DRY RUN by default — prints exactly what would be removed.
 * Apply with:  node server/cleanup-test-artifacts.mjs --apply
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '.env') });

const APPLY = process.argv.includes('--apply');

// Reports confirmed as demo/seed content (fire-in-jos duplicates, "Green
// Tomorrow" demo posts, Jabi Lake demo posts, Calabar test report).
const TEST_REPORT_IDS = [
  '69a7a5af069c3c0b8c993a06',
  '69aae2f9e59d5c0f5c5f0200',
  '69aeb9e6d401dabae439ac85',
  '69aebbbad4be0daae04af820',
  '69aebc63d4be0daae04af823',
  '69aebcdeda9f97dc37aa0131',
  '69aebd9c1e71197c98a6e823',
  '69aebe490c89374f7624aded',
  '69aebf339b186a2b4d3ffdb5',
  '69d94447a43d872528f4b9b9',
  '69d94457a43d872528f4b9bf',
  '69d9445ca43d872528f4b9c5',
  '69d9e1cea43d872528f4b9fb',
  '69d9e20da43d872528f4ba01',
  '69d9e283a43d872528f4ba07',
  '6ab7c3b7851ca8085e07bbdb',
  '6ab7c3d7851ca8085e07bbfd'
];

// Test accounts created by earlier verification passes. The real accounts
// (george@econet.io, godwingeorge.contact@gmail.com, geogodwin007@gmail.com)
// are NOT in this list and must never be added.
const TEST_USER_EMAILS = [
  'test@example.com',
  'demo@econet.com',
  'usera_verify@econet.io',
  'userb_verify@econet.io',
  'usera_x1@econet.io',
  'userb_x1@econet.io',
  'prod.test.455547874@econet.dev'
];

// Missions seeded by the DEV seeder + the persistence-verification mission.
const TEST_MISSION_TITLE_MATCH = [
  'Clean the Jabi Lake Shoreline',
  'Usuma Reservoir Flood Monitoring',
  'Atlas Persistence Verification Mission'
];

try {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 45000 });
  const db = mongoose.connection.db;

  const reportIds = TEST_REPORT_IDS.map(id => new mongoose.Types.ObjectId(id));
  const reports = await db.collection('reports').find({ _id: { $in: reportIds } }, { projection: { content: 1, description: 1 } }).toArray();
  const users = await db.collection('users').find({ email: { $in: TEST_USER_EMAILS } }, { projection: { email: 1, name: 1 } }).toArray();
  const missions = await db.collection('canonical_missions').find({ title: { $in: TEST_MISSION_TITLE_MATCH } }, { projection: { missionId: 1, title: 1, status: 1 } }).toArray();
  const missionIds = missions.map(m => m.missionId);
  const comments = await db.collection('comments').countDocuments({ report: { $in: reportIds } });
  const testOrders = await db.collection('marketplace_orders').find({ 'customer.email': 'prod.test.455547874@econet.dev' }, { projection: { orderId: 1, status: 1 } }).toArray();

  console.log(`\n─── ${APPLY ? 'APPLYING' : 'DRY RUN'} ───`);
  console.log(`reports  : ${reports.length} (of ${TEST_REPORT_IDS.length} listed)`);
  console.log(`users    : ${users.length} → ${users.map(u => u.email).join(', ')}`);
  console.log(`missions : ${missions.length} → ${missions.map(m => `${m.title} [${m.status}]`).join(' | ')}`);
  console.log(`comments : ${comments} attached to those reports`);
  console.log(`orders   : ${testOrders.length} test orders → ${testOrders.map(o => o.orderId).join(', ')}`);

  if (!APPLY) {
    console.log('\nDry run only — nothing was modified. Re-run with --apply to remove these artifacts.\n');
  } else {
    const r1 = await db.collection('reports').deleteMany({ _id: { $in: reportIds } });
    const r2 = await db.collection('comments').deleteMany({ report: { $in: reportIds } });
    const r3 = await db.collection('votes').deleteMany({ report: { $in: reportIds } }).catch(() => ({ deletedCount: 0 }));
    const r4 = await db.collection('users').deleteMany({ email: { $in: TEST_USER_EMAILS } });
    const r5 = await db.collection('canonical_missions').deleteMany({ title: { $in: TEST_MISSION_TITLE_MATCH } });
    const r6 = await db.collection('marketplace_orders').deleteMany({ 'customer.email': 'prod.test.455547874@econet.dev' });
    if (missionIds.length) {
      await db.collection('canonical_idempotency_keys').deleteMany({ key: { $regex: 'dev-seed|dev-activate' } }).catch(() => {});
    }
    console.log('\nRemoved:');
    console.log(` reports   ${r1.deletedCount}`);
    console.log(` comments  ${r2.deletedCount}`);
    console.log(` votes     ${r3.deletedCount}`);
    console.log(` users     ${r4.deletedCount}`);
    console.log(` missions  ${r5.deletedCount}`);
    console.log(` orders    ${r6.deletedCount}`);
    console.log('');
  }
} catch (err) {
  console.error('[cleanup] Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
