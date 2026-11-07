// Builds the Express app. server.js starts it; tests import it without starting a port.
const express = require('express');
const cors = require('cors');
const { query } = require('./config/db');
const asyncHandler = require('./middleware/asyncHandler');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health check: handy to confirm the server and database are up. No login needed.
app.get('/api/v1/health', asyncHandler(async (req, res) => {
  await query('SELECT 1');
  res.json({ data: { status: 'ok', time: new Date().toISOString() } });
}));

app.use('/api/v1', require('./modules'));

app.use(notFoundHandler);
app.use(errorHandler); // must be last

module.exports = app;
