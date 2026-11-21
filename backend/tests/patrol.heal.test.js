// A scan on a roster that has no rounds yet builds them and attaches to the right round. No database: the database is faked.
const { test } = require('node:test');
const assert = require('node:assert');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://fake:fake@localhost:5432/fake';

let roundLookups = 0; let roundsExist = false; const stored = [];
const fakeDb = {
  pool: { connect: async () => { throw new Error('not used'); } },
  query: async (sql, params) => {
    if (sql.includes('SELECT guard_id, round_id, validation_status')) return { rows: [] };
    if (sql.includes('FROM shifts sh JOIN rosters r')) {
      return { rows: [{ id: 1, roster_id: 9, start_at: new Date('2026-11-17T17:00:00Z'), end_at: new Date('2026-11-18T05:00:00Z'), site_id: 5 }] };
    }
    if (sql.includes('FROM checkpoints WHERE tag_code')) return { rows: [{ id: 11, site_id: 5, is_active: true }] };
    if (sql.includes('FROM patrol_rounds pr JOIN route_checkpoints')) { roundLookups += 1; return { rows: roundsExist ? [{ id: 77 }] : [] }; }
    if (sql.includes('INSERT INTO scans')) { stored.push(params); return { rows: [] }; }
    throw new Error(`unexpected query: ${sql.slice(0, 60)}`);
  },
};
require.cache[require.resolve('../src/config/db')] = { id: 'db', filename: 'db', loaded: true, exports: fakeDb };

const rosterService = require('../src/modules/roster/roster.service');
const patrol = require('../src/modules/patrol/patrol.service');
const scan = { client_scan_id: '3f2b8c1e-5d4a-4b7e-9a1c-2d3e4f5a6b7c', shift_id: 1, tag_code: 'TAG-1', scanned_at: '2026-11-17T20:10:00Z' };

test('a scan with no round builds the missing rounds and attaches to the new round', async () => {
  const calls = [];
  rosterService.ensureRounds = async (rosterId, opts) => { calls.push([rosterId, opts]); roundsExist = true; return 4; };
  const { result, roundId } = await patrol.processScan({ id: 4 }, scan);
  assert.strictEqual(result.status, 'accepted');
  assert.strictEqual(result.round_id, 77);
  assert.strictEqual(roundId, 77);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], 9);
  assert.strictEqual(roundLookups, 2);
  assert.strictEqual(stored[0][4], 77);   // round_id saved with the scan
});

test('if no rounds can be built the scan is still stored, without a round', async () => {
  roundLookups = 0; roundsExist = false; stored.length = 0;
  rosterService.ensureRounds = async () => 0;
  const { result } = await patrol.processScan({ id: 4 }, { ...scan, client_scan_id: '4a3b9d2f-6e5b-4c8f-8b2d-3e4f5a6b7c8d' });
  assert.strictEqual(result.status, 'accepted');
  assert.strictEqual(result.round_id, null);
  assert.strictEqual(roundLookups, 1);    // no pointless second lookup
  assert.strictEqual(stored.length, 1);
});
