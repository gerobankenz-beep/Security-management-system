// Records "who did what" in the audit_logs table. Call it after important changes.
const { query } = require('../config/db');

async function writeAudit({ userId = null, action, entityType, entityId = null, details = null }) {
  await query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, entityType, entityId, details ? JSON.stringify(details) : null]
  );
}

module.exports = { writeAudit };
