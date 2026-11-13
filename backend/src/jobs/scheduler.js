// Background jobs, run every minute while the server is running:
//   - mark shifts nobody checked in for as no-show
//   - give rounds whose time window has ended their final check (missed checkpoints, final status)
// Started from server.js only, so tests never start timers.
const { markNoShows } = require('../modules/attendance/noshow');
const { evaluateEndedRounds } = require('../modules/anomaly/anomaly.service');

function start(intervalMs = 60000) {
  let running = false;
  const tick = async () => {
    if (running) return;            // never run two ticks at once
    running = true;
    try {
      const noShows = await markNoShows();
      const rounds = await evaluateEndedRounds();
      if (noShows || rounds) console.log(`[jobs] no-shows marked: ${noShows}, ended rounds checked: ${rounds}`);
    } catch (err) {
      console.error('[jobs] failed:', err.message);
    } finally { running = false; }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}

module.exports = { start };
