// Builds the patrol rounds that are missing from rosters that are already published, then attaches the scans that were saved
// without a round and re-checks those rounds for flags. Safe to repeat.
//
//   node scripts/rebuild-rounds.js                       DRY RUN: shows what would happen, saves nothing
//   node scripts/rebuild-rounds.js --apply               really does it
//   node scripts/rebuild-rounds.js --since=2026-11-10    only shifts that end on or after this day (default: 7 days ago)
//
// It uses DATABASE_URL from backend\.env, so point that at the database you mean (local or hosted) before you run it.
const { pool, query } = require('../src/config/db');
const rosterService = require('../src/modules/roster/roster.service');
const patrol = require('../src/modules/patrol/patrol.service');
const anomaly = require('../src/modules/anomaly/anomaly.service');

const apply = process.argv.includes('--apply');
const sinceArg = (process.argv.find((a) => a.startsWith('--since=')) || '').slice(8);
const notBefore = sinceArg ? new Date(`${sinceArg}T00:00:00+03:00`) : new Date(Date.now() - 7 * 24 * 3600 * 1000);
if (Number.isNaN(notBefore.getTime())) { console.error('--since must look like 2026-11-10'); process.exit(1); }

(async () => {
  const rosters = (await query(
    `SELECT r.id, s.name AS site, to_char(r.week_start, 'YYYY-MM-DD') AS week_start,
            (SELECT count(*) FROM patrol_rounds pr JOIN shifts sh ON sh.id = pr.shift_id WHERE sh.roster_id = r.id) AS rounds_now
       FROM rosters r JOIN sites s ON s.id = r.site_id WHERE r.status = 'published' ORDER BY r.id`)).rows;
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${rosters.length} published rosters, shifts ending on or after ${notBefore.toISOString()}\n`);

  let total = 0;
  for (const r of rosters) {
    let made;
    if (apply) made = await rosterService.ensureRounds(r.id, { notBefore });
    else {
      // Dry run: build the rounds inside a transaction and throw them away.
      const client = await pool.connect();
      try { await client.query('BEGIN'); made = await rosterService.createRounds(client, r.id, { notBefore }); } finally { await client.query('ROLLBACK'); client.release(); }
    }
    total += made;
    console.log(`roster ${r.id}  ${r.site}  week ${r.week_start}: ${r.rounds_now} rounds now, ${made} ${apply ? 'added' : 'would be added'}`);
  }

  const orphans = (await query("SELECT count(*) AS n FROM scans WHERE round_id IS NULL AND validation_status = 'accepted'")).rows[0].n;
  console.log(`\nRounds ${apply ? 'added' : 'that would be added'}: ${total}`);
  console.log(`Accepted scans with no round right now: ${orphans}`);

  if (apply) {
    const rounds = await patrol.relinkOrphanScans({ since: notBefore });
    for (const id of rounds) await anomaly.evaluateRound(id, new Date());
    const left = (await query("SELECT count(*) AS n FROM scans WHERE round_id IS NULL AND validation_status = 'accepted'")).rows[0].n;
    console.log(`Scans attached to ${rounds.length} rounds, which were re-checked for flags. Scans still without a round: ${left}`);
  } else {
    console.log('\nNothing was saved. Run again with --apply to do it.');
  }
  await pool.end();
})().catch((err) => { console.error(err.message); process.exit(1); });
