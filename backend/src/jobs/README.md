# Scheduled jobs

Put background tasks here, for example:

- `noShowJob.js` (Task 6): every 5 minutes, find shifts with no check-in 30 minutes after start.
- `evaluateRounds.js` (Task 8): when a round window ends, run the anomaly rules.

A simple way to run a function every few minutes is `setInterval`. The `node-cron` package is a nicer option.
Start jobs from `src/server.js`, not from `app.js`, so tests do not start timers.
