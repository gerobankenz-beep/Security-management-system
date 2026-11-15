// Background jobs for hosting without a long-running server (Vercel).
// An outside timer (cron-job.org) calls GET /api/v1/jobs/tick every minute with the secret.
const express = require('express');
const { markNoShows } = require('../attendance/noshow');
const { evaluateEndedRounds } = require('../anomaly/anomaly.service');

const router = express.Router();

router.get('/jobs/tick', async (req, res, next) => {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.get('authorization') !== `Bearer ${secret}`) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not allowed' } });
    }
    const no_shows = await markNoShows();
    const rounds = await evaluateEndedRounds();
    res.json({ data: { no_shows, rounds } });
  } catch (err) { next(err); }
});

module.exports = router;
