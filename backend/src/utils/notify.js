// Creates in-app notifications. Every module can call this with one line.
const { query } = require('../config/db');

async function notify(userIds, type, message, link = null) {
  for (const userId of new Set(userIds)) {
    await query('INSERT INTO notifications (user_id, type, message, link) VALUES ($1, $2, $3, $4)', [userId, type, message, link]);
  }
}

module.exports = { notify };
